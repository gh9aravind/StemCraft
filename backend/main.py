"""
StemCraft AI — Backend API
---------------------------
A FastAPI service that wraps Demucs (Meta AI Research) to split an uploaded
track into isolated stems (vocals / drums / bass / other, or vocals /
instrumental), streams the results back with HTTP range support, and
automatically deletes job data after a configurable TTL.
"""

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

load_dotenv()

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage/jobs")).resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

JOB_TTL_MINUTES = int(os.getenv("JOB_TTL_MINUTES", "30"))
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "300"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "60"))
DEMUCS_MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
DEMUCS_TIMEOUT_SECONDS = int(os.getenv("DEMUCS_TIMEOUT_SECONDS", "900"))

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac"}
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

STEM_LABELS = {
    "vocals": "Vocals",
    "drums": "Drums",
    "bass": "Bass",
    "other": "Other",
    "instrumental": "Instrumental",
}
STEM_ORDER = ["vocals", "drums", "bass", "other", "instrumental"]

JOB_ID_RE = re.compile(r"^[a-f0-9-]{36}$")
STEM_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")


def stem_sort_key(name: str) -> int:
    try:
        return STEM_ORDER.index(name)
    except ValueError:
        return len(STEM_ORDER)


# --------------------------------------------------------------------------
# Background cleanup — deletes job folders older than JOB_TTL_MINUTES
# --------------------------------------------------------------------------

def cleanup_old_jobs() -> None:
    if not STORAGE_DIR.exists():
        return
    cutoff = time.time() - JOB_TTL_MINUTES * 60
    for job_dir in STORAGE_DIR.iterdir():
        if not job_dir.is_dir():
            continue
        try:
            if job_dir.stat().st_mtime < cutoff:
                shutil.rmtree(job_dir, ignore_errors=True)
                print(f"[cleanup] removed expired job {job_dir.name}")
        except FileNotFoundError:
            continue


async def cleanup_loop() -> None:
    while True:
        try:
            cleanup_old_jobs()
        except Exception as exc:  # never let a cleanup error kill the loop
            print(f"[cleanup] error: {exc}")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_old_jobs()
    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# --------------------------------------------------------------------------
# App setup
# --------------------------------------------------------------------------

app = FastAPI(title="StemCraft AI API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def validate_job_id(job_id: str) -> str:
    if not JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    return job_id


def validate_stem_name(stem_name: str) -> str:
    if not STEM_NAME_RE.match(stem_name):
        raise HTTPException(status_code=400, detail="Invalid stem name")
    return stem_name


def job_dir_for(job_id: str) -> Path:
    """Resolves a job's directory while guarding against path traversal."""
    candidate = (STORAGE_DIR / job_id).resolve()
    if candidate != STORAGE_DIR and STORAGE_DIR not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid job id")
    return candidate


def read_metadata(job_id: str) -> dict:
    d = job_dir_for(job_id)
    meta_path = d / "metadata.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Job not found or has expired")
    return json.loads(meta_path.read_text())


def get_audio_duration(path: Path) -> Optional[float]:
    try:
        import torchaudio

        info = torchaudio.info(str(path))
        return round(info.num_frames / info.sample_rate, 2)
    except Exception as exc:
        print(f"[metadata] duration extraction failed: {exc}")
        return None


def get_audio_bpm(path: Path) -> Optional[float]:
    try:
        import librosa

        y, sr = librosa.load(str(path), sr=None, mono=True, duration=90)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
        if tempo_value <= 0:
            return None
        return round(tempo_value, 1)
    except Exception as exc:
        print(f"[metadata] bpm extraction failed: {exc}")
        return None


def run_demucs(input_path: Path, output_dir: Path, stem_mode: str) -> Path:
    """Runs the Demucs CLI in a subprocess and returns the folder holding the stems."""
    device = "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            device = "cuda"
    except Exception:
        pass

    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", DEMUCS_MODEL,
        "-o", str(output_dir),
        "-d", device,
    ]
    if device == "cpu":
        workers = max(1, min(4, os.cpu_count() or 1))
        cmd.extend(["--jobs", str(workers)])
    if stem_mode == "2stems":
        cmd.extend(["--two-stems", "vocals"])
    cmd.append(str(input_path))

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=DEMUCS_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        print(f"[demucs] stdout: {result.stdout[-2000:]}")
        print(f"[demucs] stderr: {result.stderr[-2000:]}")
        raise RuntimeError("Demucs separation failed. See server logs for details.")

    track_name = input_path.stem
    stems_dir = output_dir / DEMUCS_MODEL / track_name
    if not stems_dir.exists():
        raise RuntimeError("Demucs did not produce the expected output directory.")
    return stems_dir


