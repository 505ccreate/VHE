> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx` on 2026-07-19 13:05 Eastern Daylight Time.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

Correction Studio — Builder Execution Plan v3
Sequenced work orders for AI builders · Do the steps in order · Every phase has an exit gate
v3 · July 17, 2026 — merges the 7-17 patch: adds §9.4 (Anomaly Auto-Detect), §9.5 (Chunked Repair Windows), §10.1 (Orchestrator Durability). Nothing from v2 removed.
§0 Rules of Engagement (read once, obey always)
Execute in order. Each work order lists its dependencies. Do not start a step whose dependencies haven’t passed their exit gate.
Copy the code blocks in this document verbatim. Where a block has // BUILDER: comments, those mark the only lines you adapt (paths, env names). Everything else ships as written.
Never invent an FFmpeg command. Every FFmpeg invocation in the entire product goes through the wrapper in §6. If a command you need isn’t in §6, stop and flag it — do not compose one.
All coordinates are normalized 0.0–1.0. All times are integer milliseconds. All frame indices are integers derived from ms + rational fps. Floating-point fps (29.97) never appears anywhere in code — only fps_num/fps_den (30000/1001).
IDs are ULIDs. Derived-artifact storage keys are deterministic (built from inputs), never random — this is what makes caching and idempotency work.
Stack: TypeScript (Fastify API + Node media workers), Python 3.11 (GPU/AI workers), Postgres 16, Redis 7 + BullMQ, S3-compatible object storage, Next.js/React frontend.
§1 Pre-Flight: download, pin, and verify BEFORE writing app code
Stage everything below, then run the verification script at the bottom of this section. Exit gate: verification script prints all-green.
Infrastructure
Node 22 LTS + pnpm · Python 3.11 · Redis 7 · Postgres 16 · MinIO (dev) or S3/R2 (prod)
FFmpeg 7.x static build + ffprobe, committed to the repo under /vendor/ffmpeg/ (or pulled by pinned checksum). Never use system ffmpeg.
Node packages (pin exact versions in lockfile): fastify · bullmq · ioredis · pg · drizzle-orm · zod · @aws-sdk/client-s3 · sharp · ws · undici · ulid
Python packages: torch (CUDA build matching your driver) · sam2 (Meta repo) + sam2.1_hiera_large.pt checkpoint · ProPainter repo + weights · RIFE v4.x repo + weights · Real-ESRGAN + RealESRGAN_x4plus.pth · CodeFormer + weights · insightface + buffalo_l pack · opencv-python-headless · mediapipe (pin version in lockfile) · fastapi · redis · scenedetect
Deployment note: the system MUST boot with zero local GPU. Every local model above also gets a hosted-API adapter (fal.ai / Replicate) registered under the same capability interface (§7). If LOCAL_GPU=false, the local provider simply doesn’t register.
Test fixtures (build in week 1 — this is the real test suite):
fixtures/bad_hand.png — AI image with 6-finger hand
fixtures/melted_face_15s.mp4 — clip with face degradation mid-clip
fixtures/ntsc_2997.mp4 — 29.97fps (30000/1001) clip, ≥ 300 frames — kills float-fps bugs
fixtures/vfr_phone.mp4 — variable-frame-rate phone capture
fixtures/no_audio.mp4 — silent video
fixtures/long_gop.mp4 — clip encoded with keyint=250 — kills seek-accuracy bugs
fixtures/garbled_text.png — AI image with unreadable logo text
fixtures/bad_hand_6s.mp4 — short clip containing a visibly wrong hand (video counterpart of bad_hand.png, used by §9.4)
Verification script (scripts/preflight.ts): must confirm (a) ffprobe binary responds with pinned version, (b) Postgres/Redis/S3 reachable, (c) each fixture probes successfully, (d) if LOCAL_GPU=true: SAM2 loads a checkpoint and segments a test image; RIFE interpolates two frames; ProPainter runs on a 10-frame sequence.
§2 Database Schema (single source of truth)
Run as migration 0001. The edit graph lives as JSONB on projects** — there is no separate edit-nodes table.** Masks belong to an asset (and optionally a project). Jobs belong to a project when project-scoped.
CREATE TABLE media_assets (
id TEXT PRIMARY KEY, – ulid
owner_id TEXT NOT NULL,
kind TEXT NOT NULL CHECK (kind IN (‘image’,‘video’,‘audio’)),
status TEXT NOT NULL DEFAULT ‘processing’
            CHECK (status IN ('uploading','processing','ready','failed')),
storage_key TEXT NOT NULL,
mime TEXT NOT NULL,
width INT,
height INT,
duration_ms INT,
fps_num INT, – exact rational fps
fps_den INT,
frame_count INT,
codec TEXT,
pix_fmt TEXT,
size_bytes BIGINT,
sha256 TEXT NOT NULL,
origin TEXT NOT NULL DEFAULT ‘upload’
            CHECK (origin IN ('upload','generated','derived','export')),
meta JSONB NOT NULL DEFAULT ‘{}’,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON media_assets (owner_id, kind, created_at DESC);
CREATE TABLE projects (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
title TEXT NOT NULL DEFAULT ‘Untitled’,
root_asset_id TEXT REFERENCES media_assets(id),
edit_graph JSONB NOT NULL DEFAULT ‘{“nodes”:[],“head”:null}’, – §11
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masks (
id TEXT PRIMARY KEY,
asset_id TEXT NOT NULL REFERENCES media_assets(id), – masks always bind to an asset
project_id TEXT REFERENCES projects(id), – nullable: library-level masks allowed
payload JSONB NOT NULL, – §5 MaskObject
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON masks (asset_id);
CREATE TABLE jobs (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
project_id TEXT REFERENCES projects(id),
type TEXT NOT NULL, – ‘ingest.probe’|‘generate.image’|‘inpaint.image’|‘track.mask’
                                -- |'repair.range'|'generate.segment'|'stitch'|'export'
status TEXT NOT NULL DEFAULT ‘queued’
               CHECK (status IN ('queued','running','awaiting_approval',                                 'succeeded','failed','canceled')),
progress REAL NOT NULL DEFAULT 0,
input JSONB NOT NULL,
output JSONB,
error_code TEXT, – machine-readable, from §4 taxonomy
error_detail TEXT,
provider_id TEXT,
cost_cents INT NOT NULL DEFAULT 0,
attempt INT NOT NULL DEFAULT 0,
idempotency_key TEXT UNIQUE,
parent_job_id TEXT REFERENCES jobs(id),
heartbeat_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON jobs (owner_id, status, created_at DESC);
CREATE INDEX ON jobs (project_id, created_at DESC);
CREATE TABLE lineage_edges (
id TEXT PRIMARY KEY,
child_asset_id TEXT NOT NULL REFERENCES media_assets(id),
parent_asset_id TEXT REFERENCES media_assets(id), – NULL for prompt-only roots
relation TEXT NOT NULL, – ‘generated_from_prompt’|‘inpainted_from’|‘segment_of’
                               -- |'stitched_from'|'exported_from'|'frame_of'
job_id TEXT REFERENCES jobs(id),
mask_id TEXT REFERENCES masks(id),
meta JSONB NOT NULL DEFAULT ‘{}’,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lineage_dedupe
ON lineage_edges (child_asset_id, relation, COALESCE(parent_asset_id, ’’));
CREATE INDEX ON lineage_edges (child_asset_id);
CREATE INDEX ON lineage_edges (parent_asset_id);
CREATE TABLE provider_connections (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
provider_slug TEXT NOT NULL,
label TEXT,
key_ciphertext BYTEA NOT NULL, – AES-256-GCM
key_nonce BYTEA NOT NULL, – 12-byte per-row nonce, never reused
kek_version INT NOT NULL, – which key-encryption-key encrypted this row
capabilities JSONB NOT NULL, – §7 manifest, refreshed on connect
is_default_for TEXT[] NOT NULL DEFAULT ‘{}’,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE budgets (
owner_id TEXT PRIMARY KEY,
cap_cents INT NOT NULL DEFAULT 0, – 0 = no cap
period_start DATE NOT NULL DEFAULT date_trunc(‘month’, now())::date
);
– spend is computed live: SUM(jobs.cost_cents) WHERE owner_id=? AND created_at >= period_start
Storage layout (deterministic):
media/{ownerId}/{assetId}/master.{ext}
media/{ownerId}/{assetId}/proxy_720.mp4
media/{ownerId}/{assetId}/filmstrip/{sec}.jpg
frames/{assetId}/{fpsNum}x{fpsDen}/{index:07d}.png
masks/{maskId}/{frameIndex:07d}.png – white = edit region
renders/{jobId}/… – TTL-cleaned after 7 days unless promoted
exports/{assetId}/{presetId}.{ext}
Derived artifacts become media_assets rows only when the user applies/keeps them.
§3 Work Order: Ingest & Probe (nothing works without this — build FIRST)
Every asset that enters the system (upload, generation output, derived render) passes through ingest.probe before its status becomes ready. Nothing downstream may run against an asset that isn’t ready.
Steps:
Client requests upload → API creates media_assets row (status=‘uploading’), issues presigned PUT.
Client confirms upload complete → API enqueues ingest.probe job.
Probe worker runs (verbatim):
ffprobe -v error -select_streams v:0 -count_frames
-show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,time_base
-show_entries format=duration,size -of json {input}
Parse r_frame_rate as the rational string it is (“30000/1001” → fps_num=30000, fps_den=1001). If r_frame_rate != avg_frame_rate, the source is VFR: immediately conform it with the wrapper’s conform recipe (§6.7) and treat the conformed copy as the working master (lineage edge relation=‘derived’, original kept). All frame math in this product assumes CFR.
Compute sha256, write all probe fields to the row.
For video: enqueue proxy + filmstrip generation (§6.6). Set status=‘ready’ only after probe fields are persisted (proxy can finish async).
Exit gate: all seven §1 fixtures ingest to ready with correct fps_num/fps_den/frame_count; the VFR fixture produces a conformed derived master.
§4 Work Order: Job Lifecycle (idempotency done correctly)
The critical rule the whole system hangs on: the idempotency claim happens at the API layer, BEFORE anything is enqueued. The worker never inserts job rows. This is what actually prevents double-billing when a client retries a request.
4.1 API-side claim (runs in the request handler)
// POST /jobs — client MUST send an Idempotency-Key header (ulid it generates once per user action)
export async function createJob(ownerId: string, projectId: string | null,
                            type: JobType, input: unknown, idemKey: string) {
// 0. Budget gate — BEFORE the claim
const spend = await db.periodSpendCents(ownerId);
const cap = await db.budgetCapCents(ownerId);
const est = estimateCostCents(type, input); // per-capability table, §7
if (cap > 0 && spend + est > cap) throw new ApiError(“BUDGET_EXCEEDED”, 402);
// 1. Claim-on-insert. Exactly one request wins; every retry gets the same job back.
const jobId = ulid();
const claimed = await db.query(
`INSERT INTO jobs (id, owner_id, project_id, type, status, input, idempotency_key) VALUES ($1,$2,$3,$4,'queued',$5,$6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,[jobId, ownerId, projectId, type, input, idemKey]);
if (claimed.rowCount === 0) {
// Someone already claimed this action — return the existing job, DO NOT enqueue again.return db.jobByIdempotencyKey(idemKey);
}
// 2. Only the winner enqueues. Queue payload carries the DB job id — nothing else is authoritative.
await queues[type].add(type, { jobId }, { jobId }); // BullMQ jobId dedupe = second safety net
return db.jobById(jobId);
}
4.2 Worker-side execution (verbatim skeleton for every worker)
new Worker(queueName, async (bull) => {
const { jobId } = bull.data;
// Optimistic transition: only ONE worker can move queued -> running.
const row = await db.query(
`UPDATE jobs SET status='running', attempt=attempt+1,                 heartbeat_at=now(), updated_at=now() WHERE id=$1 AND status IN ('queued','running')  -- 'running' allows takeover after stall   AND (status='queued' OR heartbeat_at < now() - interval '120 seconds') RETURNING *`, [jobId]);
if (row.rowCount === 0) return; // stale duplicate delivery — drop silently
const hb = setInterval(() =>
db.query(`UPDATE jobs SET heartbeat_at=now() WHERE id=$1`, [jobId]), 30_000);
try {
const result = await handlers[row.rows[0].type](row.rows[0], (p: number) =>  publishProgress(jobId, p));                     // §14 eventsawait db.query(  `UPDATE jobs SET status='succeeded', output=$2, progress=1,                   cost_cents=$3, provider_id=$4, updated_at=now() WHERE id=$1`,  [jobId, result.output, result.costCents ?? 0, result.providerId ?? null]);publishState(jobId, "succeeded");
} catch (e) {
const { code, retryable } = classifyError(e);     // §4.3if (retryable && row.rows[0].attempt < 3) throw e; // let BullMQ retry with backoffawait db.query(  `UPDATE jobs SET status='failed', error_code=$2, error_detail=$3, updated_at=now()   WHERE id=$1`, [jobId, code, String(e).slice(0, 2000)]);publishState(jobId, "failed");
} finally { clearInterval(hb); }
}, { connection: redis, concurrency: 4,
 settings: { backoffStrategy: (a) => Math.min(30_000, 1000 * 2 ** a) } });
