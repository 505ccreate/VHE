# VHE Handoff — 2026-07-27-45 (round-13 correction filed; `0034` deferred by Eli)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-27, continuing the same session (handoffs 41–44 filed earlier) |
| **Project phase** | Removal-lane spec gate — **round 13 filed on `0033`**. Spec REJECTED at round 13 (7 blockers), NOT build-authorized. **`0034` blueprint amendment authorized but DEFERRED by Eli.** |

---

## What this block did

1. Ashley pasted Eli's **round-13 verdict** on `VHE-Progress-update 15`.
2. **Package audit: PASS** — the strongest independent verification the project has had. Eli reproduced
   167 entries / 1,078,864 bytes / SHA `AD953780…CED971`, confirmed **Update 14's `0033` is an exact
   byte-prefix of Update 15's**, that `0033` grew **2,435 → 2,916 lines = exactly 481 appended lines with
   zero prior-line changes**, that `0032` **and all blueprint `.docx` files** are unchanged, that no
   `packages/`/`scripts/`/`migrations/` source changed, and that **the round-12 stale-provenance mistake
   was corrected**. The packaging discipline is now independently attested, not just self-reported.
3. **Specification REJECTED — 7 blockers.** Verified each at the exact line cited, then appended round 13.
   **Append-only: 377 insertions, 0 deletions** (2,916 → 3,293 lines).

## The seven blockers — all correct

| # | Blocker | Verified at |
|---|---|---|
| R13·1 | Reconciler adopts only on a **terminal** owner, but round-12 **test 3** requires **canceled or stale**; no reconciler identity/lease/CAS/delivery target ever defined | `0033:2553-2555` vs `:2864-2865` |
| R13·2 | **"Continuation generation" used exactly once in 2,916 lines, defined nowhere** | `0033:2666` (grep: 1 occurrence) |
| R13·3 | R12·5's five-step transaction has **no failure branch**; a rollback strands a consumed wake | `0033:2678-2680` vs `:2665-2675` |
| R13·4 | Direct-ledger grain assumes one billable op per attempt; **`walkChain` loops the whole chain in one call** | `packages/providers/routing.ts:115-136` |
| R13·5 | `provider_charge_id` guard **unscoped** — assumes a global cross-provider charge-id namespace | `0033:2739` |
| R13·6 | **`BIGSERIAL` cannot round-trip a JS `number`** | `0033:1921` vs `:2774` |
| R13·7 | Queue binding **still two alternative schemas** — the exact defect R12·7 corrected in the same append | `0033:2788-2790` |

**The failure mode changed, and naming it matters.** Rounds 11–12 were contradictions *against reality*.
Round 13's are **incompleteness that reads as completeness** — an undefined term, a one-branch
transaction, an unscoped constraint, a type that cannot hold its values, and **twice an "or" where an
implementer needs a decision.** That is a later-stage failure mode, but **R13·7 repeating R12·7's exact
defect a few paragraphs later in the same append** is the clearest evidence yet that my review of my own
text before filing is the weakest link in the loop.

**Two decisions I made explicitly rather than silently:**

- **R13·4 — chose option 1 (ledger by provider attempt), not option 2.** Option 2 (prohibit same-attempt
  fall-through after a billed disposition) is cleaner *for the removal lane*, but `origin='direct'` exists
  for the **already-built** §9.1/§9.2 lanes, which use the shipped generic `walkChain` that falls through
  on any failure. Option 2 would change tested, shipped §7 behavior — scope growth into built code needing
  its own work order. **Option 1 records reality; option 2 changes it.** Option 2 is named in the append so
  a later round can choose it knowingly.
- **R13·1 — reused `worker.ts:39-40`'s existing 120-second staleness predicate** for the stale-owner
  adoption case rather than inventing a second definition of "stale." One definition, one place.

**One finding of my own, not Eli's:** `job.js:1045` throws **`Custom Id cannot be integers`**, immediately
above the colon guard from R12·1. Once `outboxId` becomes a numeric *string* (R13·6), the obvious
"simplification" of using the bare outbox id as the delivery id **would throw**. The **`wake-` prefix is
load-bearing**, not decoration — filed as a binding rule so no future round strips it.

## The discipline I promised in round 12 — actually executed this time, with results

Round 12 committed to reading new rules against the **entire live test list**, not just the round's own new
tests. Round 13 is the first round that ran it and reported the outcome:

- **r12 test 3** — rule corrected to match the test (not the reverse). **Retained.**
- **r12 test 8** — **amended** for R13·4's new `provider_attempt_no` dimension.
- **r12 test 1** — retained, **strengthened** by round-13 test 6b.
- **r12 tests 2, 4, 5, 7, 9, 10 and all surviving rounds 5–11 tests** — re-read; **none invalidated.**
- **Net: one amended, one rule corrected, zero retracted.**