def range_requests_response(request: Request, file_path: Path, content_type: str) -> StreamingResponse:
    """Streams a file with HTTP Range support so <audio>/WaveSurfer can seek efficiently."""
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    def iter_file(start: int, end: int, chunk_size: int = 1024 * 1024):
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(end - start + 1),
                "Content-Type": content_type,
            }
            return StreamingResponse(iter_file(start, end), status_code=206, headers=headers)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": content_type,
    }
    return StreamingResponse(iter_file(0, file_size - 1), status_code=200, headers=headers)


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "model": DEMUCS_MODEL}


@app.post("/api/separate")
async def separate_audio(file: UploadFile = File(...), stem_mode: str = Form(...)):
    if stem_mode not in ("2stems", "4stems"):
        raise HTTPException(status_code=400, detail="stem_mode must be '2stems' or '4stems'")

    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    job_id = str(uuid.uuid4())
    job_dir = STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    input_path = job_dir / f"input{ext}"
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    size = 0
    try:
        with open(input_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max size is {MAX_FILE_SIZE_MB}MB.",
                    )
                out_file.write(chunk)
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    duration = get_audio_duration(input_path)
    bpm = get_audio_bpm(input_path)

    output_root = job_dir / "output"
    try:
        stems_dir = await asyncio.to_thread(run_demucs, input_path, output_root, stem_mode)
    except subprocess.TimeoutExpired:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=504, detail="Separation timed out. Try a shorter track.")
    except RuntimeError as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc))

    # Normalize demucs' internal naming so the public API never leaks it.
    if stem_mode == "2stems" and (stems_dir / "no_vocals.wav").exists():
        (stems_dir / "no_vocals.wav").rename(stems_dir / "instrumental.wav")

    stems = []
    wav_files = sorted(stems_dir.glob("*.wav"), key=lambda p: stem_sort_key(p.stem))
    for wav_file in wav_files:
        name = wav_file.stem
        final_path = job_dir / f"{name}.wav"
        shutil.move(str(wav_file), str(final_path))
        stems.append({
            "name": name,
            "label": STEM_LABELS.get(name, name.title()),
            "url": f"/api/stems/{job_id}/{name}",
        })

    shutil.rmtree(output_root, ignore_errors=True)

    if not stems:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="No stems were produced.")

    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(minutes=JOB_TTL_MINUTES)

    metadata = {
        "job_id": job_id,
        "stem_mode": stem_mode,
        "original_filename": original_name,
        "duration": duration,
        "bpm": bpm,
        "stems": stems,
        "created_at": created_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    (job_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

    return JSONResponse(metadata)


@app.get("/api/stems/{job_id}/{stem_name}")
async def stream_stem(job_id: str, stem_name: str, request: Request):
    validate_job_id(job_id)
    validate_stem_name(stem_name)
    d = job_dir_for(job_id)
    file_path = d / f"{stem_name}.wav"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stem not found or job has expired")
    return range_requests_response(request, file_path, "audio/wav")


@app.get("/api/download/{job_id}")
async def download_all(job_id: str):
    validate_job_id(job_id)
    metadata = read_metadata(job_id)
    d = job_dir_for(job_id)

    zip_path = d / "stems.zip"
    if not zip_path.exists():
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for stem in metadata["stems"]:
                wav_path = d / f"{stem['name']}.wav"
                if wav_path.exists():
                    zf.write(wav_path, arcname=f"{stem['name']}.wav")

    filename = f"stemcraft_{job_id[:8]}.zip"
    return FileResponse(path=zip_path, media_type="application/zip", filename=filename)


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    validate_job_id(job_id)
    return read_metadata(job_id)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "7860"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