4.3 Error taxonomy (machine codes — the UI switches on these, never on message strings)
code
retryable
meaning
PROVIDER_RATE_LIMIT
yes
429 from provider — backoff and retry
PROVIDER_TIMEOUT
yes
provider poll exceeded deadline
PROVIDER_REJECTED
no
provider refused input (content policy, bad params)
NO_PROVIDER
no
routing found no eligible connection for the capability
BUDGET_EXCEEDED
no
owner spend cap hit
MEDIA_CORRUPT
no
probe/decode failure on source
INTERNAL
yes ×1
anything unclassified
Exit gate: firing the same POST /jobs twice with one Idempotency-Key produces exactly one job row and one provider call (assert with a mock adapter that counts invocations). Killing a worker mid-job and restarting resumes via heartbeat takeover without a second bill.
§5 Work Order: Mask Format (one schema for every gesture)
Vector-first, normalized coordinates, rasterize only when a job needs pixels.
import { z } from “zod”;
import sharp from “sharp”;
export const NormPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export const MaskShape = z.discriminatedUnion(“t”, [
z.object({ t: z.literal(“rect”), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
z.object({ t: z.literal(“polygon”), points: z.array(NormPoint).min(3) }), // lasso/circle
z.object({ t: z.literal(“stroke”), points: z.array(NormPoint).min(2),
         radius: z.number().min(0).max(0.5) }),                                    // brush; radius normalized to WIDTH
z.object({ t: z.literal(“points”), include: z.array(NormPoint),
         exclude: z.array(NormPoint).default([]) }),                               // smart-tap -> SAM resolves to polygon
]);
export const MaskObject = z.object({
id: z.string(), assetId: z.string(),
mode: z.enum([“add”, “subtract”]).default(“add”),
shapes: z.array(MaskShape).min(1),
featherPx: z.number().int().min(0).max(200).default(12), // px at NATIVE resolution
keyFrame: z.number().int().nullable(), // video: frame user drew on
frameRange: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
tracked: z.boolean().default(false),
});
export type MaskObject = z.infer;
export async function rasterizeMask(m: MaskObject, W: number, H: number): Promise {
const px = ([x, y]: [number, number]) => ${x * W},${y * H};
const parts = m.shapes.map(s => {
switch (s.t) {  case "rect":    return `<rect x="${s.x*W}" y="${s.y*H}" width="${s.w*W}" height="${s.h*H}" fill="white"/>`;  case "polygon": return `<polygon points="${s.points.map(px).join(" ")}" fill="white"/>`;  case "stroke":  return `<polyline points="${s.points.map(px).join(" ")}" fill="none" stroke="white"                     stroke-width="${s.radius * 2 * W}" stroke-linecap="round" stroke-linejoin="round"/>`;  case "points":  throw new Error("points-mask must be resolved by SAM before rasterize");}
});
const svg = `
<rect width="100%" height="100%" fill="black"/>${parts.join("")}</svg>`;
let img = sharp(Buffer.from(svg)).ensureAlpha().greyscale();
if (m.featherPx > 0) img = img.blur(m.featherPx / 2); // sigma ~ feather/2
return img.png().toBuffer(); // white = edit region
}
Composition of multiple masks: iterate in creation order, add composites with blend lighten, subtract negates the layer then composites with multiply. Final output greyscale PNG, white = edit.
Exit gate: the same MaskObject rasterized at 1280×720 and 1920×1080 selects the same image region (IoU ≥ 0.99 after downscale-compare).
§6 Work Order: The FFmpeg Wrapper (the only place FFmpeg strings exist)
Build packages/media/ffmpeg.ts exporting exactly these recipes. Every recipe takes/returns typed arguments; nothing else in the codebase touches ffmpeg.
6.1 Frame ↔ time math (asymmetric on purpose)
// Frame n’s presentation start, rounded to nearest ms — for display and seek targets.
export const frameToMs = (n: number, num: number, den: number) =>
Math.round((n * 1000 * den) / num);
// “Which frame is on screen at time ms” — FLOOR with epsilon, never round.
// Round() here causes off-by-one at 29.97fps whenever ms sits past a frame’s midpoint.
export const msToFrame = (ms: number, num: number, den: number) =>
Math.floor((ms * num) / (1000 * den) + 1e-6);
Golden test (mandatory): for num/den in {24/1, 30000/1001, 25/1, 60000/1001}, assert msToFrame(frameToMs(n)) === n for every n in 0..10000.
6.2 True last frame
ffmpeg -y -sseof -1.0 -i {input} -map 0:v:0 -fps_mode passthrough -update 1 {out}.png
If the output is missing/zero-byte (some containers under-report tail), fall back to counting:
ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of json {input}
ffmpeg -y -i {input} -vf “select=eq(n,{N-1})” -fps_mode passthrough -frames:v 1 {out}.png
The fallback decodes the whole file — acceptable, it’s the correctness path.
6.3 Exact frame-range extraction [A..B] inclusive — timestamp-trim method
Do NOT input-seek and then count frames with select=eq(n,…). Fast seek lands on the nearest keyframe, which resets the frame counter at an unpredictable position — you will extract the wrong frames on long-GOP sources. The deterministic method: input-seek for speed, preserve original timestamps with -copyts, and trim by time, cutting at frame-midpoint boundaries so rounding can never grab a neighbor frame.
export function extractFrameRangeArgs(input: string, A: number, B: number,
                                  num: number, den: number, outDir: string): string[] {
const frameDurS = den / num;
const tStart = Math.max(0, (A - 0.5) * frameDurS); // midpoint before frame A
const tEnd = (B + 0.5) * frameDurS; // midpoint after frame B
const seekS = Math.max(0, tStart - 2); // coarse seek 2s early (keyframe-safe)
return [
"-ss", seekS.toFixed(6), "-i", input,"-copyts",                                             // keep original timestamps through the seek"-vf", `trim=start=${tStart.toFixed(6)}:end=${tEnd.toFixed(6)},setpts=PTS-STARTPTS`,"-fps_mode", "passthrough","-start_number", String(A),`${outDir}/%07d.png`,
];
}
Golden test: on fixtures/long_gop.mp4, extract [137..180], assert exactly 44 files and that file 0000137.png is pixel-identical to full-decode frame 137 (compare against a slow full-decode reference produced once per fixture).
6.4 Splice repaired frames back — keyframe-aware, honest about re-encoding
You cannot stream-copy a cut at an arbitrary frame; cuts are only lossless at keyframes. So: stream-copy everything OUTSIDE the enclosing keyframe span, re-encode only the span [K1..K2) that contains the repair. On typical GOPs that’s ≤ ~5s of re-encode regardless of clip length — this is how “untouched spans are never re-encoded” is actually kept.
Step 1 — find enclosing keyframes (msA/msB from §6.1):
ffprobe -v error -skip_frame nokey -select_streams v:0
-show_entries frame=pts_time -of csv=p=0 {input}
K1 = last keyframe time ≤ msA/1000 (or 0). K2 = first keyframe time > msB/1000 (or EOF).
Step 2 — cut the three pieces:
head: [0, K1) — lossless
ffmpeg -y -i {input} -to {K1} -c copy -avoid_negative_ts make_zero head.mp4 # skip if K1==0
tail: [K2, end) — lossless
ffmpeg -y -ss {K2} -i {input} -c copy -avoid_negative_ts make_zero tail.mp4 # skip if K2==EOF
Step 3 — rebuild the middle [K1, K2): extract its original frames (§6.3), overwrite indices [a..b] with the repaired PNGs, then encode:
ffmpeg -y -framerate {num}/{den} -start_number {firstMidFrame} -i mid_frames/%07d.png
-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p mid.mp4
Step 4 — concat video, then remap original audio untouched:
printf “file ‘head.mp4’‘mid.mp4’‘tail.mp4’” > list.txt
ffmpeg -y -f concat -safe 0 -i list.txt -c copy video_spliced.mp4
ffmpeg -y -i video_spliced.mp4 -i {input} -map 0:v:0 -map 1:a:0?
-c copy -movflags +faststart {output}.mp4
-map 1:a:0? — the ? makes the audio map optional, so silent sources export cleanly with zero audio tracks and no dummy encoders.
Golden tests: (1) splice with an unchanged frame set returns identical frame_count and bit-identical audio stream; (2) on fixtures/no_audio.mp4 output has zero audio tracks; (3) A/V sync drift at the tail < 1 frame duration.
6.5 Burst stitching (Path A / Path B)
Probe every segment; compare codec_name, profile, width, height, r_frame_rate, pix_fmt, time_base.
All identical → Path A lossless: ffmpeg -y -f concat -safe 0 -i list.txt -c copy stitched.mp4
Any mismatch → Path B normalize each offender first: ffmpeg -y -i seg.mp4 -vf “scale={W}:{H}:flags=lanczos,fps={fps},format=yuv420p” -c:v libx264 -preset medium -crf 18 -an norm.mp4 The burst orchestrator (§10) forces identical generation params per plan precisely so Path A wins.
6.6 Proxy, filmstrip, SAM prep
ffmpeg -y -i master -vf “scale=-2:720,fps=24,format=yuv420p” -c:v libx264 -crf 23 -preset veryfast -c:a aac proxy_720.mp4
ffmpeg -y -i proxy_720.mp4 -vf “fps=1,scale=-2:160” -start_number 0 -q:v 4 filmstrip/%d.jpg
SAM 2 input frames must be real JPEGs, quality ~95, numbered 0.jpg..N-1.jpg — SAM 2’s loader keys off the extension; renamed PNGs break it.
6.7 VFR conform (invoked by ingest when r_frame_rate ≠ avg_frame_rate)
ffmpeg -y -i {input} -vf “fps={num}/{den}” -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a copy conformed.mp4
Target fps = the source’s r_frame_rate rational. Record lineage; all editing runs on the conformed copy.
§7 Work Order: Provider Adapters & Capability Routing (BYOK, zero lock-in)
export type Capability =
| “image.t2i” | “image.i2i” | “image.inpaint” | “image.inpaint.identity_ref”
| “image.upscale”
| “video.t2v” | “video.i2v” | “video.inpaint” | “video.extend”;
export interface CapabilityManifest {
providerSlug: string;
capabilities: Partial<Record<Capability, {
maxWidth: number; maxHeight: number;fps?: number[]; minDurationSec?: number; maxDurationSec?: number;supportsSeed: boolean; supportsNegativePrompt: boolean;supportsMask: boolean; supportsReferenceImages: number;costHintCentsPerOp?: number;
}>>;
}
export interface GenRequest {
capability: Capability;
prompt: string; negativePrompt?: string; seed?: number;
width: number; height: number;
sourceImageKey?: string; maskKey?: string; referenceImageKeys?: string[];
durationSec?: number; fps?: number; initFrameKey?: string;
extra?: Record<string, unknown>;
}
export interface GenResult {
assetKeys: string[]; seedUsed?: number;
providerJobId?: string; costCents?: number; raw?: unknown;
}
export interface ProviderAdapter {
slug: string;
describeCapabilities(key: string): Promise;
submit(key: string, req: GenRequest): Promise<{ providerJobId: string } | { immediate: GenResult }>;
poll(key: string, providerJobId: string):
Promise<{ status: "running"; progress?: number }      | { status: "succeeded"; result: GenResult }      | { status: "failed"; error: string }>;
cancel?(key: string, providerJobId: string): Promise;
}
Routing: filter the owner’s connections to those whose manifest satisfies the request (capability present, dimensions/duration within limits, mask support if maskKey present), put the owner’s is_default_for choice first, and return the ordered chain. The worker walks the chain; each failure records error_code per connection and falls through. Empty chain → fail fast with NO_PROVIDER before any spend.
Cost estimation: estimateCostCents(type, input) reads costHintCentsPerOp from the chosen chain’s head; unknown → conservative per-capability defaults (config table, not code). The §4 budget gate uses this estimate; actual cost_cents is written from the adapter result.
Local models are just another provider. SAM 2 / ProPainter / RIFE / ESRGAN / CodeFormer register as an internal local-gpu connection with its own manifest when LOCAL_GPU=true. Hosted fal.ai/Replicate adapters cover the same capabilities otherwise. Routing stays uniform.
Exit gate: with two mock adapters (first always fails), a job routes, falls through, succeeds on the second, and the job row shows the second provider_id and its cost.
§8 Work Order: SAM 2 Mask Propagation (Python worker)
import torch, numpy as np, cv2
from sam2.build_sam import build_sam2_video_predictor
predictor = build_sam2_video_predictor(
"configs/sam2.1/sam2.1_hiera_l.yaml","checkpoints/sam2.1_hiera_large.pt",device="cuda" if torch.cuda.is_available() else "cpu")
def track(frames_dir: str, key_frame_local: int, seed_mask: np.ndarray, out_dir: str):
"""frames_dir: JPEG sequence 0.jpg..N-1.jpg (see §6.6). key_frame_local is theindex WITHIN this extracted range, not the absolute clip frame."""state = predictor.init_state(video_path=frames_dir)predictor.add_new_mask(state, frame_idx=key_frame_local, obj_id=1,                       mask=seed_mask.astype(bool))for reverse in (False, True):                      # forward then backward from the key frame    for f_idx, obj_ids, logits in predictor.propagate_in_video(            state, reverse=reverse, start_frame_idx=key_frame_local):        m = (logits[0] > 0.0).cpu().numpy().squeeze().astype(np.uint8) * 255        cv2.imwrite(f"{out_dir}/{f_idx:07d}.png", m)
The caller (Node) is responsible for the local↔absolute index translation: absolute = rangeStart + local. Store per-frame masks under masks/{maskId}/{absoluteIndex:07d}.png. Fallback when SAM 2 is unavailable and no hosted equivalent is connected: optical-flow warp (RAFT) of the key-frame mask — lower quality, still shippable.
§9 Work Order: Repair Pipelines
9.1 Image inpaint
Rasterize mask at asset resolution (§5), feathered.
Crop-inpaint-paste for large assets: crop source+mask to the mask’s bounding box
25% margin (clamped to provider maxWidth/Height); inpaint the crop; paste back under the feathered mask. Keeps quality up and cost down.
Compile the prompt: {user_instruction}. {auto_context}. Match the surrounding lighting, color grade, grain and perspective exactly. Seamless edges. Negative default: extra fingers, deformed hands, warped, blurry seam, duplicated features, text artifacts, watermark — user text always outranks the template on conflict.
Route image.inpaint (§7), request 2–4 candidates, composite each behind the mask, present before/after. Apply = append an edit-graph node (§11); pixels never destroyed.
9.2 Video repair over range [a..b]
Extract frames [a−4 .. b+4] (§6.3) — 4-frame pad for temporal context.
Track the mask (§8) → per-frame masks.
Choose the repair path by instruction type:
Removal / background fix → ProPainter over the range (temporally coherent by design). Default.
Content replacement → keyframe strategy: inpaint frames a, a+s, …, b (stride s = 4–6, always force b into the key set) with one fixed seed + shared reference; interpolate the repaired regions between keyframes with RIFE at t=(f−k1)/(k2−k1); composite ONLY inside the tracked masks: out[f] = frame[f]·(1−mask_f) + patch[f]·mask_f (feathered).
Provider video.inpaint if a connection advertises it → route there, skip local work.
Anti-flicker pass over repaired regions only: optical-flow-guided blend between adjacent repaired frames, alpha threshold ≈ 0.35.
Splice back (§6.4). Preview renders only [a−4 .. b+4] — never the whole clip.
9.3 Identity consistency (faces/characters)
On ingest/generation: face-detect + ArcFace/InsightFace embeddings on sampled frames; cluster → per-project Character Anchors (embedding + best reference crop).
“Keep her face consistent” → mask-track the face, repair with identity-conditioned inpainting if a provider supports image.inpaint.identity_ref; else CodeFormer restore + reference-guided inpaint. Verify: re-embed the repaired face; cosine similarity to the anchor must be ≥ 0.55 or auto-retry the next candidate.
Anchors also drive burst drift checks (§10).
§9.4 Work Order: Anomaly Auto-Detect (the scan job)
Purpose: find hallucinations before the user does. Everything in §9.1–9.3 assumes a human circles the problem. This section adds a job that scans a clip and produces suggested repair regions the user confirms with one tap — or that auto-repair when confidence is high and the user opted in.
New job type: analyze.scan (add to the jobs.type comment list in §2 — no schema change needed).
Dependencies: §3 ingest (asset must be ready), §6.6 proxy, §8 SAM worker environment (Python worker hosts this too).
9.4.1 Detection signals (run all four, fuse at the end)
The scan runs on the proxy (720p, 24fps) for speed; all output spans are converted back to master frame indices via §6.1 math against the proxy’s own fps. Never scan the master directly.
Signal A — Temporal discontinuity (flow residual). For each consecutive proxy frame pair (n, n+1): compute dense optical flow (RAFT if LOCAL_GPU=true, else OpenCV Farneback — both acceptable; record which in job output). Warp frame n forward by the flow; compute SSIM between the warped frame and the real frame n+1 in 32×32 blocks. A block whose SSIM drops > 2.5σ below that block’s rolling 24-frame mean is a discontinuity block.
Signal B — Face integrity. InsightFace detect + embed on every 4th proxy frame. Flag frames where: (a) face count changes without a scene cut, (b) embedding cosine distance to the project’s Character Anchor (§9.3) exceeds 0.45, or (c) landmark jitter between consecutive detections exceeds 3% of face bbox diagonal.
Signal C — Hand sanity. MediaPipe Hands on every 4th proxy frame, only inside person bboxes. Flag when landmark confidence is high but finger-tip count/topology is anatomically inconsistent across ≥ 3 consecutive samples, or when a hand bbox overlaps a Signal-A discontinuity block.
// BUILDER: add mediapipe to the Python worker requirements. Pin the version in the lockfile.
Signal D — Scene-cut suppression (false-positive killer). PySceneDetect (ContentDetector, threshold 27) over the proxy. Every real scene cut produces a legitimate Signal-A spike. Any detection within ±2 frames of a scene cut is discarded. This rule is not optional; without it the scanner flags every hard cut in the clip.
9.4.2 Fusion → suggested regions
For each frame: score = 0.5·A + 0.3·B + 0.2·C   (per-block for A; per-bbox for B/C)Merge frames with score ≥ T_low (default 0.35) into spans; close gaps ≤ 6 frames.Per span: union the flagged blocks/bboxes → one bounding rect + 15% margin, clamped to frame.Drop spans shorter than 3 frames.
Thresholds (T_low, T_auto, σ multipliers, anchor distance) live in a config table, not code — same rule as §7 cost defaults.
Output per span, written to jobs.output and persisted as a mask row:
{ startFrame, endFrame,            // MASTER frame indices (converted from proxy)  type: "discontinuity"|"face_drift"|"hand_anomaly"|"mixed",  confidence: 0..1,  suggestedMask: MaskObject }      // t:"rect" at the fused bbox, keyFrame = worst-scoring frame
Each suggested mask is inserted into masks with payload.suggested = true. The UI renders these as amber pulse-outlines on the timeline; tapping one pre-loads the mask + range into the normal §9.2 repair flow with a pre-filled Fix Bar hint (“possible hand anomaly, frames 141–167”).
Auto-repair path: if the project has autoFix=true AND confidence ≥ T_auto (default 0.75) AND type is hand_anomaly or face_drift, enqueue the §9.2 repair directly with the templated prompt for that type. discontinuity/mixed spans never auto-repair — always human-confirmed.
9.4.3 When the scan runs
Automatically after every generate.segment completes (burst mode), scoped to that segment — feeds the §10 checkpoint card alongside the existing drift check.
On demand: “Scan for problems” button on any ready video asset.
Never automatically on plain uploads (user’s own footage isn’t presumed broken).
Exit gate: on fixtures/melted_face_15s.mp4 the scan emits a face_drift span overlapping the known degradation range with IoU ≥ 0.5 · on fixtures/bad_hand.png’s video counterpart (fixture fixtures/bad_hand_6s.mp4, listed in §1) it emits a hand_anomaly span · on a clean clip containing 3 hard scene cuts it emits zero spans.

§9.5 Work Order: Chunked Repair Windows (long ranges, bounded memory)
Purpose: §9.2 repairs a range [a..b] as one operation. That is correct for ≤ ~2s ranges and wrong for long ones: memory grows with range length and one failure loses the whole run. Long ranges are processed as sequential overlapping windows with per-window checkpoints. Slow is fine; wrong is not.
Constants (config table): W = 48 frames per window · O = 8 frames overlap · pad stays 4 (§9.2).
9.5.1 Windowing rules
If (b − a + 1) ≤ W: run §9.2 exactly as written — this section does not apply.Else split [a..b] into windows: [a, a+W−1], [a+W−O, a+2W−O−1], … last window clamped to b.
One parent job (repair.range), one child job per window (parent_job_id set). The §4 lifecycle applies to every child unchanged — this is what makes resume free: killed mid-plan, restarted worker picks up at the first non-succeeded child. No new state machinery.
Idempotency key per child: {parentJobId}:win:{index} — deterministic, same pattern as §10 segments.
Seed and keys are global, not per-window: the §9.2 keyframe set {a, a+s, …, b} is computed ONCE on absolute indices by the parent before any window runs, stored in parent input. Every window inpaints only the keys that fall inside it, with the one fixed seed. This guarantees two adjacent windows share identical repaired keyframes at their boundary — the overlap can then never disagree at a key.
Mask tracking (§8) also runs windowed, but each window’s SAM init uses the previous window’s last output mask as its seed (frame a+kW−O mask carries forward). First window seeds from the user’s key frame as normal.
9.5.2 Overlap blending
In the O-frame overlap between window k and k+1, both windows produced repaired pixels. Blend inside the tracked mask only:
t = (f − overlapStart) / (O − 1)                    // 0..1 across the overlapout[f] = repaired_k[f]·(1−t) + repaired_k1[f]·t     // then composite via §9.2 rule as usual
Outside the mask, frames are untouched originals — no blend, no drift.
9.5.3 Memory ceiling
A window worker may hold at most W + 2·pad frames decoded in RAM at native resolution. If native W×H × that count exceeds 4 GB, the worker processes the window at proxy resolution for tracking and only decodes native frames one keyframe at a time for inpainting. // BUILDER: the 4 GB ceiling is an env var, not hardcoded.
Exit gate: a 300-frame repair on fixtures/ntsc_2997.mp4 completes as 7 windowed children under one parent · killing the worker after child 3 and restarting resumes at child 4 and produces the identical output file count · SSIM between window-k and window-k+1 repaired pixels across every overlap ≥ 0.98 · peak worker RSS stays under the configured ceiling.
§10 Work Order: Burst-Generation Orchestrator (fixed regen semantics)
export const SegmentPlan = z.object({
planJobId: z.string(), ownerId: z.string(), projectId: z.string(),
totalDurationSec: z.number().min(1).max(600),
segmentSec: z.number().min(2).max(15).default(3),
width: z.number().default(1280), height: z.number().default(720), fps: z.number().default(24),
globalPrompt: z.string(),
beats: z.array(z.object({ atSec: z.number(), prompt: z.string() })).default([]),
chainMode: z.enum([“last_frame”, “none”]).default(“last_frame”),
autoApprove: z.boolean().default(false),
seedLock: z.boolean().default(true),
});
export async function runBurstPlan(plan: SegmentPlan) {
const segCount = Math.ceil(plan.totalDurationSec / plan.segmentSec);
const baseSeed = plan.seedLock ? randomSeed() : undefined;
let initFrameKey: string | undefined;
for (let i = 0; i < segCount; i++) {
let attempt = 0, accepted = false;while (!accepted) {  // seedLock keeps the STYLE stable across segments, but every regen MUST vary the  // seed or it deterministically reproduces the rejected output. baseSeed + i*1000  // + attempt keeps segments distinct AND regens distinct.  const seed = baseSeed !== undefined ? baseSeed + i * 1000 + attempt : undefined;  const segJob = await createJob(plan.ownerId, plan.projectId, "generate.segment", {    parentJobId: plan.planJobId, index: i, attempt,    req: {      capability: initFrameKey ? "video.i2v" : "video.t2v",      prompt: compileSegmentPrompt(plan, i), seed,      width: plan.width, height: plan.height, fps: plan.fps,      durationSec: Math.min(plan.segmentSec, plan.totalDurationSec - i * plan.segmentSec),      initFrameKey,    },  }, `${plan.planJobId}:seg:${i}:try:${attempt}`);   // deterministic idempotency key  const seg = await awaitJob(segJob.id);  const lastFrameKey = await extractLastFrame(seg.assetKeys[0]);          // §6.2  const drift = await checkDrift(plan.projectId, lastFrameKey);           // §9.3 anchors  if (plan.autoApprove && !drift.flagged) {    await recordSegment(plan, i, seg, lastFrameKey);    initFrameKey = lastFrameKey; accepted = true; break;  }  await setJobStatus(segJob.id, "awaiting_approval", { drift, lastFrameKey });  const decision = await awaitUserDecision(segJob.id);   // approve | regen | fix  if (decision.kind === "regen") { attempt++; continue; }  if (decision.kind === "fix") {    // user repaired the seam frame with the normal §9 tools before it seeds segment i+1    await recordSegment(plan, i, seg, decision.repairedFrameKey, { seamRepaired: true });    await recordLineage({ childKey: decision.repairedFrameKey,      parentAssetKey: seg.assetKeys[0], relation: "frame_of",      meta: { repaired: true, planJobId: plan.planJobId, index: i } });    initFrameKey = decision.repairedFrameKey; accepted = true; break;  }  await recordSegment(plan, i, seg, lastFrameKey);       // approve  initFrameKey = lastFrameKey; accepted = true;}
}
await createJob(plan.ownerId, plan.projectId, “stitch”,
              { planJobId: plan.planJobId }, `${plan.planJobId}:stitch`);
}
Drift control at seams: (1) identity check against Character Anchors — below threshold flags the checkpoint card; (2) mild LAB-space histogram match of segment n+1’s first second to L(n); (3) optional 2–4 frame RIFE bridge when the cut is visible (off by default); (4) pass anchor crops as reference images to providers that support them.
Ripple-regen rule: regenerating segment k later invalidates the chain seed of k+1..end; the user explicitly chooses “keep downstream” or “re-chain downstream” — never silent.
Exit gate: a 30s plan at 3s segments produces 10 chained segments; forcing a mid-plan regen + a fix-then-continue yields correct lineage and a Path-A lossless stitch.
§10.1 Addendum: Orchestrator Durability (burst plans must survive restarts)
Problem: runBurstPlan (§10) is a long-lived in-process loop. A worker restart mid-plan strands the plan.
Fix — the plan’s authoritative state lives in the DB, not in the loop:
The plan job row (type='generate.segment' parent, i.e. the planJobId job) stores in its output after every accepted segment: { completedSegments: n, initFrameKey, baseSeed, attempts: {…} }. Written in the same transaction as recordSegment.
runBurstPlan becomes resumable: on entry it reads that state and starts the loop at i = completedSegments. The idempotency keys ({planJobId}:seg:{i}:try:{attempt}) already make replayed segment jobs no-ops — resume costs nothing and double-bills nothing. This is why §10’s deterministic keys existed; this addendum just cashes them in.
awaitUserDecision is implemented as a DB poll on the segment job row (status leaves awaiting_approval when the API writes the user’s decision into output.decision), never as an in-memory promise. The API endpoint that records the decision is POST /jobs/:id/decision, body { kind: "approve"|"regen"|"fix", repairedFrameKey? }.
A plan.resume sweep runs on worker boot: any plan job in running whose heartbeat_at is stale (§4 rule, 120s) is re-enqueued. The §4 takeover clause already permits this.
Exit gate: start a 30s/10-segment plan, kill the orchestrator worker after segment 4 is accepted, restart → the plan resumes at segment 5 with the correct initFrameKey, produces exactly 10 segment jobs total (no duplicates), and the final stitch is Path-A lossless.
§11 Work Order: Non-Destructive Edit Graph (undo/redo)
The graph is JSONB on projects.edit_graph (§2). No separate table — one authoritative shape:
export type EditNode =
| { id: string; op: “inpaint”; maskId: string; prompt: string; resultKey: string;
  region?: { start: number; end: number } }
| { id: string; op: “crop”; box: { x:number; y:number; w:number; h:number } } // normalized
| { id: string; op: “trim”; startMs: number; endMs: number }
| { id: string; op: “split”; atMs: number }
| { id: string; op: “text”; payload: TextOverlay }
| { id: string; op: “transform”; rotate: 0|90|180|270; flipH: boolean; flipV: boolean }
| { id: string; op: “segment_replace”; index: number; assetId: string };
export interface EditGraph { nodes: EditNode[]; head: string | null; }
Semantics: nodes is an append-only linear log; head points at the current node. Undo moves head back; redo forward; a new edit while head < tail truncates the redo branch — but truncated nodes’ render artifacts stay in renders/ for 24h before TTL cleanup, so an accidental branch-kill is recoverable. Persist the graph on every mutation (optimistic, debounced 500ms).
§12 Work Order: Export Presets & Command Builder
Ship the preset table as seed data (id, platform, label, kind, width, height, fps, container, vcodec, crf/bitrate, acodec, aBitrateK, lufs, maxDurationSec, maxSizeMB, safeZonesPct). Cover at launch: TikTok (9:16, 16:9, cover) · Instagram (Reel, Story, Feed 4:5, Square, 16:9) · YouTube (16:9, Shorts, Thumb, Banner) · Facebook (Reel, 16:9, Square, 4:5, Cover 820×312) · Snapchat 9:16 · Rumble (16:9, Thumb) · Pinterest (2:3, 1:1, Idea 9:16) · X (720p/1080p 16:9, 1:1, Header 1500×500) · LinkedIn (16:9, 9:16, 1:1, Banner 1584×396). Preset-packs (plugins, §13) extend it.
export function buildExportArgs(inKey: string, p: ExportPreset, crop: CropBox | “smart”,
                            probe: { hasAudio: boolean }, atMs?: number): string[] {
const vf = [
cropFilter(crop, p),                              // "smart" = subject-tracked reframe`scale=${p.width}:${p.height}:flags=lanczos:force_original_aspect_ratio=decrease`,`pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2:black`,...(p.fps ? [`fps=${p.fps}`] : []),"format=yuv420p",
].join(“,”);
if (p.kind === “image”)
return [...(atMs != null ? ["-ss", `${atMs}ms`] : []), "-i", inKey,        "-vf", vf, "-frames:v", "1", "-q:v", "2", out(p)];
const audio = probe.hasAudio
? ["-c:a", "aac", "-b:a", `${p.aBitrateK ?? 192}k`,   ...(p.lufs ? ["-af", `loudnorm=I=${p.lufs}:TP=-1.5:LRA=11`] : [])]: ["-an"];                                        // silent source -> zero audio tracks, no dummies
return [“-i”, inKey, “-vf”, vf,
      "-c:v", p.vcodec === "h265" ? "libx265" : "libx264",      ...(p.crf ? ["-crf", String(p.crf)] : ["-b:v", `${p.vBitrateK}k`]),      "-preset", "medium", "-movflags", "+faststart", ...audio, out(p)];
}
Export features: safe-zone overlays in preview per preset · smart-crop keeps detected subject in frame when converting aspect ratios · −14 LUFS default when audio present · batch export to multiple presets = one parent job with children. Every export writes a lineage_edges row (exported_from).
§13 Work Order: Plugin Layer & Security Hardening
Plugin types (manifest-based, plugin.json: id, version, type, permissions, entry):
brush — pure JSON tip/dynamics/feather definitions, zero code execution.
panel — sandboxed iframe UI, host access ONLY via the versioned postMessage bridge below.
provider — server-side TypeScript adapter implementing §7, installed per workspace, reviewed before listing.
preset-pack — pure data extending §12.
Permissions are declared in the manifest and user-approved at install (media:read, jobs:create, network:).
The bridge — origin validation is not optional:
const HOST_API_V1: Record<string, (ctx: PluginCtx, payload: any) => unknown> = {
“selection.get”: (ctx) => ctx.currentMask(),
“masks.create”: (ctx, m) => ctx.addMask(MaskObject.parse(m)),
“jobs.submitFix”: (ctx, p) => ctx.enqueueFix(FixParams.parse(p)),
“presets.add”: (ctx, p) => ctx.addPreset(ExportPresetSchema.parse(p)),
“assets.getThumb”:(ctx, id)=> ctx.signedThumbUrl(String(id)),
};
window.addEventListener(“message”, (ev) => {
const plugin = registryByFrame.get(ev.source as Window);
if (!plugin) return; // unknown frame: drop
if (ev.origin !== plugin.sandboxOrigin) return; // origin pinned per plugin instance
const { v, method, payload, callId } = ev.data ?? {};
if (v !== 1 || !(method in HOST_API_V1)) return;
if (!plugin.permissions.allows(method)) {
return reply(ev.source, callId, { error: "PERMISSION_DENIED" });
}
Promise.resolve(HOST_API_V1method)
.then(r => reply(ev.source, callId, { ok: r })).catch(e => reply(ev.source, callId, { error: String(e) }));
});
Iframe CSP: default-src ‘none’; script-src ‘self’; style-src ‘self’ ‘unsafe-inline’; img-src ‘self’ data:; connect-src . Host API is versioned and frozen per major version.
SSRF guard for all server-side downloads of provider-supplied URLs:
Protocol must be exactly https:.
Resolve DNS and connect to the resolved IP (re-resolution between check and fetch is the classic bypass); reject loopback, link-local, and RFC1918 ranges.
Enforce max size 500 MB via Content-Length AND a streaming byte counter; verify content type against expectation before processing.
No redirects across hosts without re-running the full check.
Provider-key encryption: AES-256-GCM, per-row 12-byte nonce (key_nonce), KEK versioned (kek_version) so keys re-encrypt on rotation. Plaintext keys exist only in worker memory for the duration of an adapter call, never in logs, never client-side.
Signed URL lifetimes: ≤ 15 minutes, single-key scope, read-only.
§14 Work Order: Realtime Event Contract
One WebSocket channel per client session; server pushes, client subscribes by project. UI falls back to polling no tighter than 2s if the socket drops.
type ServerEvent =
| { t: “job.state”; jobId: string; status: JobStatus; errorCode?: string }
| { t: “job.progress”; jobId: string; progress: number } // 0..1, throttle to 4/s
| { t: “job.approval”; jobId: string; payload: { drift: DriftReport; lastFrameKey: string } }
| { t: “asset.ready”; assetId: string }
| { t: “budget.warn”; spentCents: number; capCents: number }; // fired at 80% and 100%
§15 Frontend Notes (the parts builders get wrong)
Never trust video.currentTime** for frame accuracy.** Chromium: WebCodecs (VideoDecoder) + mp4box.js demux for frame-exact scrubbing. Safari/Firefox: server filmstrip JPEGs +  seek to frameToMs(n)+halfFrame. All timeline positions are frame indices converted through §6.1 — the UI never stores float seconds.
Canvas: Konva.js layers for masks/transforms; a WebGL shader pass only for the before/after wipe and the apply-shimmer effect (600ms, respects prefers-reduced-motion).
Layout: tool rail (Move · Brush · Lasso · Box · Smart-tap · Crop · Text · Hand/Zoom) · canvas with before/after · the Fix Bar docked under the canvas (the hero element — one persistent natural-language input) · inspector right (mask chips, candidates, history, export) · timeline bottom (filmstrip, waveform, amber repair-region underlines, labeled burst segments with clickable seam markers → checkpoint cards).
Keyboard: B brush, L lasso, M box, V move, ←/→ frame step, ⌘Z/⇧⌘Z.
Deliberately excluded from v1: keyframed motion graphics, grading wheels, multicam, audio mixing beyond one music/VO lane. The repair loop stays fast because you say no.
§16 Build Sequence & Exit Gates
Phase
Scope
Exit gate (all must pass)
0 (1–2 wk)
Repo/CI · §1 pre-flight · §2 migrations · §3 ingest · §4 job lifecycle · §6 wrapper + golden tests
Fixture uploads → ready with correct fps/frame_count · duplicate POST /jobs = 1 job, 1 provider call · all §6 golden tests green
1 (3–4 wk)
Image repair loop: canvas + brush/lasso/box · Fix Bar · one inpaint adapter + hosted fallback · candidates + before/after · §11 apply · 3 export presets
Generate → circle a bad hand → “fix this hand” → export, end to end on fixtures/bad_hand.png
2 (2–3 wk)
Smart-tap (SAM 2 image) · crop/rotate/text · full undo/redo · project save states · full image presets
Redo-branch truncation recoverable within 24h · smart-tap segments fixture objects
3 (4–5 wk)
Timeline + WebCodecs scrub · §8 propagation · ProPainter removal + keyframe-replacement path · §6.4 splice · range before/after
40-frame fix on a 15s clip completes < 3 min · splice golden tests green on long-GOP + no-audio fixtures
4 (3–4 wk)
§10 orchestrator · checkpoint cards · fix-then-continue · drift checks · stitcher · ripple-regen
30s / 10-segment plan with one forced regen and one seam fix → coherent Path-A stitch with full lineage
5 (2–3 wk)
Full preset matrix · smart-crop · safe zones · batch export · direct upload OAuth (YouTube, TikTok, Pinterest first)
Batch export 1 video → 4 presets in one parent job
6 (ongoing)
Plugin marketplace · preset packs · frame cache / GPU pooling · collaboration
—
§17 Answer Before Phase 0 Ends
Confirm the existing platform stack (framework/DB/storage/hosting) — this plan assumes Node/Postgres/S3.
Which providers do users already connect? Those adapters get built first.
Local GPU node (24 GB class) or API-only launch with hosted fallbacks?
Web-only at launch, or desktop wrapper (Tauri) required?
Team size — phases assume ~2 full-stack + 1 ML-leaning engineer.
Paid plugin marketplace at launch, or free-install only?
