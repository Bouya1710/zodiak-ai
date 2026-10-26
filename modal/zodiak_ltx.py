"""ZODIAK AI — LTX-2.5 (Lightricks) sur Modal, image de début + image de fin, version « distillée » rapide.

Application séparée de zodiak_gpu.py : LTX-2.5 est en accès restreint sur Hugging Face, il lui faut un secret
Modal « huggingface » (HF_TOKEN) que Wan n'utilise pas. Licence LTX-2.x Community : usage commercial gratuit
sous 10 M$ de chiffre d'affaires annuel.

  modal run modal/zodiak_ltx.py::prepare
  modal run modal/zodiak_ltx.py::test --start debut.png [--end fin.png] --prompt "..." --out sortie.mp4
"""
import io
import time

import modal

LTX_REPO = "Lightricks/LTX-2.5-Diffusers"
LTX_DIR = "/models/ltx25-diffusers"
DIFFUSERS_SHA = "74a2fddea5060391cca123e36d55bccb887630f7"  # main du 26/10/2026 : LTX-2.5 pas encore dans une version publiée
FPS = 24
SIZES = {"720p": (1280, 704), "480p": (832, 480)}  # multiples de 32 exigés par LTX
SCALEDOWN = 60

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "torch==2.8.0", "torchvision==0.23.0", f"diffusers @ git+https://github.com/huggingface/diffusers@{DIFFUSERS_SHA}", "transformers>=5,<6",
        "accelerate>=1.10", "sentencepiece", "imageio[ffmpeg]", "av", "pillow", "huggingface_hub>=1.0",
    )
    .env({"HF_HOME": "/models/hf"})
)
models = modal.Volume.from_name("zodiak-models", create_if_missing=True)
app = modal.App("zodiak-ltx", image=image)


@app.function(volumes={"/models": models}, secrets=[modal.Secret.from_name("huggingface")], memory=16 * 1024, cpu=4, timeout=2 * 3600)
def prepare():
    """Télécharge LTX-2.5 (bf16, déjà au bon format) dans le volume partagé."""
    from huggingface_hub import snapshot_download

    t0 = time.time()
    snapshot_download(LTX_REPO, local_dir=LTX_DIR)
    models.commit()
    print(f"prêt : {LTX_DIR} en {time.time() - t0:.0f} s")


def _img(data: bytes, w: int, h: int):
    from PIL import Image, ImageOps

    return ImageOps.fit(Image.open(io.BytesIO(data)).convert("RGB"), (w, h), Image.LANCZOS)


@app.cls(gpu="H100", volumes={"/models": models}, memory=100 * 1024, timeout=1800, scaledown_window=SCALEDOWN)
class Ltx:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import LTX2ConditionPipeline

        t0 = time.time()
        pipe = LTX2ConditionPipeline.from_pretrained(LTX_DIR, torch_dtype=torch.bfloat16)
        pipe.enable_model_cpu_offload()
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
            pipe.vae.enable_tiling()
        self.pipe = pipe
        self.load_s = time.time() - t0
        print(f"LTX-2.5 chargé en {self.load_s:.0f} s")

    @modal.method()
    def generate(self, start: bytes, prompt: str, end: bytes | None = None, negative: str = "",
                 resolution: str = "720p", seconds: float = 5.0, seed: int = 42) -> dict:
        import tempfile

        import torch
        from diffusers.pipelines.ltx2.pipeline_ltx2_condition import LTX2VideoCondition
        from diffusers.pipelines.ltx2.utils import DEFAULT_NEGATIVE_PROMPT, DISTILLED_SIGMA_VALUES
        from diffusers.utils import encode_video

        t0 = time.time()
        w, h = SIZES.get(resolution, SIZES["720p"])
        frames = int(round(seconds * FPS / 8)) * 8 + 1  # LTX veut 8k+1 images
        conditions = [LTX2VideoCondition(frames=_img(start, w, h), index=0, strength=1.0)]
        if end:
            conditions.append(LTX2VideoCondition(frames=_img(end, w, h), index=-1, strength=1.0))
        # Réglages « distillés » de la fiche officielle : peu d'étapes, sans guidage.
        video, audio = self.pipe(
            conditions=conditions, prompt=prompt, negative_prompt=negative or DEFAULT_NEGATIVE_PROMPT,
            width=w, height=h, num_frames=frames, frame_rate=float(FPS), sigmas=DISTILLED_SIGMA_VALUES,
            guidance_scale=1.0, stg_scale=0.0, modality_scale=1.0,
            audio_guidance_scale=1.0, audio_stg_scale=0.0, audio_modality_scale=1.0,
            generator=torch.Generator("cuda").manual_seed(seed), output_type="np", return_dict=False,
        )
        frames_u8 = torch.from_numpy((video * 255).round().astype("uint8"))
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            encode_video(frames_u8[0], fps=FPS, audio=audio[0].float().cpu() if audio is not None else None,
                         audio_sample_rate=self.pipe.vocoder.config.output_sampling_rate, output_path=f.name)
            data = open(f.name, "rb").read()
        gen_s = time.time() - t0
        print(f"vidéo {w}x{h}, {frames} images, {gen_s:.0f} s de calcul")
        return {"video": data, "gen_s": round(gen_s, 1), "load_s": round(self.load_s, 1), "frames": frames, "size": f"{w}x{h}"}


@app.local_entrypoint()
def test(start: str, prompt: str, out: str, end: str = "", resolution: str = "720p", seconds: float = 5.0, seed: int = 42):
    t0 = time.time()
    r = Ltx().generate.remote(open(start, "rb").read(), prompt, open(end, "rb").read() if end else None, "", resolution, seconds, seed)
    open(out, "wb").write(r["video"])
    print(f"écrit : {out} | {r['size']}, {r['frames']} images | chargement {r['load_s']} s, calcul {r['gen_s']} s, total {time.time() - t0:.0f} s")
