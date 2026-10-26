"""ZODIAK AI — moteur GPU sur Modal (modèles libres ; Modal offre 30 $ de calcul par mois sur l'offre Starter).

Modèle : Wan 2.2 I2V A14B (Apache-2.0) accéléré par Wan2.2-Lightning (4 étapes), image de début + image de fin facultative.
Facturation à la seconde ; le GPU s'éteint seul après SCALEDOWN secondes sans travail.

Mise en place (une fois) :
  modal run modal/zodiak_gpu.py::prepare     # télécharge les poids et enregistre une copie bf16 (CPU, ≈ 64 Go de mémoire)
  modal secret create zodiak-modal ZODIAK_MODAL_TOKEN=<jeton>   # jeton partagé avec le site (variable Vercel)
  modal deploy modal/zodiak_gpu.py           # crée les adresses web /submit et /status
Test sans le site :
  modal run modal/zodiak_gpu.py::test --start debut.png [--end fin.png] --prompt "..." --out sortie.mp4
"""
import hmac
import io
import os
import time

import modal
from fastapi import Header  # aussi installé en local : modal importe ce fichier avant l'envoi

APP = "zodiak-gpu"
WAN_REPO = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
WAN_BF16 = "/models/wan22-i2v-a14b-bf16"
LIGHTNING_REPO = "lightx2v/Wan2.2-Lightning"
LIGHTNING_DIR = "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1"
SCALEDOWN = 60
FPS = 16
SIZES = {"720p": (1280, 720), "480p": (832, 480)}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.8.0", "diffusers==0.42.0", "transformers>=5,<6", "accelerate>=1.10", "peft>=0.17",
        "ftfy", "sentencepiece", "imageio[ffmpeg]", "pillow", "requests", "huggingface_hub>=1.0", "fastapi[standard]",
    )
    .env({"HF_HOME": "/models/hf"})
)
models = modal.Volume.from_name("zodiak-models", create_if_missing=True)
app = modal.App(APP, image=image)


@app.function(volumes={"/models": models}, memory=64 * 1024, cpu=4, timeout=3 * 3600)
def prepare():
    """Copie bf16 de Wan 2.2 (≈ 69 Go au lieu de 126), composant par composant pour limiter la mémoire, puis Lightning."""
    import shutil

    import torch
    from diffusers import WanTransformer3DModel
    from huggingface_hub import hf_hub_download, snapshot_download

    t0 = time.time()
    for f in ("high_noise_model.safetensors", "low_noise_model.safetensors"):
        hf_hub_download(LIGHTNING_REPO, f"{LIGHTNING_DIR}/{f}")
    # Petites parties (déjà au bon format : texte bf16, VAE fp32 recommandé) copiées telles quelles.
    snapshot_download(WAN_REPO, local_dir=WAN_BF16, allow_patterns=["model_index.json", "scheduler/*", "tokenizer/*", "text_encoder/*", "vae/*"])
    for sub in ("transformer", "transformer_2"):
        dest = f"{WAN_BF16}/{sub}"
        if os.path.exists(f"{dest}/config.json"):
            continue
        src = snapshot_download(WAN_REPO, allow_patterns=[f"{sub}/*"])
        m = WanTransformer3DModel.from_pretrained(src, subfolder=sub, torch_dtype=torch.bfloat16)
        m.save_pretrained(dest, max_shard_size="5GB")
        del m
        shutil.rmtree(f"{src}/{sub}", ignore_errors=True)  # la copie fp32 n'est plus utile
        models.commit()
        print(f"{sub} converti en bf16 ({time.time() - t0:.0f} s)")
    models.commit()
    print(f"prêt : {WAN_BF16} en {time.time() - t0:.0f} s")


def _img(data: bytes, w: int, h: int):
    """Décode une image et la recadre au centre au format demandé."""
    from PIL import Image, ImageOps

    return ImageOps.fit(Image.open(io.BytesIO(data)).convert("RGB"), (w, h), Image.LANCZOS)


