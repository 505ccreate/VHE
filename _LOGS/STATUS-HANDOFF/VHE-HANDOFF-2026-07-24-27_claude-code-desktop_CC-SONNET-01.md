# VHE Handoff — 2026-07-24-27

| Field | Value |
|---|---|
| **Logged by** | `CC-SONNET-01` — Claude Sonnet 5 (same room as `CC-OPUS-01`'s work earlier this session; owner switched model via `/model` mid-session) |
| **Platform / room** | Claude Code — Desktop app, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-24 evening EDT |
| **Project phase** | Removal-lane spec gate (VHE-2 §9.2 removal path) — round 2 of Eli review returned, spec STILL NOT build-authorized |

**Keep this file short. Detail belongs in the numbered diary entries. Reference them by number.**

**⚠ The owner has said a NEW ROOM is needed after this session.** Whoever opens that room: start at
`CURRENT-STATUS.md`, then this handoff, then `VHE-ISSUE-LOG-0031` (entry body + **both** appended
corrections, in order) — do not skip either correction round.

---

**Blueprint sections followed:** VHE-2 §9.2 (removal), §9.5 (chunking), §7 (routing/adapters/registry),
§6 (FFmpeg wrapper), §5 (mask format) — spec/review only, no code written against any of them.

**Current working state (one paragraph, factual):** HEAD unchanged at `52e3277` — **zero code changed
this session.** Earlier this session (as `CC-OPUS-01`) the revised removal-lane spec `VHE-ISSUE-LOG-0031`
was written, folding the owner's two design decisions (one fal adapter with internal dispatch; hard-fail
+ one re-track on missing masks) plus all 14 items from `0029`'s first Eli correction. A review package
(`VHE-Progress-update 03_2026-07-24.zip`, 143 files, verified clean) was built and sent to Eli. **Eli
returned a second round: "0031 folds the direction of all 14 original points but is NOT yet
build-authorized — six complete, seven partial, item 8 architecturally incorrect" — with 9 further
numbered corrections**, and explicitly instructed to append rather than rewrite. That correction is now
appended to `0031` (signed `CC-SONNET-01`, since the owner switched the model from Opus to Sonnet
partway through this session). **`0031` is still not build-authorized.** No code, no probe, no key read,
no spend this session.

**Completed this session (as `CC-SONNET-01`, continuing the room `CC-OPUS-01` started):**
- Built `VHE-Progress-update 03_2026-07-24.zip` (PowerShell + `System.IO.Compression.ZipArchive`, per the
  `0030`-corrected method — forward-slash entries, no flattening): 142 lean files + manifest, 873,579
  bytes, SHA-256 `6501AA1F2A097238048C93B5811BC620A5F6EBAD4A069E06B868C7AE3514ADA5`. Verified: 0 backslash
  paths, no `.env`, both `README.md`s coexist at distinct paths, 8 binaries excluded (matches the `02`
  package's count), `0031` + handoff-26 both present.
- Drafted a short plain-language message for the owner to relay to Eli explaining what `0031` was and
  what to check (not itself a log artifact, but the mechanism by which round 2 happened).
- Received Eli's round-2 verdict (relayed by the owner in chat) and, **per the owner's explicit
  instruction to log intent BEFORE starting** (so a session cutoff can be detected by diffing actual state
  against stated plan), wrote `_IN-PROGRESS_CC-SONNET-01.md` with the full 9-item plan before touching
  `0031`.
- Appended the second signed correction to `VHE-ISSUE-LOG-0031` covering all 9 of Eli's round-2 items:
  conditional-required+validated removal request fields incl. `maskVideoKey` routing check + canonicalized
  rational-fps comparison (1); persisted capability/operation/model/handler-identity for correct
  poll/cancel dispatch after resume (2); two-stage routing replacing the circular pre-routing-resolution
  flow (3); new `submission_unknown`/`awaiting_reconciliation` ambiguous-submit state (4); owner+connection
  -scoped operation record, `resultStorageKey` split from the Apply-time asset, retention/promotion flagged
  open (5); mask-encoder determinism retuned to mandatory decision-region identity, raw-pixel identity only
  when the format is lossless (6); boundary-frame-repetition source padding + two-stage (full-then-trimmed)
  output validation (7); **removed "global key/global seed" from the §9.5 removal contract** — the item Eli
  called architecturally wrong, since VOID is seedless (8); reordered §13 so the probe is build-order step
  1, before any implementation (9).
- Updated `LOG-INDEX.md`'s `0031` row (now: 2 correction rounds, still not build-authorized).
- Overwrote `CURRENT-STATUS.md` to reflect the round-2 gate state and the mid-session identifier switch.

**Tested — with actual results:**
- No tests run this session — no code was touched. Suite/preflight remain **153/153 · preflight 13/4/1**
  (unchanged since `0027`, HEAD `52e3277`).

**Files created or changed:**
- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0031_removal-lane-revised-spec_CC-OPUS-01.md` — appended the
  second signed correction (round 2, 9 items).
- `_LOGS/LOG-INDEX.md` — updated `0031`'s status row.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten to the round-2 gate state.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-SONNET-01.md` — created (intent, written before starting the
  correction work), deleted at session close.
- `VHE Backups\VHE-Progress-update 03_2026-07-24.zip` — created (the package sent to Eli for round 2).
- No `packages/`, `scripts/`, `migrations/`, or any source file touched. HEAD `52e3277` unchanged.

**Unfinished / left mid-work:**
- Nothing mid-work. Round 2's correction is complete and self-contained in `0031`.
- **`0031`'s design has NOT yet been re-consolidated to reflect round 2** — a future session must read
  BOTH appended corrections together with the entry body to get the true current design (this is by
  design, per the "append, don't rewrite" rule, but it means `0031`'s body text alone is now stale in
  several places: §7's resolution flow, §10's seed framing, §6.2's determinism framing, §9.2's field
  names, and §13's build order are all superseded by round 2's correction).
- `VHE-Progress-update 03` does **not** contain round 2's correction (it was appended after the zip was
  sent). If the owner sends `0031` back to Eli for a third look, a new package (`04`) is needed.

