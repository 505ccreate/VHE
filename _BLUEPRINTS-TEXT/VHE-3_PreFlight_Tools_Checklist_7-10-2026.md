> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `VHE-3_PreFlight_Tools_Checklist_7-10-2026.docx` on 2026-07-19 13:05 Eastern Daylight Time.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

Correction Studio — Pre-Flight Tools & Downloads Checklist
Stage all of this BEFORE writing app code. Nothing here is optional — the execution plan assumes it's already installed.

Runtime / Infrastructure
Node.js 22 LTS + pnpm
Python 3.11
Redis 7 (job queue)
Postgres 16 (database)
MinIO (local S3-compatible storage for dev) — or a real S3/R2 bucket for prod
FFmpeg 7.x static build + ffprobe — pin the exact binary in the repo/vendor folder. Do NOT rely on whatever ffmpeg the operating system already has installed.

Backend Packages — Node/TypeScript
fastify (API server)
bullmq (job queue)
ioredis
pg
drizzle-orm
zod (schema validation)
@aws-sdk/client-s3
sharp (image processing)
ws (websockets)
undici
ulid

Backend Packages — Python (AI workers)
torch (CUDA build matching your GPU driver — skip CUDA build if going API-only)
sam2 (Meta's repo) + sam2.1_hiera_large.pt checkpoint — mask tracking across video frames
ProPainter (repo + weights) — video inpainting / object removal
RIFE v4.x (repo + weights) — frame interpolation
Real-ESRGAN + RealESRGAN_x4plus.pth weights — upscaling
CodeFormer (repo + weights) — face restoration
insightface + buffalo_l model pack — face identity embeddings
opencv-python-headless
fastapi
redis (python client)
PySceneDetect (scenedetect) — scene-cut detection

Frontend Packages
react 19 / next 15
zustand (state management)
konva + react-konva (canvas engine)
@radix-ui (UI primitives)
framer-motion (use sparingly)
wavesurfer.js (audio waveform display)
comlink (web workers)
mp4box.js (WebCodecs demuxing for frame-accurate video scrubbing)

Hosted API Fallbacks (write these adapters early — lets the app run with zero local GPU)
fal.ai adapter — covers SAM2/ProPainter/RIFE/ESRGAN equivalents without local hardware
Replicate adapter — same purpose, second option for redundancy/fallback routing
At least two image-gen/inpaint providers connected (whichever you already use)
At least two video-gen providers connected (whichever you already use)

Fonts
Chosen display face (headings/empty states) — must be licensed or self-hosted
Chosen UI face (body/interface text) — must be licensed or self-hosted
JetBrains Mono (OFL license, free) — for timecodes/frame numbers

Dev / QA Tools
Playwright — end-to-end testing for the editor UI
vitest — unit testing

Test Fixtures to Build Yourself (Week 1 — this is the project's real test suite)
These aren't downloads — build/gather these deliberately-broken media files, because every core feature gets validated against them:

A still image with a visibly wrong hand (extra/missing fingers)
A ~15 second clip where a face visibly degrades partway through
A clip at 29.97fps (i.e. 30000/1001), at least 300 frames long — this catches frame-math bugs
A variable-frame-rate clip (e.g. straight off a phone camera)
A video with no audio track at all
A clip encoded with a long keyframe interval (e.g. every 250 frames) — this catches frame-seek bugs
A still image with garbled/unreadable logo or text on it

Decision That Changes This List
Whether you run local GPU hardware or launch API-only (hosted fallbacks) changes whether the CUDA build of torch and the five local AI model weights above are needed on day one, or whether you can skip straight to the fal.ai/Replicate adapters and add local hardware later. This is one of the six open decisions in the vision doc — settle it before you spend money or time on GPU-specific downloads.