@app.cls(gpu="H100", volumes={"/models": models}, memory=100 * 1024, timeout=1800, scaledown_window=SCALEDOWN)
class Wan:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import WanImageToVideoPipeline

        t0 = time.time()
        pipe = WanImageToVideoPipeline.from_pretrained(WAN_BF16, torch_dtype=torch.bfloat16)
        pipe.vae.to(torch.float32)
        # Lightning : un LoRA par expert (bruit fort → transformer, bruit faible → transformer_2).
        pipe.load_lora_weights(LIGHTNING_REPO, weight_name=f"{LIGHTNING_DIR}/high_noise_model.safetensors", adapter_name="light_hi")
        pipe.load_lora_weights(LIGHTNING_REPO, weight_name=f"{LIGHTNING_DIR}/low_noise_model.safetensors",
                               adapter_name="light_lo", load_into_transformer_2=True)
        pipe.enable_model_cpu_offload()  # 2 experts de 28,6 Go + texte 11,4 Go : trop serré pour 80 Go avec les activations
        self.pipe = pipe
        self.load_s = time.time() - t0
        print(f"modèle chargé en {self.load_s:.0f} s")

    @modal.method()
    def generate(self, start: bytes, prompt: str, end: bytes | None = None, negative: str = "",
                 resolution: str = "720p", seconds: float = 5.0, seed: int = 42) -> dict:
        import tempfile

        import torch
        from diffusers.utils import export_to_video

        t0 = time.time()
        w, h = SIZES.get(resolution, SIZES["720p"])
        frames = int(round(seconds * FPS / 4)) * 4 + 1  # Wan veut 4k+1 images
        kw = dict(image=_img(start, w, h), prompt=prompt, negative_prompt=negative or None, height=h, width=w,
                  num_frames=frames, num_inference_steps=4, guidance_scale=1.0, guidance_scale_2=1.0,
                  generator=torch.Generator("cuda").manual_seed(seed))
        if end:
            kw["last_image"] = _img(end, w, h)
        video = self.pipe(**kw).frames[0]
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            export_to_video(video, f.name, fps=FPS)
            data = open(f.name, "rb").read()
        gen_s = time.time() - t0
        print(f"vidéo {w}x{h}, {frames} images, {gen_s:.0f} s de calcul")
        return {"video": data, "gen_s": round(gen_s, 1), "load_s": round(self.load_s, 1), "frames": frames, "size": f"{w}x{h}"}


def _check(authorization: str | None):
    """Jeton dans l'en-tête Authorization (jamais dans l'adresse, qui finit dans les journaux)."""
    from fastapi import HTTPException

    expected = os.environ.get("ZODIAK_MODAL_TOKEN", "")
    got = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(got, expected):
        raise HTTPException(status_code=401, detail="jeton invalide")


def _fetch(url: str) -> bytes:
    """Télécharge une image depuis un lien signé (≤ 25 Mo), ou la décode si elle est intégrée (data:…)."""
    import base64

    import requests

    if url.startswith("data:"):  # image intégrée (tests, petites images) au lieu d'un lien
        data = base64.b64decode(url.split(",", 1)[1])
        if len(data) > 8 * 1024 * 1024:
            raise ValueError("image intégrée trop lourde (8 Mo max)")
        return data
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    if len(r.content) > 25 * 1024 * 1024:
        raise ValueError("image trop lourde (25 Mo max)")
    return r.content


@app.function(secrets=[modal.Secret.from_name("zodiak-modal")])
@modal.fastapi_endpoint(method="POST")
def submit(body: dict, authorization: str | None = Header(default=None)):
    """Corps : {model (wan22-lightning | ltx25), start_url?, end_url?, prompt, negative?, resolution?, seconds?, seed?} → {id}.
    Les images arrivent par lien signé : la limite de 4,5 Mo des fonctions Vercel ne s'applique pas."""
    _check(authorization)
    model = body.get("model", "wan22-lightning")
    if model not in ("wan22-lightning", "ltx25"):
        return {"error": f"modèle inconnu : {model}"}
    start = _fetch(body["start_url"]) if body.get("start_url") else None
    end = _fetch(body["end_url"]) if body.get("end_url") else None
    args = (start, body["prompt"], end, body.get("negative", ""), body.get("resolution", "720p"), float(body.get("seconds", 5)), int(body.get("seed", 42)))
    if model == "ltx25":
        # LTX-2.5 vit dans l'app « zodiak-ltx » (modal/zodiak_ltx.py) ; image de départ facultative (texte → vidéo).
        call = modal.Cls.from_name("zodiak-ltx", "Ltx")().generate.spawn(*args)
    else:
        if start is None:
            return {"error": "Wan demande une image de départ"}
        call = Wan().generate.spawn(*args)
    return {"id": call.object_id}


@app.function(secrets=[modal.Secret.from_name("zodiak-modal")])
@modal.fastapi_endpoint(method="GET")
def status(id: str, authorization: str | None = Header(default=None)):
    """{state: pending | failed} ; une fois fini, renvoie la vidéo (video/mp4) avec les temps en en-têtes."""
    from fastapi import Response

    _check(authorization)
    try:
        out = modal.FunctionCall.from_id(id).get(timeout=0)
    except TimeoutError:
        return {"state": "pending"}
    except Exception as e:  # noqa: BLE001 — l'erreur du GPU est renvoyée telle quelle au site
        return {"state": "failed", "error": str(e)[:300]}
    return Response(content=out["video"], media_type="video/mp4", headers={"x-gen-seconds": str(out["gen_s"]), "x-load-seconds": str(out["load_s"])})


@app.local_entrypoint()
def test(start: str, prompt: str, out: str, end: str = "", resolution: str = "720p", seconds: float = 5.0, seed: int = 42):
    t0 = time.time()
    r = Wan().generate.remote(open(start, "rb").read(), prompt, open(end, "rb").read() if end else None, "", resolution, seconds, seed)
    open(out, "wb").write(r["video"])
    print(f"écrit : {out} | {r['size']}, {r['frames']} images | chargement {r['load_s']} s, calcul {r['gen_s']} s, total {time.time() - t0:.0f} s")
