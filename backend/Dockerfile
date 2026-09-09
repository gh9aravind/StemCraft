# StemCraft AI — backend Dockerfile
# Optimized for Hugging Face Spaces (Docker SDK) and Render (CPU instances).
#
# Hugging Face Spaces: push the CONTENTS of this backend/ folder to the
# root of your Space repo (the Dockerfile must live at the repo root).
# Render: set "Root Directory" to `backend` in the service settings.

FROM python:3.11-slim

# ffmpeg + libsndfile are required by torchaudio/soundfile/librosa to decode
# mp3, m4a and flac files.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only torch/torchaudio wheels first. This keeps the image a
# few GB smaller than the default CUDA-enabled wheels, which matters on
# free-tier CPU-only hosting (HF Spaces free tier, Render).
RUN pip install --no-cache-dir \
    torch==2.11.0 torchaudio==2.11.0 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download the Demucs model weights at build time so the container's
# first real request isn't stuck downloading ~300MB of model checkpoints.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

# Hugging Face Spaces (Docker SDK) always routes traffic to port 7860.
# Render injects its own $PORT at runtime — the shell form CMD below
# respects whichever is set, defaulting to 7860 if neither is provided.
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
