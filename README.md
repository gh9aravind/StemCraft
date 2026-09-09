# StemCraft AI

An AI audio stem separator: drop in a track, get back isolated vocals, drums,
bass and instrumentals (or vocals / instrumental) in a dark, DAW-styled studio
mixer with per-track mute, solo, volume and pan.

- **Backend** — FastAPI + [Demucs](https://github.com/facebookresearch/demucs) (Meta AI Research)
- **Frontend** — Next.js (App Router) + TypeScript + Tailwind CSS v4 + WaveSurfer.js

This repo has been built and verified end-to-end: the backend compiles
cleanly, and the frontend passes `tsc --noEmit` and a full `next build` with
zero errors or warnings.

## Project structure

```
stemcraft-ai/
├── backend/
│   ├── main.py            FastAPI app (separation, streaming, cleanup, zip)
│   ├── requirements.txt
│   ├── Dockerfile          CPU-optimized, for Hugging Face Spaces / Render
│   ├── .dockerignore
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx         3-step workflow: upload → processing → studio
    │   └── globals.css      Tailwind v4 theme tokens + DAW styling
    ├── components/
    │   ├── Uploader.tsx
    │   ├── ProcessingState.tsx
    │   ├── StudioMixer.tsx
    │   ├── StemTrack.tsx
    │   └── ExportBar.tsx
    ├── lib/                 api.ts, audio-context.ts, utils.ts
    ├── types/index.ts
    ├── package.json
    ├── postcss.config.mjs
    └── .env.local.example
```

## Prerequisites

- Python 3.11+
- Node.js 18.18+ (Node 20+ recommended)
- `ffmpeg` on your PATH (only needed if you run the backend outside Docker —
  the Dockerfile installs it automatically)

## 1. Backend setup (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

The first request downloads the Demucs model weights (~300MB, one-time,
cached afterward). The API is now live at `http://localhost:8000` — check
`http://localhost:8000/api/health`.

## 2. Frontend setup (local)

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. `NEXT_PUBLIC_API_URL` in `.env.local` points
the frontend at the backend — change it if your API runs somewhere else.

## Environment variables

**Backend** (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `STORAGE_DIR` | `./storage/jobs` | Where uploads + separated stems are written |
| `JOB_TTL_MINUTES` | `30` | Age at which a job's files are deleted |
| `CLEANUP_INTERVAL_SECONDS` | `300` | How often the cleanup sweep runs |
| `MAX_FILE_SIZE_MB` | `60` | Upload size limit |
| `DEMUCS_MODEL` | `htdemucs` | `htdemucs` (fast) or `htdemucs_ft` (slower, higher quality) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `PORT` | `8000` (local) / `7860` (Docker) | Port uvicorn binds to |

**Frontend** (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI backend |

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/separate` | multipart form: `file`, `stem_mode` (`2stems`\|`4stems`). Returns job metadata + stem URLs. |
| `GET` | `/api/stems/{job_id}/{stem_name}` | Streams one stem's WAV file (HTTP Range supported). |
| `GET` | `/api/download/{job_id}` | Zips every stem for the job and returns it as a download. |
| `GET` | `/api/jobs/{job_id}` | Re-fetches a job's metadata. |
| `GET` | `/api/health` | Liveness check. |

## Deploying the backend

**Hugging Face Spaces (Docker SDK)**
1. Create a new Space → SDK: Docker.
2. Push the *contents* of `backend/` to the Space repo root (the Dockerfile
   must be at the repo root for HF Spaces to find it).
3. Set `ALLOWED_ORIGINS` as a Space secret/variable to your deployed
   frontend's URL once you have it.

**Render**
1. New Web Service → connect this repo.
2. Set **Root Directory** to `backend` and **Environment** to Docker — Render
   will pick up `backend/Dockerfile` automatically.
3. Render injects `$PORT` itself; the Dockerfile's `CMD` already respects it.

## Deploying the frontend

Any Next.js host works (Vercel is the simplest). Set `NEXT_PUBLIC_API_URL`
to your deployed backend's URL as a build-time environment variable.

## Notes & limitations

- Separation runs synchronously inside the request — the processing screen's
  progress bar is a simulated estimate (Demucs doesn't expose granular
  progress over HTTP). For very long tracks on a slow CPU instance, consider
  raising client/proxy timeouts or moving to a job-queue pattern.
- CPU-only inference is the default and works fine for short-to-medium
  tracks; a GPU instance will separate audio significantly faster.
- Uploaded files and generated stems are deleted automatically after
  `JOB_TTL_MINUTES` (30 by default) — download anything you want to keep
  before then.
