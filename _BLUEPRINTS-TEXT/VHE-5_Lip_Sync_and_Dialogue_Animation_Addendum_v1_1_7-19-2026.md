> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `VHE-5_Lip_Sync_and_Dialogue_Animation_Addendum_v1_1_7-19-2026.docx` on 2026-07-19 13:05 Eastern Daylight Time.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

Correction Studio — VHE-5: Lip Sync & Dialogue Animation
Addendum module to the VHE-2 Execution Plan · v1.1 · July 19, 2026 (v1.1 adds Track C — provider-assisted unrigged stylized-character lip sync: §B1 mode enum, §B2 schema fields, §B4.5, §B4.6 path resolver, §B6 Signal F extensions, §B8 UI, §B9 fixtures, §B10 tests 16–24, §B11 phase B-2b)
Nothing in VHE-1/2/3/4 is replaced. Nothing in VHE-5 v1.0 is replaced. This document only ADDS. Same rules of engagement as VHE-2 §0: execute in order, copy code verbatim, never invent an FFmpeg command outside the wrapper. All coordinates normalized 0.0–1.0, all times integer milliseconds, all frame indices derived from ms + rational fps.
§B0 What This Module Adds (scope)
VHE-4 gave the platform a voice. VHE-5 makes the picture agree with it.
Track A — Live-action redub. New dialogue exists on the audio lane (uploaded, or synthesized in §A6). Regenerate only the mouth/jaw region of the speaking face so the visuals match the new words. Everything outside the face mask is bit-identical to the source — the same “never re-encode untouched frames” contract as VHE-2 §6.4.
Track B — Animated / cartoon characters with a rig. For SO Comic Universe scenes where prepared viseme mouth-shape assets exist, there is no photographic face to repair. Instead, drive a character rig from the audio: phoneme → viseme → mouth shape per frame, plus expression beats. Output is a rendered mouth/expression layer composited onto the character art. Deterministic, no GPU, no provider.
Track C — Animated / cartoon video without a rig (v1.1). Imported, generated, or previously rendered animated footage where no rig and no mouth-shape library exists. Detect or hand-place the character’s mouth region, track it, and have a provider regenerate only that region against the final dialogue audio — while preserving the original art style, palette, outlines, and shading. Regional crop-and-paste is the default; full-frame provider output is a last resort and is still composited back through the tracked region mask.
BYOK provider routing. One new capability, video.lipsync, registered under the existing VHE-2 §7 router. Local models, hosted APIs (fal.ai / Replicate / dedicated lip-sync vendors), and community plugins all satisfy it identically. No hardcoded vendor anywhere in app logic.
Sync verification (Signal F). A lip-sync result is not trusted because a provider returned it. Every result is measured against the audio and fails the gate if it drifts — on all three tracks.
Ordering rule (non-negotiable): lip sync runs on final audio. The §A6.5 duration invariant (mixed.wav sample count == detached.wav sample count) must already hold. Lip-syncing to a draft audio lane that later shifts by 40 ms produces work that must be thrown away.
Cheapest-path rule (v1.1): where a valid rig exists for the character in frame, Track B always wins. Track C exists for footage that cannot be rigged, not as a convenience alternative to rigging. The resolver in §B4.6 enforces this — it is not left to the UI.
Dependencies: VHE-2 §2 (schema), §3 (ingest), §4 (job lifecycle), §6 (FFmpeg wrapper), §7 (routing), §8 (SAM 2 tracking), §9.2 (range repair), §9.3 (Character Anchors), §9.5 (chunked windows), §11 (edit graph) · VHE-4 §A5 (audio recipes), §A6 (transcript + word timestamps), §A6.5 (audio scan). Do not start VHE-5 before VHE-2 Phase 3 and VHE-4 Phase A-2 have passed their exit gates.
§B1 New Capability (extends VHE-2 §7 and VHE-4 §A1)
export type Capability =  | /* …all existing VHE-2 + VHE-4 capabilities… */  | "video.lipsync"        // audio + face/character video -> mouth-corrected video  | "audio.align";         // text + audio -> phoneme timings (forced alignment)
Manifest additions (v1.1 expands mode and adds the stylized-path fields):
"video.lipsync": {  maxWidth: number; maxHeight: number;  maxDurationSec: number;  fps?: number[];                  // some providers only accept 25fps — router enforces  mode: ("rig_driven" | "stylized_region" | "faceswap_region" | "full_frame")[];  needsFaceCrop: boolean;          // true -> we send an aligned 512 crop, not the frame  supportsIdentityRef: boolean;    // accepts a reference crop to hold identity  supportsStyleRef: boolean;       // accepts a style/character reference image (Track C)  supportsMask: boolean;           // accepts an explicit edit mask (Track C strongly prefers true)  stylizedSafe: boolean;           // provider is validated on non-photoreal faces  supportsEmotion: boolean;        // accepts an expression/style hint  maxSpeakers: number;             // 1 for nearly every provider today  costHintCentsPerSec?: number;}"audio.align": { phonemeSet: "arpabet" | "ipa"; wordTimestamps: boolean }
Mode semantics (authoritative — the router switches on these, never on provider names):
mode
Meaning
Who uses it
rig_driven
No provider inference. Mouth layer composited from prepared viseme assets.
Track B (§B4) — internal local-rig connection only
stylized_region
Provider regenerates a cropped character region of non-photoreal art, conditioned on audio/visemes, preserving art style.
Track C (§B4.5)
faceswap_region
Provider regenerates an aligned photographic face crop.
Track A (§B3)
full_frame
Provider consumes and returns whole frames. Degraded fallback only.
Track A and C fallback (§B3.3, §B4.5.6)
Registration rule: the deterministic rig renderer registers as an internal local-rig connection advertising video.lipsync with mode: ["rig_driven"], zero cost, and no network. This is what lets §B4.6 route Track B through the same router as everything else instead of special-casing it — a rig render is just the cheapest provider in the chain.
Routing is otherwise unchanged. The §7 router filters connections by capability + limits + required mode, orders by is_default_for, and the worker walks the chain. NO_PROVIDER fires before any spend, exactly as elsewhere.
Local models are just another provider. With LOCAL_GPU=true, register the chosen local lip-sync model under the internal local-gpu connection. Two builder notes, both load-bearing:
License-check before you pick one. Several well-known lip-sync checkpoints are research/non-commercial only. The adapter interface is what matters here — the model behind it is swappable. Do not let a licensing decision block the build; ship the adapter against a hosted provider first and register a local one when legal signs off. // BUILDER: record the chosen model + license in /docs/model-licenses.md.
API-only deployments route video.lipsync to a hosted adapter, and audio.align to either a hosted aligner or the CPU-acceptable local aligner in §B9. If neither is connected, the feature grays out — it never silently degrades to “generate the whole frame.”
v1.1 routing caveat — photoreal-only providers must declare it. A provider whose manifest omits stylizedSafe: true is never eligible for a Track C job, even if it advertises stylized_region. Photoreal lip-sync models applied to cartoon faces produce the single worst failure mode in this module: a plausible human mouth pasted into drawn art. The flag is opt-in and set from measured behavior against fixtures/cartoon_*, not from vendor marketing copy. // BUILDER: adapters ship with stylizedSafe: false until the §B10 test 18 passes for them.
§B2 Schema Additions (migration 0003 — additive only)
CREATE TABLE character_rigs (  id             TEXT PRIMARY KEY,             -- ulid  owner_id       TEXT NOT NULL,  project_id     TEXT REFERENCES projects(id), -- nullable: library-level rigs allowed  label          TEXT NOT NULL,                -- "Marcus - SO Comic - 3q left"  kind           TEXT NOT NULL DEFAULT 'sprite'                 CHECK (kind IN ('sprite','landmark','anchor_ref')),  viseme_set     TEXT NOT NULL DEFAULT 'preston_blair',   -- §B5.1  shapes         JSONB NOT NULL,   -- viseme key -> { assetId, anchor:{x,y}, scale }  expressions    JSONB NOT NULL DEFAULT '{}',  -- "neutral"|"happy"|... -> overlay assetId  anchor_id      TEXT,             -- optional link to a §9.3 Character Anchor  meta           JSONB NOT NULL DEFAULT '{}',  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now());CREATE INDEX ON character_rigs (owner_id, project_id);CREATE TABLE dialogue_tracks (  id             TEXT PRIMARY KEY,  project_id     TEXT NOT NULL REFERENCES projects(id),  asset_id       TEXT NOT NULL REFERENCES media_assets(id),  -- the video being synced  audio_asset_id TEXT NOT NULL REFERENCES media_assets(id),  -- the driving audio  speaker_key    TEXT NOT NULL,     -- anchor id (live action) or rig id (animated)  start_ms       INT NOT NULL,  end_ms         INT NOT NULL,  phonemes       JSONB NOT NULL,    -- §B5 PhonemeSpan[] — the alignment result, cached  viseme_track   JSONB,             -- §B5 VisemeFrame[] — derived, regenerable  created_at     TIMESTAMPTZ NOT NULL DEFAULT now());CREATE INDEX ON dialogue_tracks (asset_id, start_ms);
v1.1 additions to dialogue_tracks (same migration, additive):
ALTER TABLE dialogue_tracks  ADD COLUMN track_path TEXT NOT NULL DEFAULT 'live_action'      CHECK (track_path IN ('live_action','rig','stylized')),   -- §B4.6 resolver writes this  ADD COLUMN region_mask_id   TEXT REFERENCES masks(id),  -- Track C: the tracked character region  ADD COLUMN style_ref_keys   JSONB NOT NULL DEFAULT '[]', -- Track C: character/style reference crops  ADD COLUMN anchor_points    JSONB NOT NULL DEFAULT '[]', -- Track C: manual mouth anchors, §B4.5.2  ADD COLUMN detection_source TEXT NOT NULL DEFAULT 'auto'      CHECK (detection_source IN ('auto','assisted','manual')),  ADD COLUMN resolver_reason  TEXT;   -- human-readable why-this-path, shown in the UICREATE INDEX ON dialogue_tracks (project_id, track_path);
track_path, detection_source, and resolver_reason are written once by the §B4.6 resolver and are never inferred later. Every downstream job reads them rather than re-deciding — one decision, recorded, auditable.
New jobs.type values (comment-list only, no schema change): 'audio.align' | 'lipsync.plan' | 'lipsync.render' | 'rig.render' · v1.1 adds 'stylized.detect' | 'stylized.render'.
New edit-graph ops (append to the VHE-2 §11 EditNode union — lip sync is non-destructive like everything else):
| { id: string; op: "lipsync";     dialogueTrackId: string; startFrame: number;    endFrame: number; providerId: string; resultKey: string }| { id: string; op: "rig_mouth";   dialogueTrackId: string; rigId: string;    startFrame: number; endFrame: number; resultKey: string }| { id: string; op: "expression";  rigId: string; startMs: number; endMs: number;    key: string; intensity: number }   // 0..1// v1.1:| { id: string; op: "stylized_mouth"; dialogueTrackId: string; maskId: string;    startFrame: number; endFrame: number; providerId: string;    mode: "stylized_region" | "full_frame"; resultKey: string }
stylized_mouth is deliberately a separate op from lipsync rather than a flag on it: undo/redo, lineage, and the export badges in §B7 all need to distinguish “a real person’s face was regenerated” from “drawn art was regenerated,” and a union member is harder to get wrong than a boolean.
Storage layout additions (deterministic, per VHE-2 rules):
lipsync/{assetId}/{dialogueTrackId}/align.json          -- phoneme + viseme tracklipsync/{assetId}/{dialogueTrackId}/crops/{index:07d}.png    -- aligned 512 face cropslipsync/{assetId}/{dialogueTrackId}/xform/{index:07d}.json   -- per-frame affine matrixlipsync/{assetId}/{dialogueTrackId}/out/{index:07d}.png      -- provider-returned cropsrig/{rigId}/render/{dialogueTrackId}/{index:07d}.png    -- composited mouth layer-- v1.1 (Track C):stylized/{assetId}/{dialogueTrackId}/region/{index:07d}.png  -- tracked character-region cropsstylized/{assetId}/{dialogueTrackId}/mask/{index:07d}.png    -- region mask, white = editstylized/{assetId}/{dialogueTrackId}/ref/{n}.png             -- style/character reference cropsstylized/{assetId}/{dialogueTrackId}/out/{index:07d}.png     -- provider-returned region crops
out/ keys are content-addressed by sha256(cropKey + audioWindowKey + providerSlug + settings) in the job input, so a re-run with the same inputs never bills twice — same rule as the VHE-4 synth cache. For Track C the hash also folds in maskKey and the ordered style_ref_keys, since changing a reference legitimately changes the output.
§B3 Work Order: Track A — Live-Action Redub
The pipeline is crop → align → drive → paste back, and it is deliberately the same shape as VHE-2 §9.1’s crop-inpaint-paste. Nothing sends a full frame to a provider.
B3.1 Speaker + range resolution
Range comes from the dialogue: the changed spans in the §A6 transcript, unioned and padded to the nearest ≥120 ms silence gap (reuse the §A6 span logic verbatim — do not write a second grouper).
Convert span ms → master frame indices via §6.1 msToFrame (FLOOR, never round).
Detect faces on the range with InsightFace (§9.3). If more than one face is present, resolve the speaker by Character Anchor match first, then by mouth-motion energy over the range; if still ambiguous, the job goes to awaiting_approval with a “which speaker?” decision card. Never guess a face.
Track the chosen face across the range with SAM 2 (§8) so occlusions (a hand crossing the mouth, a turn past profile) produce a mask hole rather than a hallucinated mouth. Frames where the face mask is < 40% of its rolling median area are marked occluded and are skipped — original pixels pass through untouched.
B3.2 Alignment crop (the part builders get wrong)
Providers expect a canonical face crop. Compute a similarity transform from the 5-point InsightFace landmarks to a fixed template, and keep the matrix — paste-back is its inverse.
// packages/media/facealign.tsimport cv from "@u4/opencv4nodejs";   // BUILDER: or call the Python worker; either is fineconst TEMPLATE_512 = [   // canonical 512x512 5-point template (x, y)  [186.0, 202.0], [326.0, 202.0], [256.0, 288.0], [201.0, 372.0], [311.0, 372.0],];export function alignFace(landmarks5: number[][]) {  // estimateAffinePartial2D = similarity (rotate + uniform scale + translate). NOT full affine:  // a full affine will shear the face and the paste-back seam will visibly slide.  const M = cv.estimateAffinePartial2D(landmarks5, TEMPLATE_512, { method: cv.LMEDS });  return M;                       // 2x3; store per frame under xform/{index}.json}
Temporal smoothing is mandatory. Raw per-frame landmarks jitter by 1–2 px; that jitter becomes a visibly swimming mouth after paste-back. Smooth the matrix parameters (angle, scale, tx, ty), not the landmark points, with a centered 5-frame median followed by a 5-frame mean. Re-derive M from the smoothed parameters. // BUILDER: window length is a config-table value, not a constant in code.
B3.3 Drive
Slice the driving audio to exactly the span (§A5 recipes only — never a bespoke ffmpeg string) and encode as 16 kHz mono WAV; nearly every lip-sync model wants that regardless of what the master audio is.
Route video.lipsync with required mode faceswap_region (§7). Send: the aligned crop sequence, the audio slice, fps as fps_num/fps_den, and — when supportsIdentityRef — the project’s Character Anchor reference crop.
Providers that only accept whole video files get a temporary crop-sequence MP4 built by §B4.1, not the master.
Chunk long ranges with the §9.5 windowing rules unchanged: W = 48 frames, O = 8 overlap, one parent + one child per window, {parentJobId}:win:{index} idempotency keys. Overlap blending happens inside the face mask only, with the same linear t ramp. Audio slices for adjacent windows overlap by the same O frames so the model has continuous context at the seam.
B3.4 Paste back
out[f] = frame[f]·(1 − mouthMask_f) + warpBack(providerCrop[f], M_f⁻¹)·mouthMask_f
mouthMask_f is the lower-face region only (jaw + mouth + nasolabial), derived from the tracked face mask, feathered 12 px at native resolution. Eyes and forehead are never replaced — that is what keeps identity stable and keeps this a repair, not a face swap.
Inverse-warp with cv.INTER_LANCZOS4 and WARP_INVERSE_MAP. Color-match the warped crop to the destination with a LAB-space mean/std transfer computed on the feather ring only, so a provider’s slightly different exposure doesn’t leave a rectangle.
Splice the repaired frames back with §6.4 keyframe-aware splice, verbatim. Untouched spans stream-copy. Audio is remapped with -map 1:a:0? as always.
Exit gate (Track A): on fixtures/speech_10s.mp4 redubbed with a §A6 synth clip, the output differs from the source only inside the lower-face mask (per-pixel diff outside the mask is zero on non-re-encoded spans), Signal F offset ≤ 1 frame, and the §9.3 identity check against the Character Anchor stays ≥ 0.55 cosine.
§B4 Work Order: Track B — Animated / Cartoon Characters with a Rig (SO Comic Universe)
No photographic face exists, so nothing is “repaired” — a mouth layer is rendered from the audio and composited. This path needs no GPU and no provider at all: it is deterministic compositing driven by the viseme track. That makes it the cheapest, most reliable feature in the module, and it should ship first.
v1.1 scope note. Track B requires prepared viseme mouth-shape assets. Animated footage without a rig — imported, generated, or previously rendered — is handled by Track C (§B4.5), and the choice between them is made by the resolver in §B4.6, never by the operator’s mood. Where a valid rig exists, Track B wins on cost, determinism, and fidelity, every time.
B4.1 Rig definition
A rig is a set of mouth shape images keyed by viseme, plus an anchor point and scale in the character’s local space:
export const RigShape = z.object({  assetId: z.string(),  anchor:  z.object({ x: z.number(), y: z.number() }),   // normalized, mouth pivot in the shape art  scale:   z.number().default(1),});export const CharacterRig = z.object({  id: z.string(), label: z.string(),  visemeSet: z.enum(["preston_blair", "arpabet10"]).default("preston_blair"),  shapes: z.record(z.string(), RigShape),      // must cover every viseme in the set + "rest"  expressions: z.record(z.string(), z.object({ assetId: z.string() })).default({}),});
Validation on save: every viseme key in the chosen set must be present, or the rig is rejected with a list of what’s missing. A rig with a hole produces a character whose mouth vanishes on one phoneme, and it will not be caught until render.
B4.2 Placement
Per shot, the user sets the mouth anchor once on one frame (drag a handle onto the character’s mouth) and, if the character moves, the anchor is tracked with the §8 SAM 2 tracker on a small box around the mouth — same worker, same masks storage, no new tracking code. Static comic panels skip tracking entirely.
B4.3 Render
for each frame f in [startFrame..endFrame]:    v      = visemeTrack[f].key           // §B5    amp    = visemeTrack[f].amplitude     // 0..1, from audio RMS in that frame's window    shape  = rig.shapes[v]    place  shape at anchor_f, scaled by rig.scale · (0.85 + 0.15·amp)    apply  expression overlay if an "expression" edit node covers f    write  rig/{rigId}/render/{trackId}/{f:07d}.png   (RGBA, transparent outside the mouth)
Composite over the source frames with the standard mask rule, then splice with §6.4. Because every input is deterministic, two renders of the same rig + track are byte-identical — assert this in the golden tests.
Hold rule (the thing that separates good animation from strobing): no viseme may occupy fewer than 2 consecutive frames at 24fps. Runs shorter than that are absorbed into the neighbor with the higher amplitude. This is applied in §B5.3, not here.
Exit gate (Track B): a 6-second SO Comic panel with a 12-shape rig renders a mouth track where every frame’s viseme matches the reference alignment, no viseme run is shorter than 2 frames, and re-rendering produces a byte-identical file.
§B4.5 Work Order: Track C — Unrigged Stylized-Character Lip Sync (v1.1)
Purpose. Correction Studio must handle animated/cartoon video it did not author: a clip generated by a video model, an old render with no source project, a client-supplied cartoon, an SO Comic scene whose rig was never built. There is no mouth-shape library and no photographic face. The path is the same crop → track → drive → paste-back shape used everywhere else in this product — the differences are how the region is found and what the provider is allowed to change.
Non-negotiable premise: human face detectors do not reliably see cartoon characters. InsightFace, MediaPipe Face Mesh, and every 5-point landmark model in the stack are trained on photographs. They will miss a stylized face entirely, or — worse — return a confident, wrong box on a background object. Track C therefore treats automatic detection as a suggestion that must survive a check, and treats manual placement as a first-class input, not an error path. Nothing in Track C ever calls alignFace (§B3.2); there are no 5-point landmarks to align to.
B4.5.1 Region detection (job type stylized.detect)
Run on the proxy (720p) per §9.4’s rule, converting spans back to master indices via §6.1. Three signals, fused, then confidence-gated:
#
Signal
Method
Notes
C1
Stylized-face proposal
A cartoon/illustration-domain detector registered on the Python worker, or a hosted equivalent under stylized.detect
Optional. If none is connected, C1 contributes 0 and the path leans on C2/C3 + manual. // BUILDER: record which detector, and its license, in /docs/model-licenses.md
C2
Motion-energy localization
Frame-difference energy inside candidate regions, band-limited to the dialogue span
A talking character’s mouth region moves on speech; a static background does not
C3
Anchor / reference match
Template + embedding match against style_ref_keys and any prior dialogue_tracks on this asset
Once the user places a character once, later shots find it cheaply
Fusion: score = 0.45·C1 + 0.30·C2 + 0.25·C3, thresholds in the config table, not code (same rule as §7 cost defaults and §9.4 thresholds).
Confidence gate — the rule that keeps this honest:
score ≥ T_auto (default 0.70) → propose the region, detection_source = 'auto', still shown to the user for one-tap confirmation.
T_low ≤ score < T_auto → propose it as a suggestion only, detection_source = 'assisted'; the user must adjust or accept before anything is enqueued.
score < T_low (default 0.35), or zero proposals → stop and ask. The job lands in awaiting_approval with a “place the mouth” card. It does not guess, and it does not fall through to full-frame processing to avoid asking. Guessing on a cartoon face is how you regenerate a lamp.
Never auto-run on plain uploads. Same rule as §9.4 and §A6.5: the user’s own footage isn’t presumed broken. stylized.detect runs when a dialogue track is created, or on demand.
B4.5.2 Manual placement (co-equal input, not a fallback)
The UI always offers, and the schema always accepts:
Mouth anchors — one or more tapped points on the mouth (anchor_points, normalized, per keyframe). A single tap on one frame is sufficient input for the whole path.
Region mask — any §5 MaskObject (rect / polygon / stroke / points). Points-masks resolve through SAM 2 exactly as elsewhere; the smart-tap tool works on drawn art because SAM 2 segments by appearance, not by face priors. This is why SAM 2 carries Track C’s tracking and a face model cannot.
Reference frames / character references — up to 4 crops written to style_ref_keys, used both for C3 matching and, when supportsStyleRef, passed to the provider to hold the character’s identity.
detection_source = 'manual' whenever the user placed or edited the region. This is recorded because it changes nothing about how the job runs and everything about how a later failure is diagnosed.
B4.5.3 Tracking
Track the region with SAM 2 (§8), unchanged — same worker, same masks/{maskId}/{absoluteIndex:07d}.png layout, same local↔absolute index translation, same RAFT optical-flow fallback when SAM 2 is unavailable. Seed from the user’s key frame or the accepted proposal.
Track C inherits §B3.1’s occlusion rule verbatim: frames where the region mask drops below 40% of its rolling median area are marked occluded, skipped, and passed through as original pixels. Cartoon occlusions are common and abrupt — a speech balloon, a foreground prop, a hard cut to a reverse angle — and a model asked to animate a mouth that isn’t visible will invent one.
Cut safety: PySceneDetect scene cuts inside the range split the range into independent sub-ranges, each with its own seed and its own provider call. A drawn character’s appearance can change completely across a cut (angle, scale, style), and tracking across one produces drift that no blending fixes.
B4.5.4 Region crop (no alignment transform)
There is no canonical template, so there is no similarity transform and no xform/ files on this path. Instead:
Crop the union of the tracked region bbox across the whole window, plus 25% margin, clamped to frame and to the provider’s maxWidth/maxHeight — the same crop-inpaint-paste logic as §9.1, reused rather than reinvented.
The crop rect is constant across a window (it does not follow the mask frame-by-frame). A per-frame crop makes the provider see a jittering canvas and produces swimming output; a fixed crop with a moving mask inside it does not.
Resize to the provider’s preferred input with flags=lanczos via the wrapper, and record the exact scale factor for paste-back.
B4.5.5 Drive (mode stylized_region)
Slice the driving audio to the sub-range (§A5 recipes only), 16 kHz mono WAV.
Route video.lipsync with required mode stylized_region and stylizedSafe: true (§B1). Send: the region crop sequence, the region mask sequence (when supportsMask), the audio slice, fps_num/fps_den, the §B5 viseme track as a conditioning hint when the provider accepts one, and the style references when supportsStyleRef.
Instruction template (user text always outranks it, same rule as §9.1): “Animate only the mouth and jaw of the character to match the speech. Preserve the original art style, line weight, outline color, palette, shading, and every element outside the mouth region exactly. Do not photorealize. Do not restyle. Do not redraw the eyes, hair, or background.” Negative default: photorealistic face, human skin texture, restyled art, changed line weight, changed palette, blurred outlines, extra characters.
Chunk with the §9.5 windowing rules unchanged (W = 48, O = 8, one parent + one child per window, {parentJobId}:win:{index} keys, overlap blend inside the mask only, audio slices overlapping by O). Nothing new — this is why §9.5 was written generically.
Budgets, idempotency, retries, error taxonomy, heartbeat takeover: all §4, unmodified. A Track C render is an ordinary job.
B4.5.6 Full-frame fallback (allowed, constrained, never silent)
Some providers only accept whole frames. That is permitted only when no stylized_region-capable, stylizedSafe connection is in the chain. When it happens:
The job records mode: "full_frame" in the stylized_mouth edit node and in jobs.output, and the UI shows a full-frame provider badge — the §A3 honesty rule applied to pictures.
The returned frames are still composited back through the tracked region mask:
out[f] = frame[f]·(1 − regionMask_f) + providerFrame[f]·regionMask_f     // feathered 12 px
Everything outside the character region is the original pixel, always. A full-frame provider is never allowed to become a full-frame edit. 3. Before compositing, run the §B4.5.7 style-preservation checks on the masked region. Full-frame providers drift style more, not less, so the gate matters more here. 4. Splice with §6.4 as usual — untouched spans still stream-copy.
B4.5.7 Style preservation (the Track C quality gate)
Photoreal drift is the characteristic failure of this path, and it is measurable. Before compositing, compare provider output against the source crop inside the mask:
Check
Method
Fail condition
Palette fidelity
32-bin LAB histogram intersection, masked region, output vs. source-frame neighbourhood
intersection < 0.80
Outline integrity
Canny edge density ratio, output vs. source, masked region
ratio outside 0.6–1.6
Texture / photorealism
High-frequency energy ratio (Laplacian variance) output vs. source
> 2.5× source
Identity
Embedding distance to style_ref_keys crops, when references exist
cosine < 0.50
Any failure → the candidate is rejected, the chain advances to the next provider (§7), and if the chain is exhausted the job lands in awaiting_approval with the failing check named. Nothing auto-repairs from a style-check failure. Additionally, a mild LAB mean/std transfer computed on the feather ring is applied on the accepted candidate — the same seam treatment as §B3.4, which also suppresses small palette shifts before they read as a patch.
B4.5.8 Paste back and lineage
Composite through the feathered region mask (formula above), inverse-scaling the crop by the recorded factor with INTER_LANCZOS4.
Splice with §6.4 verbatim.
Append a stylized_mouth edit node (§B2). Pixels are never destroyed; undo/redo is the ordinary §11 path.
Write the lineage edge with meta.stylizedLipsync = true, meta.mode, meta.detectionSource, and meta.providerId.
Exit gate (Track C): on fixtures/cartoon_talk_8s.mp4 with a manually placed mouth anchor and no rig, the output differs from the source only inside the tracked region mask on non-re-encoded spans · all four §B4.5.7 style checks pass · Signal F offset ≤ 1 frame · a run with detection confidence forced below T_low lands in awaiting_approval and never enqueues a provider call · a provider without stylizedSafe is never selected.
§B4.6 Path Resolver — Choosing Between Track A, B, and C (v1.1)
One function, one recorded decision, written to dialogue_tracks.track_path and resolver_reason at track creation. Everything downstream reads the record.
export type TrackPath = "live_action" | "rig" | "stylized";export async function resolveTrackPath(ctx: {  projectId: string; assetId: string; range: { startFrame: number; endFrame: number };  userChoice?: TrackPath;             // explicit override from the UI  rigId?: string;                     // rig the user attached, if any}): Promise<{ path: TrackPath; reason: string; needsUser: boolean }> {  // 1. Explicit user choice always wins — but a chosen rig must still validate (§B4.1).  if (ctx.userChoice === "rig" || ctx.rigId) {    const rig = ctx.rigId ? await db.rigById(ctx.rigId) : null;    if (rig && validateRig(rig).ok)      return { path: "rig", reason: "valid rig attached", needsUser: false };    if (ctx.rigId)      return { path: "stylized", reason: "attached rig incomplete — see rig editor",               needsUser: true };  }  if (ctx.userChoice) return { path: ctx.userChoice, reason: "user override", needsUser: false };  // 2. Rig library: a valid rig for a character present in range is ALWAYS cheapest. Prefer it.  const rig = await db.findRigForRange(ctx.projectId, ctx.assetId, ctx.range);  if (rig && validateRig(rig).ok)    return { path: "rig", reason: "matching project rig found", needsUser: false };  // 3. Photoreal test — does a HUMAN face detector find a confident, stable face in range?  const fd = await faceDetectStats(ctx.assetId, ctx.range);   // InsightFace, §9.3  const photoreal = fd.detectionRate >= 0.6 && fd.meanScore >= 0.65 && fd.styleScore >= 0.5;  if (photoreal)    return { path: "live_action", reason: "stable photographic face detected", needsUser: false };  // 4. Everything else is stylized. This is the DEFAULT for non-photoreal media —  //    Track A is never attempted on drawn art, and Track C never needs a rig.  return { path: "stylized",           reason: fd.detectionRate > 0 ? "face detections unstable or non-photoreal"                                        : "no photographic face detected",           needsUser: false };}
Rules the code above encodes, stated plainly:
Rig beats everything. A valid rig is deterministic, free, and pixel-exact. If one exists for the character in range, use it — Track C is not an upgrade over Track B, it is a substitute for footage that cannot be rigged.
An incomplete rig routes to Track C and tells the user why. It never renders with a missing viseme, and it never silently ignores the rig the user attached.
Photoreal detection must be stable, not merely present. A single confident frame does not make a clip live-action; the gate is detection rate across the range plus a style score. One frame of a realistic-looking poster in a cartoon must not route the whole clip to Track A.
Stylized is the default for anything non-photoreal. The fallback direction is toward the path that assumes nothing about faces — never toward the one that assumes a human.
The user can override, and the override is recorded with reason: "user override" so a bad result is traceable to the decision that caused it.
Mixed media in one range (a live actor and a cartoon character in the same shot) is out of scope for v1.1: create two dialogue tracks over the same range, one per speaker, each resolved independently. See §B12.
§B5 Work Order: The Viseme Engine (shared by all three tracks)
This is the piece every track depends on and the piece nobody thinks about until it’s wrong.
B5.1 Phoneme alignment
Input: the audio span + the known text (from §A6’s transcript, or the text the user typed for a synth). Knowing the text makes this forced alignment, which is far more accurate than recognition-from-scratch — always prefer it.
export const PhonemeSpan = z.object({  p: z.string(),                 // ARPAbet symbol, e.g. "AA1", "M", "SIL"  startMs: z.number().int(),  endMs: z.number().int(),  wordIndex: z.number().int().nullable(),});
Route audio.align. Local option: a CPU-acceptable forced aligner registered under the internal connection. Hosted option: any STT provider whose manifest advertises phoneme-level output. Fallback when no aligner is available: interpolate phonemes within each word from VHE-4’s word timestamps by grapheme weight — noticeably cruder, clearly labeled in the UI as estimated timing, never silently substituted.
B5.2 Phoneme → viseme mapping
The mapping table lives in the config table, not in code (same rule as §7 cost defaults and §9.4 thresholds), because rigs and art styles want different granularities. Ship preston_blair (10 shapes + rest) as the default:
Viseme key
ARPAbet phonemes
Shape
MBP
M, B, P
lips closed
FV
F, V
lower lip to teeth
TH
TH, DH
tongue to teeth
L
L
tongue up, mouth open
WQ
W, UW, OW, OY
tight round
E
EH, AE, EY, AH, ER
mid-open
AI
AA, AY, AW
wide open
O
AO, OW
round open
U
UH, UW
small round
CDG
remaining consonants (S, T, K, N, R, Z, …)
slightly open
rest
SIL, SP, pause > 200 ms
closed neutral
B5.3 Viseme track construction
export const VisemeFrame = z.object({  frame: z.number().int(),        // MASTER frame index  key: z.string(),                // viseme key  amplitude: z.number(),          // 0..1, audio RMS in [frameStartMs, frameEndMs)  estimated: z.boolean().default(false),   // true if §B5.1 fallback produced the timing});
Build order, and each step matters:
For each frame, take the phoneme whose span covers the frame’s midpoint (frameToMs(f) + halfFrame) — midpoint, not start, or every viseme lands one frame early.
Co-articulation lead: shift the whole track 1 frame earlier. Real mouths anticipate; perfectly aligned lip sync reads as late. // BUILDER: lead frames is a config value, default 1 at 24fps.
Hold pass: any run shorter than the minimum (2 frames at 24fps, scaled by fps) is merged into its higher-amplitude neighbor.
Rest insertion: any gap ≥ 200 ms with amplitude < 0.05 becomes rest, regardless of what the aligner said.
Persist to dialogue_tracks.viseme_track and to align.json. Regenerating it from phonemes must be free and deterministic — it is derived data, and the phonemes are the expensive thing worth caching.
v1.1 — how each track consumes it. Track B renders the viseme track directly (it is the animation). Track A uses it only for §B6 verification. Track C passes it to the provider as a conditioning hint when the manifest accepts one, and otherwise uses it for verification exactly like Track A — so the engine is built once and every path benefits, including paths where the provider ignores it.
§B6 Work Order: Signal F — Lip-Sync Verification (the scanner gets a metronome)
VHE-2 §9.4 gave the scanner eyes (Signals A–D); VHE-4 §A6.5 gave it ears (Signal E). Signal F checks that the two agree. It runs automatically after every lipsync.render, rig.render, and (v1.1) stylized.render — a lip-sync result is never accepted on the provider’s word.
Method (deterministic, no new dependencies):
Per frame in the range, compute mouth openness → signal V[f]:
Track A: vertical distance between inner-lip landmarks, normalized by face bbox height.
Track B: the rendered shape’s openness value, read from the rig.
Track C (v1.1): no landmarks exist on drawn art. Use the mask-interior openness proxy: within the tracked mouth sub-region, the area of the interior enclosed by the strongest closed edge contour, normalized by region bbox height, smoothed over 3 frames. Fall back to masked frame-difference energy if no stable contour is found, and record which estimator was used in the job output.
Compute audio envelope A[f]: RMS of mixed.wav over each frame’s window, smoothed with a 3-frame mean.
Cross-correlate V and A over lags −6..+6 frames. Report offsetFrames = argmax and corr = peak normalized correlation.
Flags:
#
Condition
Flag
Tracks
F1
abs(offsetFrames) > 1
lipsync_offset
A, B, C
F2
corr < 0.35 over a ≥ 12-frame window
lipsync_desync
A, B, C
F3
V[f] open while A[f] < 0.05 for ≥ 6 frames
lipsync_phantom_speech
A, B, C
F4
identity cosine to Character Anchor drops below 0.55 anywhere in range
lipsync_identity_drift
A
F5
any §B4.5.7 style check fails on a composited result
stylized_style_drift
C
F6
region mask area or centroid jumps > 3σ off its rolling trend without a scene cut
stylized_track_loss
C
Thresholds for Track C are their own config rows. Drawn art has flatter high-frequency content and harder edges than photography; reusing Track A’s numbers produces false confidence in both directions. // BUILDER: signalF.trackC.* keys, seeded from measurements on fixtures/cartoon_*.
False-positive suppression (the §9.4 Signal-D analog, equally non-optional): frames marked occluded in §B3.1 / §B4.5.3 are excluded from all detectors, and F1/F2 are not evaluated within ±2 frames of a PySceneDetect scene cut.
Behavior on flag: F1 with a consistent offset is auto-correctable — shift the rendered mouth layer by offsetFrames and re-verify once; if it passes, record the shift in the job output. F2, F3, F4, F5, and F6 are never auto-repaired: the job lands in awaiting_approval with the offending span pre-loaded into the normal repair flow, amber-marked on the timeline like every other suggestion. Thresholds live in the config table.
§B7 Consent & Likeness Gating (read before writing the adapter)
Putting new words in a real person’s mouth is the highest-risk thing this platform can do. The controls are structural, not advisory:
video.lipsync on a live-action face requires the workspace flag likenessEditingEnabled AND a per-project consent acknowledgment (subject identity + the user’s asserted right to modify), recorded on the dialogue_tracks row’s meta.consent with timestamp and user id. Same shape as the VHE-4 §A8 clone consent — reuse that component, do not build a second one.
Track B (rigs, drawn characters) is not gated. Cartoon mouth shapes carry none of this risk.
Track C is not likeness-gated either — drawn characters are not people. Two v1.1 qualifications: (a) if the §B4.6 resolver produced live_action and the user overrode it to stylized, the likeness gate still applies, because the override doesn’t change what’s in the frame; (b) rotoscoped or photoreal-rendered characters sit in a genuine grey zone — when the §B4.5.7 photorealism check reads the source as high-realism, the UI surfaces the consent prompt as a confirmation, not a block. // BUILDER: this is a config threshold, and legal should set it, not engineering.
Every export whose lineage includes a lipsync node carries meta.lipsyncApplied = true on its exported_from lineage edge, and — when the source face was live-action — meta.likenessEdited = true. Exports downstream of a stylized_mouth node carry meta.stylizedLipsync = true and the mode used. No silent redubs, ever, exactly as with cloned voices.
Provider-side content refusals surface as PROVIDER_REJECTED (§4.3, non-retryable) and are shown to the user verbatim rather than retried against a second provider. A refusal is not a routing failure. // BUILDER: this is an explicit exception to the §7 fall-through chain — implement it as a check on the error code before advancing.
§B8 UI Integration
Dialogue mode in the Fix Bar: with a dialogue track selected, the Fix Bar accepts the line, not a mask instruction (“she says: we should have left an hour ago”). Under it, one row: speaker chip · Voice Preset chip (VHE-4 §A7) · rig chip (Track B) · Sync button.
Path chip (v1.1). The resolved track path shows as a chip next to the speaker: Live action / Rig / Stylized, with resolver_reason on hover and a one-click change that writes a user override. When the resolver routed to Stylized because a rig was incomplete, the chip links straight to the rig editor with the missing shapes highlighted — the cheapest path stays one click away.
Timeline: dialogue tracks render as a fifth lane under the audio lane, with word blocks from the transcript and viseme ticks at frame resolution when zoomed past ~4 frames/px. Signal F flags appear as the usual amber underline on that lane.
Rig editor (Track B): a grid of the viseme set, each cell a drop target for the shape art, with a live scrub preview against the current dialogue track. Missing shapes render as a red cell — this is the §B4.1 validation made visible.
Stylized setup panel (v1.1, Track C): a three-step strip that mirrors the actual pipeline — 1. Find the mouth (auto proposal with a confidence pill, or tap to place; smart-tap, box, and lasso all available), 2. Check the track (scrub the tracked region with the mask overlaid, adjust on any frame, occluded frames shown greyed), 3. References (drop up to 4 character/style crops, shown as thumbnails). Below it, the mode badge (region or full-frame) and the four §B4.5.7 style-check results as pass/fail pills after a render. Low-confidence detection surfaces here as the awaiting_approval card, in place — not as a modal error.
Honesty badges, per the VHE-4 §A3 rule: show estimated timing when the §B5.1 fallback produced the alignment, mouth region only on Track A results, and on Track C region composited or full-frame provider plus manual placement when detection_source = 'manual'. Nobody should ever believe more or less was regenerated than actually was.
Preview renders only [startFrame−4 .. endFrame+4] — never the whole clip, same as §9.2.
§B9 Pre-Flight Additions (append to the VHE-3 checklist)
A forced aligner with ARPAbet output, CPU-acceptable, for audio.align — plus its pronunciation dictionary/model files pinned in /vendor/. // BUILDER: pick one, record the license, verify it runs offline before Phase B-1.
A lip-sync provider adapter — start hosted (fal.ai / Replicate / a dedicated vendor already in the vault). Local model optional and license-reviewed per §B1.
A stylized_region-capable, stylizedSafe provider (v1.1) — at least one, verified against the cartoon fixtures before the flag is set. Second one for fallback before B-2b ships.
A cartoon/illustration-domain face or region detector (v1.1, optional) for §B4.5.1 Signal C1, with its license recorded. The path must work without it — verify that by running the fixtures with C1 disabled.
opencv with estimateAffinePartial2D available on whichever worker does the alignment (Node binding or the existing Python worker — one of them, not both). Track C additionally uses Canny + LAB histogram + Laplacian variance from the same install for §B4.5.7 — no new dependency.
New fixtures (build in week 1):
fixtures/lipsync_src_8s.mp4 — single frontal speaker, clean audio, known transcript, no occlusion
fixtures/lipsync_occluded_8s.mp4 — same speaker, a hand crosses the mouth for ~1 s (occlusion-skip path)
fixtures/lipsync_twospeaker_8s.mp4 — two faces, one speaking (speaker-resolution path)
fixtures/rig_marcus/ — a complete 11-shape SO Comic rig (10 visemes + rest) with a matching panel image
fixtures/redub_line.wav — a §A6-synthesized replacement line timed to fit lipsync_src_8s.mp4’s slot
reuse fixtures/ntsc_2997.mp4 to prove the viseme track survives 30000/1001 frame math
v1.1: fixtures/cartoon_talk_8s.mp4 — flat-shaded stylized character, single speaker, clear outlines, no rig
v1.1: fixtures/cartoon_lowcontrast_8s.mp4 — soft-shaded character with weak outlines and a busy background (detection-failure path; must land in awaiting_approval)
v1.1: fixtures/cartoon_cut_8s.mp4 — same character across two hard cuts with an angle change (cut-split path, §B4.5.3)
v1.1: fixtures/cartoon_occluded_8s.mp4 — a speech balloon covers the mouth for ~1 s
v1.1: fixtures/cartoon_photoreal_decoy_8s.mp4 — a cartoon scene containing one realistic poster/photo (resolver must still choose stylized)
v1.1: fixtures/cartoon_refs/ — 4 character reference crops for style_ref_keys
§B10 Golden Tests (append to the master test list)
Alignment round-trip: warpBack(alignFace(landmarks), M⁻¹) returns the original crop region within 0.5 px RMS on all frames of lipsync_src_8s.mp4.
Matrix smoothing: per-frame tx/ty after smoothing has ≤ 40% of the frame-to-frame variance of the raw values, with no more than 1 frame of lag introduced.
Mask containment: in a Track A redub, every pixel outside the lower-face mask on non-re-encoded spans is bit-identical to the source.
Occlusion skip: on lipsync_occluded_8s.mp4, occluded frames pass through untouched and Signal F excludes them from scoring.
Speaker resolution: on lipsync_twospeaker_8s.mp4, the correct face is chosen by anchor match; with the anchor deliberately removed, the job lands in awaiting_approval rather than guessing.
Viseme determinism: the same phonemes array produces a byte-identical viseme_track across two runs, and across 24fps and 30000/1001 assets the timing in ms matches within one frame duration.
Hold rule: no viseme run shorter than the configured minimum survives §B5.3, on any fixture.
Rig completeness: saving a rig missing one viseme is rejected and names the missing key.
Rig render determinism: two renders of the same rig + dialogue track produce byte-identical PNG sequences.
Signal F sensitivity: artificially delaying mixed.wav by 4 frames makes audio.scan’s Signal F report offsetFrames = 4 ± 1 and flag lipsync_offset; the undelayed render flags nothing.
Auto-shift: an injected constant 2-frame offset is auto-corrected and re-verified once; an injected drifting offset (0 → 5 frames across the range) is not auto-corrected and lands in awaiting_approval.
Windowed lipsync: a 300-frame redub on fixtures/ntsc_2997.mp4 runs as 7 §9.5 children under one parent, resumes correctly after a mid-plan worker kill, and shows overlap SSIM ≥ 0.98 inside the mask.
Cache: the same crop + audio window + provider + settings synthesizes exactly one provider call across two runs (mock adapter counter).
Consent gate: a Track A job with likenessEditingEnabled = false fails fast before any spend; the equivalent Track B rig job runs normally.
Lineage: an export downstream of a live-action lipsync node carries both lipsyncApplied and likenessEdited on its lineage edge.
v1.1 — Track C tests:
Resolver correctness: cartoon_talk_8s.mp4 → stylized · lipsync_src_8s.mp4 → live_action · cartoon_talk_8s.mp4 with rig_marcus attached → rig · rig_marcus with one viseme deleted → stylized with resolver_reason naming the incomplete rig · cartoon_photoreal_decoy_8s.mp4 → stylized (a single realistic poster must not flip the path).
No human-face dependency: with InsightFace forcibly disabled, the whole Track C path still runs end-to-end on cartoon_talk_8s.mp4 using a manual anchor. Assert alignFace is never called on a stylized track (spy on the export).
Stylized safety flag: a provider with stylizedSafe: false is never selected for a Track C job even when it advertises stylized_region and is the owner’s default; the job routes past it or fails NO_PROVIDER before spend.
Detection confidence gate: on cartoon_lowcontrast_8s.mp4, automatic detection scores below T_low, the job lands in awaiting_approval with a placement card, and zero provider calls are made (mock adapter counter = 0). Supplying a manual anchor then completes the run.
Region containment: on cartoon_talk_8s.mp4, every pixel outside the tracked region mask on non-re-encoded spans is bit-identical to the source — asserted for both stylized_region and forced full_frame mode.
Style preservation: all four §B4.5.7 checks pass on the accepted candidate; a mock adapter returning a photorealistic mouth fails the texture and palette checks, is rejected, advances the chain, and never reaches the compositor.
Cut split: on cartoon_cut_8s.mp4, the range splits into three sub-ranges at the two detected cuts, each with its own seed and provider call; no mask is tracked across a cut.
Cartoon occlusion: on cartoon_occluded_8s.mp4, balloon-covered frames are marked occluded, pass through untouched, and are excluded from Signal F scoring; stylized_track_loss (F6) does not fire on the occlusion itself.
Stylized lineage + undo: a Track C render appends a stylized_mouth node (never a lipsync node), undo restores the source frames exactly, and an export downstream carries stylizedLipsync = true plus the mode used.
§B11 Build Sequence (slots into the VHE-2 §16 / VHE-4 §A11 tables)
Phase
Scope
Exit gate
B-1 (after VHE-4 A-2)
§B2 migration · §B5 viseme engine (audio.align + mapping + track build) · §B4 Track B rig render · rig editor UI
A 6s SO Comic panel lip-syncs to a §A6 synth line, deterministic re-render, golden tests 6–9 green
B-2 (after VHE-2 Phase 3 + B-1)
§B3 Track A: align/crop/paste-back · one hosted video.lipsync adapter (faceswap_region) · §9.5 windowing · consent gate (§B7)
Redub lipsync_src_8s.mp4 with redub_line.wav; only the lower-face mask changes; tests 1–5, 12–15 green
B-2b (v1.1 — after B-2; may run parallel to B-3 with a second engineer)
§B4.5 Track C: stylized.detect · manual placement · SAM 2 region tracking · fixed-crop region drive · §B4.5.7 style gate · full-frame fallback compositing · §B4.6 resolver · stylized setup panel (§B8)
cartoon_talk_8s.mp4 lip-syncs with a manual anchor and no rig; only the region mask changes; style checks pass; tests 16–24 green
B-3
§B6 Signal F (all tracks, incl. F5/F6) · auto-shift · timeline dialogue lane · second lipsync provider (one per mode) · local adapter if licensed
Tests 10–11 green; a forced 4-frame desync is caught and surfaced before the user sees it; F5/F6 fire on injected style drift and track loss
Sequencing note. B-2b depends on §9.5 windowing and the §7 router, both already in place by B-2, and on nothing from Track A except the occlusion rule and the paste-back pattern. If Track C is the more urgent business need, B-2b can precede B-2 — the resolver simply returns live_action into an unimplemented path, which the UI must render as “not available yet” rather than an error. // BUILDER: if you reorder, implement that guard first.
§B12 Open Questions (answer before Phase B-1)
Forced aligner choice — which one, and is its license clean for commercial use? This blocks §B5.1 and nothing else works without it.
Lip-sync provider — is one already in the vault, or does this need a new account? Which mode does it accept (faceswap_region vs full_frame)? Full-frame providers materially change §B3.4’s paste-back guarantees and I’d rather know now.
Stylized provider (v1.1) — which connected provider, if any, is validated on non-photoreal art? If none is, B-2b’s real first task is evaluating candidates against fixtures/cartoon_* and setting stylizedSafe from measurements. Budget time for that, not just for the adapter.
Cartoon region detector (v1.1) — worth adding a stylized-domain detector for §B4.5.1 C1, or ship manual-placement-first and add C1 later? (ASSUMPTION: manual-first. One tap is a fine interaction, and it removes a dependency and a license question from the critical path.)
Likeness policy — is likenessEditingEnabled a workspace toggle, an admin-only flag, or gated behind a signed agreement? Legal decision, not an engineering one. v1.1 adds: where does a rotoscoped or photoreal-rendered “cartoon” fall? §B7 currently confirms rather than blocks; legal should set that threshold.
SO Comic rig source of truth — do rigs get authored in the platform (rig editor, §B8) or imported from whatever the comic art pipeline already uses? If the latter, VHE-5 needs an importer and the shape format above becomes a target, not the source.
Rig-from-Track-C (v1.1) — when a user lip-syncs the same unrigged character repeatedly, should the system offer to extract a rig from the accepted results (harvest one crop per viseme into a character_rigs row) so future shots take the cheap deterministic path? Attractive, and out of scope for v1.1 unless it’s wanted at launch.
Viseme set granularity — is Preston Blair’s 10 shapes right for the SO Comic style, or does the art call for a smaller (6-shape) or larger (15-shape) set? Cheap to change now, expensive after rigs are drawn.
Multi-speaker scenes — v1 assumes one speaker per dialogue track and one track rendered at a time. Is a two-character conversation in one shot needed at launch? (ASSUMPTION: no — sequential tracks over the same range are supported, simultaneous rendering is B-3+.) v1.1 adds: mixed live-action + animated speakers in one range is explicitly out of scope (§B4.6 rule 6); confirm that’s acceptable.
Does the Partner feature want this? A talking Partner avatar is the same video.lipsync + streaming TTS path. In scope here, or a separate module? (ASSUMPTION: separate — VHE-5 stays file-based, not realtime.)
