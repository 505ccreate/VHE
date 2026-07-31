> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `VHE-4_Voice_and_Audio_Layer_Addendum_v1.1_7-18-2026.docx` on 2026-07-19 13:05 Eastern Daylight Time.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

Correction Studio — VHE-4: Voice & Audio Layer
Addendum module to the VHE-2 Execution Plan · v1.1 · July 18, 2026 (v1.1 adds §A6.5 Signal E audio scan, fixture, tests 8–9)
Nothing in VHE-1/2/3 is replaced. This document only ADDS. Same rules of engagement as VHE-2 §0: execute in order, copy code verbatim, never invent an FFmpeg command outside the wrapper.

§A0 What This Module Adds (scope)
Correction Studio fixes what AI video gets wrong visually. VHE-4 gives it ears and a mouth:
Audio detach — on any imported/generated video, split the audio track away from the video into its own editable lane (simple demux, or full stem separation: vocals / music / everything-else).
Replace or change the audio — mute a range, drop in an uploaded track, or regenerate speech: transcribe what’s said, edit the transcript like text, and re-synthesize only the words that changed.
Provider-agnostic TTS/STT — same BYOK philosophy as VHE-2 §7. Whatever keys the user has connected (OpenAI, Gemini, ElevenLabs, etc.), the system pulls each provider’s live voice catalog, exposes every voice it offers, and routes synth jobs through the same capability router.
Voice Lab (the control panel) — pick a voice, calibrate pitch / rate (cadence) / tone / style, audition it, and save it as a named Voice Preset. Presets are normalized, so one preset produces the closest possible match on any connected provider.
Platform-wide presets — the same voice_presets table serves Correction Studio narration AND the Partner chat feature. One saved voice identity, used everywhere on the platform.
Dependencies: VHE-2 §2 (schema), §3 (ingest), §4 (job lifecycle), §6 (FFmpeg wrapper), §7 (adapters/routing). Do not start VHE-4 before Phase 0 of VHE-2 has passed its exit gate.

