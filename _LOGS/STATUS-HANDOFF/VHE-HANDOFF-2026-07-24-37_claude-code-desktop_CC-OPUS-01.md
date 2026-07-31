# VHE Handoff — 2026-07-24-37 (ROOM CLOSING → transfer to a fresh room)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (ruling 2026-07-24: Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" — **THIS ROOM IS CLOSING** |
| **Session window** | 2026-07-24, ~14:54 → ~20:0x EDT |
| **Project phase** | Removal-lane spec gate — **rounds 7, 8, and 9 all filed on `0033` in this session.** Spec REJECTED at round 9. Still NOT build-authorized. |

**This is the final handoff for this room.** Pickup point for the new room:
`START-HERE_NEW-ROOM_2026-07-24.md` (read `CURRENT-STATUS.md` first, then START-HERE, then this file).

---

**Blueprint sections followed:** VHE-2 §4 (worker/claim/heartbeat/budget gate/error taxonomy) · §7
(routing) · §9.5 (chunked repair) · §2 (schema) — **spec/correction only, no code written.**

## What this room did

Opened as Sonnet, read the log chain, reported the gate state. Ashley switched to Opus 5 and relayed
three consecutive reviewer verdicts; the room ran **three full review rounds (7, 8, 9)** and closed.
Handoffs 35 (round 7) and 36 (round 8) carry the per-round detail; this handoff closes the room and
covers round 9.

**Round-9 package audit: PASS.** Eli independently confirmed `Progress-update 11`'s 157 entries, 986,142
bytes, SHA-256 `204771A8517FE58A63BF1FEAB26CF08216602F5E2A16C3768B3CCF3AA58D4E7C`, ZIP integrity, no real
`.env`, no invalid/duplicate/absolute/traversal/backslash/symlink paths, no scratch file, no
`library/tools` leak, all eight stripped binaries listed — **and, importantly, verified that `0033` is
append-only with Update 10's complete `0033` an exact prefix, that `0032` is byte-for-byte unchanged, and
that no source files changed between Updates 10 and 11.** The append-only discipline is now externally
verified, not just asserted.

**Round-9 verdict: specification REJECTED, five blockers. All five correct.**

## Round 9's five blockers — and the honest shape of this session

| # | Blocker | Why it mattered |
|---|---|---|
| 1 | **Operation-claim behavior contradicts itself** | R8·3 said a zero-row operation claim is a candidate-level skip; R8·6 said it rolls back the routing attempt and reservation. **Both governed the same event, and both were wrong** — a claim miss proves nothing about the candidate. Fixed: branch on the *existing operation state* (`succeeded`→reuse / `submitting`,`in_flight`→attach / `submission_unknown`→park / `failed`→retry rule), never auto-skip into a second paid operation. Transaction model split into TX-A (routing claim + reservation) and per-candidate TX-B, with rollback scoped to that candidate's attempt only. Also defines the previously-missing reservation handling for zero-spend cache reuse and for attaching to a running operation |
| 2 | **Compensation/reaper can erase an ambiguous submission** | R8·6 released reservations "because acceptance was never proven" — **reintroducing the exact "not proven accepted ⇒ proven not accepted" fallacy rounds 5–6 had already outlawed** — and its reaper guarded `accepted`/`submission_unknown` but not `submitting`, the precise crash-after-transmit state. Fixed with a durable `prepared → submitting` boundary committed **before the first byte**, so only provably-never-transmitted rows may be released |
| 3 | **The current-attempt pointer isn't safely bound** | `provider_operations.current_attempt_id` lives on a row **shared** by every request with the same connection+cache key, so it cannot say which routing attempt authorizes *this job*. Fixed with a `job_execution_bindings` table plus six composite FKs that make cross-operation and cross-routing pointers structurally impossible |
| 4 | **Budget fallback loses pre-ledger spend** | My `NOT EXISTS` predicate excluded a job's **entire** historical `cost_cents` once any reservation existed — $5 pre-ledger + $3 reconciled rerun counted **$3, not $8**. Fixed by backfilling historical spend as frozen ledger rows and **deleting the fallback term entirely** |
| 5 | **The chunk parent has no durable blocked state** | R7·3 left the parent `running` while blocked, but `executeClaimed`'s `finally` clears the heartbeat (`worker.ts:83-85`) the moment the handler returns — so the parent goes stale at 120s, is taken over (`:39-40`), re-enters, blocks, returns, forever, with `attempt` inflating each cycle. Fixed with an additive `awaiting_children` parked state + guarded no-attempt-increment resume + same-transaction wake-up + sweeper |

**The candid read on this session:** rounds 7 and 8 each fixed real defects and each introduced new ones
that the next round caught. Round 9's first two blockers were **self-contradictions inside round 8** that
a careful re-read of my own appends would have caught before filing. I have written that lesson into
`START-HERE` for whoever picks this up, because it is the most useful thing this session produced beyond
the spec itself.