**Next recommended action:**
1. **Get a third pass on `0031`** — either fold round 2 into a cleaner consolidated read for Eli, or have
   the owner ask Eli directly whether the appended round-2 correction (as text, no new zip needed if Eli
   can review it in chat) resolves everything. Do NOT build or probe without a fresh explicit go.
2. If/when authorized: the zero-spend probe (`0031` §11) is now **build-order step 1** per round 2 item 9
   — still separately gated on the owner's explicit key/network approval. No media, no inference, no spend.
3. Any actual build work must read `0031`'s body **and both correction rounds** — building against the
   original §13 order or the original §7/§10 mechanisms (superseded by round 2) would be wrong.
4. Still-open standing items (unblocked, untouched): the 4 frozen §1 fixtures; a concrete `S3_REGION` for
   the live fal `image.inpaint` validation (`0027`).

**Blockers, warnings, dependencies, open decisions:**
- **Explicitly NOT authorized until stated otherwise:** the fal zero-spend probe, reading the fal API key
  file, any provider call, any spend, any removal-lane code.
- **Retention/promotion window for unapplied cached removal outputs is an [OPEN — owner decision]**
  (round-2 item 5) — not invented, needs the owner's input at build time.
- **Naming resolved:** "Marcus" = the owner's (Ashley's) standing nickname for this Claude Code assistant;
  "Eli" = her nickname for the ChatGPT reviewer. Confirmed by the owner directly this session — not a
  mix-up, no need to re-flag. Formal logs still sign with the registry identifier regardless.
- **This session used two identifiers** (`CC-OPUS-01` then `CC-SONNET-01`) because the owner changed the
  active model mid-session. Both are correct per `AI-ACCOUNT-REGISTRY.md` (different model, same account
  = different identifier) — not an inconsistency to chase down.
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via §6 wrapper. Node v22.23.1. Python `py -3.11`. Never
  recursively scan `library/tools/`. Never echo live keys. `.env` KEK; losing it makes encrypted provider
  rows unreadable.

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0031` — the spec; read the body, then round-1 correction (14 items, folded/historical),
  then round-2 correction (9 items, **governs** where it conflicts with the body).
- `VHE-ISSUE-LOG-0029` — the original spec (superseded by `0031`); background only.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling both specs discharge.
- `VHE-ISSUE-LOG-0030` — the backup/zip-packaging method this session's `Progress-update 03` build followed.