§A1 New Capabilities (extends the VHE-2 §7 Capability type)
export type Capability =  | /* …all existing VHE-2 capabilities… */  | "audio.tts"        // text → speech  | "audio.stt"        // speech → text with word-level timestamps  | "audio.voices"     // list the provider's voice catalog  | "audio.separate"   // stem separation (vocals / music / other)  | "audio.clone";     // custom voice from user samples — OPTIONAL, consent-gated (§A8)
Manifest additions per capability (extends CapabilityManifest):
"audio.tts": {  maxChars: number;                 // per request  streaming: boolean;               // true → usable for Partner realtime chat  supportsSpeed: boolean;           // native rate control  supportsPitch: boolean;           // native pitch control (rare — see §A3)  supportsStylePrompt: boolean;     // free-text style/tone instructions  supportsSSML: boolean;  outputFormats: string[];          // e.g. ["mp3","wav","pcm16"]  costHintCentsPer1kChars?: number;}"audio.stt": { maxDurationSec: number; wordTimestamps: boolean; costHintCentsPerMin?: number }"audio.separate": { stems: string[] }   // e.g. ["vocals","drums","bass","other"]
Routing is unchanged — the VHE-2 §7 router filters connections by capability + limits and returns the ordered chain. TTS jobs walk the chain exactly like inpaint jobs do.

§A2 Schema Additions (migration 0002 — additive only)
CREATE TABLE voice_presets (  id             TEXT PRIMARY KEY,            -- ulid  owner_id       TEXT NOT NULL,  label          TEXT NOT NULL,               -- "Marcus late-night", "Ad-read punchy"  provider_slug  TEXT NOT NULL,               -- provider it was authored against  voice_id       TEXT NOT NULL,               -- provider's voice identifier  settings       JSONB NOT NULL,              -- normalized VoiceSettings (§A3)  provider_overrides JSONB NOT NULL DEFAULT '{}',  -- raw per-provider knobs, keyed by slug  sample_key     TEXT,                        -- cached audition clip in storage  scope          TEXT NOT NULL DEFAULT 'global'                 CHECK (scope IN ('studio','partner','global')),  -- 'global' = both surfaces  is_default_for TEXT[] NOT NULL DEFAULT '{}',      -- e.g. {'studio.narration','partner.chat'}  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now());CREATE INDEX ON voice_presets (owner_id, scope);CREATE TABLE voice_catalog_cache (  provider_slug  TEXT NOT NULL,  owner_id       TEXT NOT NULL,               -- catalogs can differ per account (ElevenLabs library)  voices         JSONB NOT NULL,              -- VoiceCatalog (§A4)  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  PRIMARY KEY (provider_slug, owner_id));-- TTL: refresh when fetched_at older than 24h, and always on (re)connect of the provider.
New jobs.type values (comment-list only, no schema change): 'audio.detach' | 'audio.separate' | 'audio.transcribe' | 'audio.synth' | 'audio.mix'.
New edit-graph ops (append to the VHE-2 §11 EditNode union — the audio lane is part of the same non-destructive graph, same undo/redo semantics):
| { id: string; op: "audio_detach";  sourceAssetId: string; audioAssetId: string }| { id: string; op: "audio_mute";    startMs: number; endMs: number }| { id: string; op: "audio_replace"; startMs: number; endMs: number; assetId: string;    gainDb: number }                                   // uploaded track or synthesized clip| { id: string; op: "audio_synth";   startMs: number; endMs: number; presetId: string;    text: string; resultKey: string }                  // resultKey cached like inpaint| { id: string; op: "audio_gain";    startMs: number; endMs: number; gainDb: number }
Storage layout additions (deterministic, per VHE-2 rules):
audio/{assetId}/detached.wav                     -- demuxed original track, PCM for editingaudio/{assetId}/stems/{vocals|drums|bass|other}.wavaudio/{assetId}/transcript.json                  -- §A6 word-timestamped transcripttts/{presetId}/{sha256(text+settings)}.wav       -- synth cache: same text+preset never bills twice

§A3 Normalized Voice Settings (the design decision everything hangs on)
Providers do not agree on knobs. OpenAI exposes speed and free-text style instructions; Gemini TTS is prompt-styled with named voices; ElevenLabs exposes stability, similarity_boost, style, speed; almost nobody exposes true pitch. If presets store raw provider knobs, they die the moment the user switches providers. So:
Rule 1 — presets store normalized settings. One shape, provider-independent:
export const VoiceSettings = z.object({  rateX:          z.number().min(0.5).max(2.0).default(1.0),   // cadence/speed multiplier  pitchSemitones: z.number().min(-12).max(12).default(0),      // musical semitones  expressiveness: z.number().min(0).max(1).default(0.5),       // flat ↔ dramatic  stability:      z.number().min(0).max(1).default(0.6),       // consistent ↔ variable takes  stylePrompt:    z.string().max(500).default(""),             // "smooth late-night radio, warm, unhurried"  volumeDb:       z.number().min(-20).max(6).default(0),});
Rule 2 — adapters map what they can, post-FX covers the rest. Each TTS adapter declares which normalized fields it maps natively. Any field the provider can’t honor is applied deterministically in post by the FFmpeg wrapper (§A5.4: atempo for rate, asetrate+aresample+atempo for pitch, gain for volume). This is what makes one preset sound close on every provider instead of only working on one.
Rule 3 — the mapping table lives in the adapter, not in shared code. Reference mappings to implement first:
Normalized field
OpenAI TTS
Gemini TTS
ElevenLabs
rateX
native speed
style-prompt hint + post-FX trim
native speed
pitchSemitones
post-FX
post-FX
post-FX
expressiveness
style instructions text
style prompt
style
stability
— (post: none, ignore)
—
stability
stylePrompt
instructions
prompt prefix
— (voice choice carries it)
volumeDb
post-FX
post-FX
post-FX
The synth job records in its output which fields were native vs. post-FX vs. ignored — the Voice Lab shows this honestly (“pitch applied in post on this provider”) instead of pretending every knob is native.

§A4 TTS/STT Adapter Surface (extends ProviderAdapter)
export interface VoiceCatalogEntry {  voiceId: string;            // provider's identifier, verbatim  name: string;               // display name  language?: string; gender?: string; tags?: string[];   // as provided; never invented  previewUrl?: string;        // provider-hosted sample if offered}export interface VoiceCatalog { providerSlug: string; voices: VoiceCatalogEntry[]; fetchedAt: string; }export interface TtsAdapter extends ProviderAdapter {  listVoices(key: string): Promise<VoiceCatalog>;  synth(key: string, req: {    text: string; voiceId: string; settings: VoiceSettings;    format: "wav" | "mp3"; ssml?: boolean;  }): Promise<{ audioKey: string; durationMs: number; nativeApplied: string[]; costCents?: number }>;  transcribe?(key: string, req: { audioKey: string; language?: string }): Promise<{    text: string;    words: { w: string; startMs: number; endMs: number }[];   // word timestamps REQUIRED for §A6  }>;}
Hard rule: never hardcode a voice list in app logic. Catalogs drift monthly. listVoices is called on connect and on 24h-stale cache reads; the Settings UI renders only what the API actually returned. The seed lists below exist ONLY as dev fixtures for offline work and as documentation of the expected shape — a builder must verify against the live API at build time:
// SEED / DEV FIXTURE ONLY — verify against live APIs at build time; catalogs change.export const SEED_CATALOGS = {  "openai-tts": ["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse"],  "gemini-tts": ["Zephyr","Puck","Charon","Kore","Fenrir","Leda","Orus","Aoede","Callirrhoe",                 "Autonoe","Enceladus","Iapetus","Umbriel","Algieba","Despina","Erinome","Algenib",                 "Rasalgethi","Laomedeia","Achernar","Alnilam","Schedar","Gacrux","Pulcherrima",                 "Achird","Zubenelgenubi","Vindemiatrix","Sadachbia","Sadaltager","Sulafat"],  "elevenlabs": [],   // fully dynamic — user's own voice library; ALWAYS fetched, never seeded};
Local models are just another provider (same as VHE-2 §7): with LOCAL_GPU=true, register faster-whisper (STT with word timestamps) and Demucs (audio.separate) under the internal local connection. API-only deployments route STT to a hosted provider and stems to a hosted equivalent, or gray the feature out.

§A5 FFmpeg Audio Recipes (append to the VHE-2 §6 wrapper — the ONLY place these strings exist)
A5.1 Detach audio (demux — lossless, instant)
# editing copy (PCM — every downstream audio op works on WAV, encode only at export):ffmpeg -y -i {input} -map 0:a:0 -ac 2 -ar 48000 -c:a pcm_s16le audio/{assetId}/detached.wav# video-without-audio working copy:ffmpeg -y -i {input} -map 0:v:0 -c copy video_only.mp4
If ingest probe shows no audio stream, audio.detach fails fast with MEDIA_CORRUPT? No — new error code: NO_AUDIO_TRACK (retryable: no). Add it to the VHE-2 §4.3 taxonomy. The UI offers “add a voice track instead” on that code.
A5.2 Replace / attach the audio track
ffmpeg -y -i video_only.mp4 -i new_audio.wav -map 0:v:0 -map 1:a:0 \  -c:v copy -c:a aac -b:a 192k -movflags +faststart out.mp4
Video is always -c copy here — audio operations never re-encode video. If new audio is shorter than video, it pads with silence at mix time (§A5.3), never with -shortest (that truncates video — same reasoning as the VHE-2 P2.4 rule).
A5.3 Mix lanes (original bed + replacements + synth clips)
Build one filtergraph per render from the audio-lane edit nodes. Pattern (wrapper composes it; nothing else does):
# example: original bed ducked under a synth clip inserted at 4.0sffmpeg -y -i detached.wav -i tts_clip.wav -filter_complex \ "[1:a]adelay=4000|4000[voc]; \  [0:a]volume=1.0[bed]; \  [bed][voc]amix=inputs=2:duration=first:normalize=0[out]" \ -map "[out]" -c:a pcm_s16le mixed.wav
Rules: normalize=0 always (amix’s auto-normalize wrecks levels); every inserted clip gets a 15 ms fade-in/out (afade) at its boundaries to kill clicks; loudness normalization (loudnorm, −14 LUFS) happens ONCE, at export, via the existing VHE-2 §12 builder — never mid-pipeline.
A5.4 Post-FX: rate and pitch (the deterministic fallback for §A3)
# RATE (cadence) without pitch change — atempo only accepts 0.5–2.0 per stage; chain if outside:ffmpeg -y -i in.wav -af "atempo={r}" out.wav                       # 0.5 ≤ r ≤ 2.0# PITCH shift by S semitones WITHOUT changing duration:#   factor p = 2^(S/12); resample shifts pitch AND speed; atempo=1/p restores speed.ffmpeg -y -i in.wav -af "asetrate=48000*{p},aresample=48000,atempo={1/p}" out.wav
p computed in TS as Math.pow(2, semitones / 12), clamped so 1/p stays inside atempo’s 0.5–2.0 range (i.e. |S| ≤ 12). Both filters are deterministic — same input, same preset, same output — which is what makes the synth cache key (§A2 storage) valid.
A5.5 Time-fit (synth clip must land in a fixed slot)
Replacing spoken words (§A6) means the new audio must fit the original gap. Rule: measure synth duration; if |target/actual − 1| ≤ 0.15, apply atempo=target/actual; beyond ±15% never stretch — re-synth with rateX adjusted, and if still out of range, flag the job awaiting_approval with a “reword or accept timing drift” decision. Stretched speech past 15% sounds broken; wrong is worse than slow (same philosophy as VHE-2 §9.5).
A5.6 Stem separation (local Demucs; hosted adapter otherwise)
demucs --two-stems=vocals -n htdemucs -o audio/{assetId}/stems/ detached.wav   # fast path: vocals vs restdemucs -n htdemucs -o audio/{assetId}/stems/ detached.wav                      # full 4-stem
Runs on the Python worker, queue audio.separate. This is what makes “replace the voice but keep the music” possible on real-world clips.

§A6 Work Order: Transcribe → Edit → Re-synthesize (change what the video says)
The headline feature: treat speech like text.
Detach (§A5.1) → transcribe via audio.stt routing. Persist transcript.json: full text + word-level {w, startMs, endMs} array. Word timestamps are non-negotiable — an adapter without them doesn’t get the audio.stt capability flag.
UI shows the transcript as editable text synced to the timeline (click a word → playhead jumps).
User edits words/sentences. The diff engine groups contiguous changed words into spans, each padded to the nearest silence gap ≥ 120 ms on both sides (cutting mid-breath sounds amateur; the gap boundaries come from the word timestamps).
Per span: synth the replacement text with the active Voice Preset (audio.synth job, cache key = sha256(text+settings+voiceId)) → time-fit (§A5.5) → splice into the lane with 15 ms crossfades (§A5.3).
Only changed spans are ever synthesized. Untouched audio is untouched — the audio equivalent of VHE-2’s “never re-encode untouched frames.”
Apply = audio_synth edit nodes appended to the graph; original detached.wav is never modified. Export runs the mix (§A5.3) then attaches to video (§A5.2).
Voice-match note (honest limitation): replacing words inside someone’s existing speech with a catalog TTS voice will not match the original speaker. The UI must say so up front and offer the real options: (a) replace the whole speech segment in the preset voice, or (b) audio.clone (§A8) if a provider supporting it is connected and consent requirements are met.

§A6.5 Work Order: Audio Anomaly Scan (Signal E — the scanner gets ears)
VHE-2 §9.4 scans video for hallucinations; nothing scans audio. This closes that hole. Same philosophy, same suggestion pipeline, and zero new dependencies — every detector below is a deterministic FFmpeg filter already in the wrapper’s toolbox.
New job type: audio.scan. Runs on detached.wav (or on mixed.wav as post-mix QC). Never on the master.
A6.5.1 Detectors (all four, fused like §9.4)
#
Detector
Method (wrapper-only)
Flags
E1
Splice click / pop
sample-delta at every audio_replace/audio_synth join: if adjacent-sample jump > 0.30 full-scale at a boundary, the crossfade failed
audio_click
E2
Loudness jump
ebur128 short-term (400 ms windows); adjacent-window delta > 6 LU
audio_loudness_jump
E3
Dead air vs. transcript
silencedetect (−40 dB, min 1.5 s); flag any silence that overlaps words in transcript.json — speech the transcript says exists but the audio doesn’t
audio_dead_air
E4
Clipping
astats per 1 s window; peak ≥ 0 dBFS sustained across ≥ 3 consecutive windows
audio_clipping
False-positive suppression (the §9.4 Signal-D analog, equally non-optional): E2 flags within ±2 frames of a PySceneDetect scene cut are discarded — music and ambience legitimately jump at cuts. E3 only fires when a transcript exists; no transcript, no dead-air detector.
A6.5.2 Output & when it runs
Spans convert to master-clock ms and land in the same suggestion system as §9.4: amber markers on the audio lane, tap → pre-loaded range with a hint (“possible splice click at 4.02s”). Thresholds live in the config table, not code. Runs automatically after every audio.mix; on demand via “Scan audio”; never automatically on plain uploads (user’s own audio isn’t presumed broken — same rule as video).
Nothing auto-repairs from Signal E in v1. Audio fixes are one tap away but always human-confirmed; the repair actions offered are re-crossfade (E1), gain ramp (E2), re-synth the span (E3), and limiter/re-gain (E4).
A6.5.3 Duration invariant (the sync guarantee)
Span surgery is duration-preserving by definition: time-fit (§A5.5) stretches every synth clip to its exact slot, so mixed.wav must contain the same sample count as detached.wav, exactly. Any mismatch is a bug, not a rounding artifact — the mix job fails hard on it rather than shipping A/V drift. This is the audio twin of VHE-2’s rational-fps rule: sync errors are never “close enough.”

§A7 Work Order: Voice Lab (the control panel)
Lives in Settings → Voices, and as a compact popover wherever a voice is picked (Fix Bar audio mode, Partner settings).
Provider column: only connected providers with audio.tts. Each shows live catalog status (fetched Xh ago · refresh button).
Voice grid: every voice from listVoices, with name/language/tags as returned, provider preview if offered, and an Audition button — synthesizes one fixed audition sentence through the current slider settings so comparisons are apples-to-apples. Auditions hit the synth cache; repeat listens are free.
Calibration panel: sliders for the normalized VoiceSettings — Rate (cadence), Pitch, Expressiveness, Stability, Volume — plus the Style prompt box (“smooth late-night radio host, warm, unhurried, Philly”). Fields the current provider can’t honor natively show a small “post” badge (per §A3 Rule 2 honesty rule).
Save as Preset: name it, pick scope (Studio / Partner / Global), optionally set as default for studio.narration or partner.chat. Saving also renders and stores the audition clip as sample_key so the preset list can play instantly without a provider call.
Cross-provider behavior: selecting a preset while a different provider is active keeps the normalized settings, prompts the user to pick the nearest voice on that provider once, and stores that choice in provider_overrides[slug].voiceId — after which the preset is fully portable.
Partner integration contract: Partner chat reads voice_presets where scope IN (‘partner’,‘global’) and honors is_default_for = 'partner.chat'. For realtime chat, Partner’s router adds one filter: manifest.streaming === true. Nothing else about Partner changes in this document.

§A8 Voice Cloning (audio.clone) — consent-gated, off by default
Disabled unless the workspace flips voiceCloningEnabled AND the provider connection supports it.
Source samples must come from the user’s own uploads; the consent acknowledgment (identity + right to clone) is recorded on the created voice’s row in provider_overrides and in lineage (meta.consent = true, timestamp, user id).
Cloned voices appear in the catalog tagged cloned; exports that used a cloned voice carry meta.clonedVoice = true in their lineage edge. No silent clones, ever.
Budget gate (VHE-2 §4) applies; clone creation is typically the most expensive audio op.

§A9 Pre-Flight Additions (append to VHE-3 checklist)
faster-whisper (Python) + a base/int8 model — local STT with word timestamps (LOCAL_GPU optional; runs CPU-acceptably)
demucs (Python, htdemucs weights) — stem separation (GPU strongly preferred)
TTS/STT adapters to write first: OpenAI, Gemini, ElevenLabs (all three confirmed in the brief); hosted STT fallback for API-only deployments
New fixtures (build in week 1):
fixtures/speech_10s.mp4 — clean single-speaker talking clip with accurate reference transcript
fixtures/music_speech_mix.mp4 — speech over a music bed (stem-separation target)
reuse fixtures/no_audio.mp4 for the NO_AUDIO_TRACK path
fixtures/audio_glitch_10s.wav — generated from speech_10s by injecting one hard splice click, one +8 LU loudness jump, and one 2 s silence over transcribed words (build script, not hand-made — must be reproducible)

§A10 Golden Tests (append to the master test list)
Detach/attach round-trip: demux then re-attach with zero edits → video stream bit-identical to source, audio within codec tolerance.
No-audio path: audio.detach on fixtures/no_audio.mp4 → fails fast with NO_AUDIO_TRACK, no partial artifacts.
Preset portability: one preset (rateX 1.15, pitch −2) rendered through two different mock adapters (one native-speed, one not) → measured tempo within 2% and pitch within 30 cents of each other.
Synth cache: identical text+preset synthesized twice → exactly one provider call (mock adapter counter, same pattern as VHE-2’s idempotency test).
Span surgery: edit 3 words in the middle of speech_10s.mp4’s transcript → exactly one synth span, untouched samples outside the span bit-identical, crossfades present at both joins.
Time-fit ceiling: force a synth 40% longer than its slot → job lands in awaiting_approval, never auto-stretched.
Mix determinism: same edit-graph audio nodes rendered twice → byte-identical mixed.wav.
Signal E accuracy: audio.scan on fixtures/audio_glitch_10s.wav emits exactly one audio_click, one audio_loudness_jump, and one audio_dead_air span, each overlapping its injected defect; the same scan on clean speech_10s emits zero spans.
Duration invariant: after span surgery, mixed.wav sample count equals detached.wav sample count exactly; a deliberately mis-fitted mock clip makes the mix job fail hard (no silent A/V drift).

§A11 Build Sequence (slots into the VHE-2 §16 table)
Phase
Scope
Exit gate
A-1 (after VHE-2 Phase 1)
§A2 migration · §A5.1/.2 detach+attach · one TTS adapter + Voice Lab minimal (catalog, audition, save preset)
Detach → replace full track with a preset-voiced TTS clip → export, on speech_10s.mp4
A-2 (after VHE-2 Phase 3)
STT + transcript editing (§A6) · time-fit · mix lanes · audio scan (§A6.5) · second + third TTS adapters · post-FX mapping
Edit 3 words → only that span re-synthesized → golden tests 1–9 green (Signal E lands here)
A-3
Stems (Demucs/hosted) · Partner preset integration · streaming filter · clone (if approved)
“Replace the voice, keep the music” works on music_speech_mix.mp4; Partner uses a Studio-saved preset

§A12 Open Questions (answer before Phase A-1)
Confirm launch TTS providers: OpenAI + Gemini + ElevenLabs, in that priority order? Any others already in the vault?
Voice cloning at launch (legal/consent review required) or A-3+?
Stems: local Demucs (needs the GPU decision from VHE-2 §17 settled) or hosted-only?
Partner chat: does it need streaming TTS at launch (different endpoints, latency budget) or is batch acceptable for v1?
Music: is a licensed-music/library lane in scope for this module, or strictly voice for now? (ASSUMPTION: strictly voice; music is drop-your-own-file.)
Does Partner already store any voice settings today that need migrating into voice_presets?