**Also corrected (R9·0):** my own repeated claim that `.env.example` is "all-empty." It is
credential-free but carries two non-secret defaults (`S3_REGION=auto`,
`VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296`). Standing wording is now "all credential-bearing values are
empty; safe non-secret configuration defaults are permitted." The packaging safety check itself was
always correct.

**Tested — with actual results:** **No tests run in this entire session. No source file was touched**, so
there was nothing to re-run. Suite/preflight remain **153/153 · preflight 13/4/1**, last measured at
`52e3277`; every commit since has touched only `_LOGS/` and one binary `.docx`.

## Administrative direction received and applied (round 9)

- Keep `CC-OPUS-01`; no identifier change. ✅
- Do not run the probe · do not access the fal key or network · do not implement removal-lane code. ✅
  (nothing of the kind occurred in any of the three rounds)
- Append round 9, update logs/status/handoff, cut `Progress-update 12`, stop. ✅
- **No further commit until the round-nine correction set is complete.** ✅ — one commit made at the end,
  after all logs were written.

## Files created or changed (this room, all three rounds)

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **rounds 7, 8, 9 appended.** Body and rounds
  5–6 untouched; each append preserved as filed.
- `_LOGS/LOG-INDEX.md` — `0033` row extended three times. **Next unused number is still `0034`.**
- `_LOGS/AI-ACCOUNT-REGISTRY.md` — `CC-OPUS-01` records Opus 5; model-version question marked RESOLVED.
- `_LOGS/README.md` — Progress-update history extended with `10`, `11`, `12`; `PACKAGE-PROVENANCE.md`
  rule added; `.env.example` wording corrected.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten to the round-9 room-transfer state.
- `_LOGS/STATUS-HANDOFF/START-HERE_NEW-ROOM_2026-07-24.md` — **rewritten** for the round-9 transfer.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-24-{35,36,37}_...md` — round-7, round-8, and this closing
  handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created and deleted twice (once per work block).
- `VHE Backups\VHE FOR Review\VHE-Progress-update {10,11,12}_2026-07-24.zip` — created.
- **No `packages/`, `scripts/`, `migrations/` or any source touched. `0032` NOT rewritten. `0033`'s body
  and rounds 5–8 NOT rewritten** — externally verified by Eli's prefix check on Update 11.

## Unfinished / left mid-work

Nothing mid-work. Stopped deliberately at the review gate, as instructed.

## CARRY-OVER — FOR ELI (relay with `Progress-update 12`)

Round 9 is appended to `0033`. Please confirm against `12`:

1. Do the five round-9 resolutions clear the blockers, or do any remain?
2. Are these specific choices acceptable: (a) the **claim-miss state table** — in particular that
   attaching to a running operation **releases** the attaching job's own reservation, on the invariant
   that exactly one held reservation exists per billable operation; (b) **TX-A / per-candidate TX-B** with
   rollback scoped to the candidate's attempt only; (c) the **`prepared` → `submitting` boundary
   committed before the first byte** as the sole basis for the abandon/release right; (d)
   **`job_execution_bindings` + six composite FKs** rather than widening the verbatim `jobs` table;
   (e) **backfilling historical spend as frozen `origin='backfill'` ledger rows** and deleting the
   `NOT EXISTS` fallback outright (vs. your `preledger_cost_cents` alternative — I chose backfill because
   it removes the bug class rather than patching the predicate); (f) **parking the parent in
   `awaiting_children`** rather than keeping a live heartbeating orchestrator (chosen because an
   `awaiting_approval` child can block for days).
3. If it clears: confirm the exact next gate. You stated it is the zero-spend fal metadata probe **only
   after the complete specification is approved** — please confirm whether round-9 approval constitutes
   that. If items remain: they get **appended to `0033`** as round 10; do not rewrite `0032`, `0033`'s
   body, or rounds 5–9.

## CARRY-OVER — FOR ASHLEY

1. **Zero-spend probe — still gated on you, in person, and now also behind the spec.** Eli clarified at
   round 9 that the probe is **not** the immediate next gate: round-nine spec review is. The probe comes
   only after the full spec is approved, and still needs your live authorization on top. Nothing was
   read, called, or spent in any of this session's three rounds.
2. **No full backup was cut this session.** Ashley asked for review ZIPs only, and Eli's instruction named
   `Progress-update 12` specifically. The last full backup is **`v08`**; next would be **`v09`**. Nothing
   is at risk — everything is committed to git — but say the word if you want `v09` cut.
3. **`S3_REGION`** concrete value for the live fal `image.inpaint` validation (`0027`) — still
   outstanding, non-blocking.
4. **The 4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`,
   `bad_hand_6s.mp4`) — still owed as files; the only Phase-0 exit-gate FAILs (`0009`/`0011`).
5. **Identifier question is closed** — stay `CC-OPUS-01`, no split. Registry updated.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–9 appends
  (do NOT rewrite — takes further appended corrections).**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5, 6, 7, 8, **9** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling the whole chain discharges.
