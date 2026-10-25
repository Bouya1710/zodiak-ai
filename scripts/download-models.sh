#!/usr/bin/env bash
# Télécharge les poids depuis leurs sources officielles (Hugging Face). Vous acceptez leurs licences (docs/LICENCES.md).
# ⚠ Les URL ci-dessous n'ont pas pu être vérifiées depuis l'environnement de développement (réseau restreint) :
#   si un téléchargement échoue, cherchez le fichier du même nom sur la page du dépôt indiqué.
# Usage : scripts/download-models.sh [vram12|vram16|vram24]   (défaut : vram24)
set -euo pipefail
PROFILE="${1:-vram24}"
DEST="${MODELS_DIR:-$(dirname "$0")/../models}"
mkdir -p "$DEST"/{checkpoints,diffusion_models,text_encoders,vae,upscale_models,unet,clip,loras}
get() { # url destination
  [ -s "$2" ] && { echo "déjà présent : $2"; return; }
  echo "→ $2"; curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}
HF=https://huggingface.co
WAN="$HF/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"
get "$WAN/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" "$DEST/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors"
get "$WAN/vae/wan2.2_vae.safetensors" "$DEST/vae/wan2.2_vae.safetensors"
get "$WAN/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" "$DEST/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
if [ "$PROFILE" = vram12 ]; then
  get "$HF/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_K_S.gguf" "$DEST/unet/flux1-schnell-Q4_K_S.gguf"
  get "$HF/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" "$DEST/clip/t5xxl_fp8_e4m3fn.safetensors"
  get "$HF/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" "$DEST/clip/clip_l.safetensors"
  get "$HF/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" "$DEST/vae/ae.safetensors"   # peut exiger d'accepter les conditions sur Hugging Face
else
  get "$HF/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors" "$DEST/checkpoints/flux1-schnell-fp8.safetensors"
fi
echo "Real-ESRGAN (facultatif) : placez RealESRGAN_x4plus.pth dans $DEST/upscale_models/ (BSD-3, dépôt xinntao/Real-ESRGAN)."
echo "Terminé. Lancez ensuite : GENERATION_BACKEND=comfyui docker compose --profile gpu up"
