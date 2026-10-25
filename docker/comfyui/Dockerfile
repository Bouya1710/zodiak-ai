# ComfyUI headless pour le mode GPU local. ⚠ Non construit pendant le développement (pas de Docker ni de GPU).
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg && rm -rf /var/lib/apt/lists/*
ARG COMFYUI_REF=master
RUN git clone https://github.com/comfyanonymous/ComfyUI /comfyui && cd /comfyui && git checkout ${COMFYUI_REF} \
    && pip install --no-cache-dir -r requirements.txt
# Nœud GGUF requis uniquement pour GPU_PROFILE=vram12
RUN git clone https://github.com/city96/ComfyUI-GGUF /comfyui/custom_nodes/ComfyUI-GGUF \
    && pip install --no-cache-dir -r /comfyui/custom_nodes/ComfyUI-GGUF/requirements.txt
WORKDIR /comfyui
EXPOSE 8188
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
