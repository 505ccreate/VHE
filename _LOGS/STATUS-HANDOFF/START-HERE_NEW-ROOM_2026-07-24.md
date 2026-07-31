> ⚠️ **SUPERSEDED — do not follow this file.** It describes the **round-9** transfer. The current pickup
> document is **`START-HERE_NEW-ROOM_2026-07-27.md`** (round-10 transfer), with
> `VHE-HANDOFF-2026-07-27-40_...` as the closing handoff. Kept as history only.

# START HERE — new Claude Code room (rewritten 2026-07-24 at the **round-9** room close)

You are picking up the **Correction Studio (VHE)** removal-lane work in a fresh room. The previous room
closed cleanly after running spec-review **rounds 7, 8, and 9** and filing all three corrections on
`0033`. **Nothing is mid-work.**

> This file has been rewritten at each transfer. It previously described the round-6 transfer; it now
> points at the **round-9** state. The authoritative closing handoff is **handoff 37**.

## Read in THIS exact order

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — where the project actually stands.
2. **this file** — you are here.
3. `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-24-37_claude-code-desktop_CC-OPUS-01.md` — the **closing
   handoff** (contains the CARRY-OVER blocks: questions for Ashley, and questions to relay to Eli).
4. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — read the body **and all five appended
   corrections** (rounds 5, 6, 7, 8, 9). **Later appends govern on conflict** — round 9 is authoritative
   wherever it touches an earlier round.
5. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_...md` — the base spec the appends bind over.
6. The code seams the logs cite — especially `packages/jobs/worker.ts` (the §4.2 seam rounds 7–9 all
   turn on: the unconditional `succeeded` write at `:66-73`, the claim predicate at `:35-45`, and the
   heartbeat `finally` at `:83-85`), `packages/jobs/create.ts` (the §4.1 budget gate round 8/9 change),
   `packages/repair/chunked-repair.ts`, `packages/providers/routing.ts`, `packages/providers/types.ts`,
   `migrations/0001_schema.sql`.

Do **not** read the whole issue-log library. `LOG-INDEX.md` is the lookup table if you need a specific
older entry.

## The gate (do not cross without Ashley's explicit, in-person go)

- `0032` (base) + `0033` (binding + rounds 5–9) form the removal-lane spec. **NOT build-authorized —
  rejected at round 9.**
- **No removal-lane code. No fal key read. No network access. No probe, inference, upload, deployment,
  or spend.**
- **The next gate is round-nine SPECIFICATION REVIEW — not the probe.** Eli was explicit at round 9: the
  fal metadata probe becomes the next gate **only after the complete specification is approved**, and it
  *additionally* requires Ashley's separate live in-person key/network authorization. Do not treat a
  spec approval as probe authorization.
- Any build follows the round-5 → round-9 spend-safe order: durable operation/routing tables, state
  machine, atomic claims, the `prepared`/`submitting` submission boundary, reconciliation, budget
  reservation + backfill migration, and execution bindings FIRST; the VOID submit path stays
  disabled/mock until those exist; paid inference needs a separate explicit Ashley go.

## First actions in this room

1. Open `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_<your-identifier>.md` immediately (live scratch handoff).
2. **Surface the CARRY-OVER items from handoff 37** — the FOR-ASHLEY questions when she is present, and
   hold the FOR-ELI questions to relay when `Progress-update 12` is uploaded for the round-9 re-review.
3. If Ashley relays an Eli round-10 verdict: log it **append-only** — `0033` gets a round-10 append;
   `0032`, `0033`'s body, and rounds 5–9 are never rewritten.
4. Otherwise, wait for direction — the project is deliberately stopped at the spec-review gate.

## A note on how these rounds have gone (read this before you write a correction)

Five consecutive rounds have been rejected, and the reviewer has repeatedly caught **defects introduced
by the previous round's own correction** — including, at round 9, two places where round 8 contradicted
itself and one where it reintroduced a fallacy rounds 5–6 had already outlawed. The lesson the record
supports:

- **Verify every claim against the real code before writing it into a correction.** Cite file:line. The
  rounds that held up are the ones grounded that way.
- **When you correct an earlier round, say so explicitly and retract the superseded text by name.** Do
  not quietly patch around it — that is how round 8 ended up contradicting itself.
- **Re-read your own prior appends for conflicts before filing.** Round 9's first two blockers would have
  been caught by that check alone.

## Identifier / signing

Sign logs with your model-matched identifier from `AI-ACCOUNT-REGISTRY.md`. **Ruling recorded 2026-07-24:
the Opus family signs `CC-OPUS-01` regardless of version** (the row records "Claude Opus 5" as the
current version); there is **no `CC-OPUS-02`**. Sonnet ⇒ `CC-SONNET-01`, etc. "Marcus" is Ashley's chat
nickname for this assistant; "Eli" is her nickname for the ChatGPT reviewer — formal logs still use the
registry id.

## The upload package for this transfer

`VHE-Progress-update 12_2026-07-24.zip` (in `VHE Backups\VHE FOR Review\`) is the artifact to upload to
the Eli room for the round-9 re-review. Metrics are in `CURRENT-STATUS.md`. Each package now also carries
a `PACKAGE-PROVENANCE.md` recording HEAD and working-tree state at build time (a disclosure, not proof).
The full backup series (`VHE-BACKUP-FULL_v##`) is **local only — never upload it.**
