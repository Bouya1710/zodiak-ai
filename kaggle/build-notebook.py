# Construit kaggle/zodiak-vitrine.ipynb à partir de scripts/showcase-clips.mjs (prompts de la vitrine).
# Usage : python3 kaggle/build-notebook.py
import json, pathlib, re, subprocess

root = pathlib.Path(__file__).resolve().parent.parent
clips = json.loads(subprocess.check_output(
    ['node', '-e', "import('./scripts/showcase-clips.mjs').then(m=>console.log(JSON.stringify({v:m.VERSION,c:m.CLIPS})))"],
    cwd=root, text=True))

def code(src): return {'cell_type': 'code', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': src.strip('\n') + '\n'}
def md(src): return {'cell_type': 'markdown', 'metadata': {}, 'source': src.strip('\n') + '\n'}

CLIPS = [{'id': c['id'], 'title': c['title'], 'portrait': c['size'] == 'portrait_16_9',
          'prompt': f"{c['image']}. {c['motion']}."} for c in clips['c']]

cells = [
md(f"""
# ZODIAK AI — vidéos de la vitrine (v{clips['v']})
Modèle : **Wan 2.2 T2V A14B** (Apache-2.0), quantifié GGUF Q4_K_M, accéléré par **Wan2.2-Lightning** (4 étapes).
Réglages Kaggle : *Accelerator* = **GPU T4 x2** (ou P100), *Internet* = **On**. Puis **Run All**.
Chaque clip terminé est écrit dans `/kaggle/working/out/` : si la session s'arrête, relancer reprend où elle en était.
À la fin, télécharger **`zodiak-vitrine.zip`** dans l'onglet *Output*.
"""),
code("""
# 1. Installation (2 à 3 min)
!pip install -q -U "diffusers>=0.35" transformers accelerate gguf ftfy peft imageio imageio-ffmpeg sentencepiece
"""),
code(f"""
# 2. Liste des clips (générée depuis scripts/showcase-clips.mjs)
CLIPS = {json.dumps(CLIPS, ensure_ascii=False, indent=1)}
NEGATIVE = "blurry, low quality, distorted face, deformed hands, extra limbs, text, watermark, logo, static image, flicker"
TEST_ONLY = False   # True : un seul clip court pour vérifier que tout marche
"""),
code("""
# 3a. Textes -> vecteurs (UMT5 sur CPU en bfloat16 : en float16 il déborde ; ≈ 1 min par prompt)
import gc, os, glob, torch
os.environ.setdefault('HF_HOME', '/tmp/hf')
from huggingface_hub import snapshot_download, hf_hub_download
from diffusers import WanPipeline, WanTransformer3DModel, AutoencoderKLWan, GGUFQuantizationConfig
from diffusers.utils import export_to_video
# Seulement les petits dossiers : les poids complets (≈ 120 Go) sont remplacés par les GGUF.
BASE = snapshot_download('Wan-AI/Wan2.2-T2V-A14B-Diffusers', allow_patterns=['*.json', 'tokenizer/*', 'text_encoder/*', 'vae/*', 'scheduler/*'])
enc = WanPipeline.from_pretrained(BASE, transformer=None, transformer_2=None, vae=None, torch_dtype=torch.bfloat16)
EMB = {}
with torch.no_grad():
    for c in (CLIPS[:1] if TEST_ONLY else CLIPS):
        e, _ = enc.encode_prompt(c['prompt'], do_classifier_free_guidance=False, device='cpu', dtype=torch.bfloat16)
        EMB[c['id']] = e.to(torch.float16)
        print('texte prêt', c['id'])
del enc; gc.collect()
"""),
code("""
# 3b. Modèle vidéo : Wan 2.2 A14B GGUF Q4_K_M + Lightning 4 étapes
DT = torch.float16  # T4/P100 : pas de bfloat16 natif
GGUF = 'QuantStack/Wan2.2-T2V-A14B-GGUF'
q = GGUFQuantizationConfig(compute_dtype=DT)
t1 = WanTransformer3DModel.from_single_file(hf_hub_download(GGUF, 'HighNoise/Wan2.2-T2V-A14B-HighNoise-Q4_K_M.gguf'), quantization_config=q, config=BASE, subfolder='transformer', torch_dtype=DT)
t2 = WanTransformer3DModel.from_single_file(hf_hub_download(GGUF, 'LowNoise/Wan2.2-T2V-A14B-LowNoise-Q4_K_M.gguf'), quantization_config=q, config=BASE, subfolder='transformer_2', torch_dtype=DT)
vae = AutoencoderKLWan.from_pretrained(BASE, subfolder='vae', torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(BASE, transformer=t1, transformer_2=t2, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=DT)
LORA, LDIR = 'lightx2v/Wan2.2-Lightning', 'Wan2.2-T2V-A14B-4steps-lora-250928'
pipe.load_lora_weights(LORA, weight_name=f'{LDIR}/high_noise_model.safetensors', adapter_name='hi')
pipe.load_lora_weights(LORA, weight_name=f'{LDIR}/low_noise_model.safetensors', adapter_name='lo', load_into_transformer_2=True)
pipe.vae.enable_tiling()
pipe.enable_model_cpu_offload()
print('Modèle vidéo prêt')
"""),
code("""
# 4. Génération (≈ 5 à 12 min par clip sur T4)
import time
os.makedirs('/kaggle/working/out', exist_ok=True)
todo = CLIPS[:1] if TEST_ONLY else CLIPS
for c in todo:
    path = f"/kaggle/working/out/{c['id']}.mp4"
    if os.path.exists(path):
        print('déjà fait', c['id']); continue
    w, h = (480, 832) if c['portrait'] else (832, 480)
    t0 = time.time()
    frames = pipe(prompt_embeds=EMB[c['id']].to('cuda'), width=w, height=h,
                  num_frames=33 if TEST_ONLY else 81, num_inference_steps=4, guidance_scale=1.0, guidance_scale_2=1.0,
                  generator=torch.Generator('cpu').manual_seed(1000 + int(c['id'][1:]))).frames[0]
    export_to_video(frames, path, fps=16)
    gc.collect(); torch.cuda.empty_cache()
    print(f"{c['id']} {c['title']} OK en {time.time() - t0:.0f} s")
"""),
code("""
# 5. Aperçu du dernier clip
from IPython.display import Video
done = sorted(glob.glob('/kaggle/working/out/*.mp4'))
print(len(done), 'clips :', [os.path.basename(p) for p in done])
Video(done[-1], embed=True, width=480) if done else None
"""),
code("""
# 6. Archive à télécharger (onglet Output)
!cd /kaggle/working && rm -f zodiak-vitrine.zip && zip -q -j zodiak-vitrine.zip out/*.mp4 && ls -lh zodiak-vitrine.zip
"""),
]
nb = {'cells': cells, 'metadata': {'kernelspec': {'name': 'python3', 'display_name': 'Python 3', 'language': 'python'},
      'language_info': {'name': 'python'}, 'kaggle': {'accelerator': 'nvidiaTeslaT4', 'isInternetEnabled': True}},
      'nbformat': 4, 'nbformat_minor': 5}
out = root / 'kaggle' / 'zodiak-vitrine.ipynb'
out.write_text(json.dumps(nb, ensure_ascii=False, indent=1))
print('écrit', out, len(CLIPS), 'clips')