**New standing pre-filing check added for round 14:** grep the round's own new text for an **"or" at a
decision point**, and confirm **every new identifier is defined somewhere** — a term used exactly once is
a placeholder, not a specification. R13·2 was findable by a single grep; R13·7 by reading one sentence.

## Blueprint sequencing — `0034` DEFERRED

**Eli confirmed deferring the VHE-2 edit was correct, and ruled that `0034` must NOT be executed yet.** Do
not modify §4.1 or §4.2 and do not rerun `_BLUEPRINTS-TEXT/_regenerate.py` while these blockers are open —
regenerating now would freeze **incomplete** contracts into both the Markdown mirror and the binary
blueprint, forcing an immediate second amendment. **After round 13 clears review**, Ashley authorizes
**one scoped `0034`** covering **both** §4.1's `kind: "execute"` payload and §4.2's typed contract, with
the regenerate script rerun in that same session.

**This vindicates the round-12 call to defer.** `0034` remains reserved and unexecuted; VHE-2 on disk says
exactly what it always said.

## Tested — with actual results

**No tests were run. No source file and no blueprint was created, changed, or deleted.** Standing figures,
last actually measured at `52e3277`: **Vitest 153/153 PASS (17 files)** on Node v22.23.1 · **preflight
PASS 13 / FAIL 4 / SKIP 1**. The BullMQ verifications (`job.js:1045`, `:1049-1051`) were **source reads**,
not executions — no Redis, no network, no queue touched.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round-13 correction appended** (377
  insertions, 0 deletions; verified append-only via `git diff --numstat`).
- `_LOGS/LOG-INDEX.md` — `0033` row extended with the round-13 summary; status updated.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — rewritten for round 13, incl. the boxed `0034`-deferred
  section and the corrected spec chain.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-45_...md` — this handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — plan written **before** the work, deleted at block end.
- **No `packages/`, `scripts/`, `migrations/`, blueprint, `0032`, or `0033`-body content was touched.**

## Not done — deliberately

- **`0034` NOT executed**, no blueprint edit, no `_regenerate.py` run — Eli's explicit deferral.
- **No full backup `v09`.**
- **No source changes, no probe, no key read, no network, no provider call, no upload, no spend.**

## Unfinished / left mid-work

Nothing. Round 13 is filed and committed; `Progress-update 16` is the next action and its gate (this
commit) is satisfied.

## CARRY-OVER — FOR ASHLEY

1. `Progress-update 16` is being built for the round-13 re-review — upload it to the Eli room when ready.
2. **Nothing to decide right now on `0034`** — Eli deferred it until round 13 clears. When that happens,
   the §4.1 half will still need your explicit authorization (your round-12 grant named §4.2 only).
3. Standing: `S3_REGION` for the live fal validation (`0027`); the 4 frozen §1 AI fixtures.

## CARRY-OVER — FOR ELI (relay with `Progress-update 16`)

1. Do the seven round-13 resolutions clear the blockers?
2. Specifically: (a) the **two explicit adoption predicates** + reconciler lease/CAS/generation, and the
   retraction of "adoption is an outbox-eligible event" in favor of a durable DB scan (the outbox has no
   addressable target once the owner is terminal); (b) **`jobs.continuation_generation`** as a separate
   durable counter that never mixes with `dispatch_generation`; (c) the **two-commit-shape** continuation
   transaction, where budget refusal **commits** rather than rolls back; (d) **R13·4 option 1** — is
   ledgering by `provider_attempt_no` the right call given option 2 would change shipped §7 behavior?;
   (e) `UNIQUE (provider_connection_id, provider_charge_id)`; (f) **`outboxId: string`** end to end, plus
   the `wake-` prefix now being load-bearing against `job.js:1045`; (g) `target_job_type` **removed**
   outright with the dispatcher deriving `jobs.type` in its own claim.
3. **Is the test-list reconciliation report the right format?** Round 13 ran the check round 12 promised
   and reported one amended / one rule-corrected / zero retracted. If you want that as a standing section
   in every future round, say so and it becomes convention.
4. If items remain: **append to `0033`** as round 14 — do not rewrite `0032`, `0033`'s body, or rounds
   5–13.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **The next gate is another SPECIFICATION REVIEW — not the probe.**
- **`0034` is authorized but DEFERRED — do NOT execute it, do NOT touch §4.1/§4.2, do NOT rerun
  `_regenerate.py`** until round 13 clears review.
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–13 appends
  (do NOT rewrite — takes further appended corrections).** **Later appends govern on conflict.**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- **Next Progress-update = `16`. Next full backup = `v09`. Next issue-log number = `0034`** (reserved,
  deferred).

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5–**13** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0030` — the packaging-defect entry the build method discharges.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27
