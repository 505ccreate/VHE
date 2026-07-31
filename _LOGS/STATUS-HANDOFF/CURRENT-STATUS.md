# CURRENT STATUS — read this first

**Last updated:** 2026-07-27 (round-13 correction filed) EDT by `CC-OPUS-01` / **Claude Opus 5**.

Eli reviewed the **actual `VHE-Progress-update 15` ZIP**. **Package audit PASS**, with the strongest
independent verification yet: 167 entries, 1,078,864 bytes, SHA-256 `AD953780…CED971`, **Update 14's
`0033` an exact byte-prefix of Update 15's**, `0033` grown **2,435 → 2,916 lines = exactly 481 appended
lines with zero prior-line changes**, `0032` and **all blueprint `.docx` files unchanged**, no
`packages/`/`scripts/`/`migrations/` source changed, and the round-12 stale-provenance mistake confirmed
corrected.

**Specification REJECTED at round 13 with 7 blockers.** The **round-13 correction is APPENDED to `0033`**
(append-only, verified by git: **377 insertions, 0 deletions**; 2,916 → 3,293 lines).

**The failure mode changed this round, and that is the useful signal.** Rounds 11–12 shipped
contradictions *against reality*. Round 13's blockers are mostly **incompleteness that reads as
completeness**: a term used exactly once and defined nowhere, a transaction with only a success branch, a
uniqueness guard with no namespace, a type that cannot hold its own values, and — **twice** — an **"or"**
where an implementer needs a decision. **R13·7 is the same defect R12·7 corrected a few paragraphs earlier
in the same append.**

**➡ CURRENT GATE — `0032` (base) + `0033` (binding + rounds 5–13) are the removal-lane spec. NOT
build-authorized — REJECTED at round 13.**

**➡ The next gate is ANOTHER SPECIFICATION REVIEW — still *not* the fal probe.** Nothing probed, keyed,
networked, or spent.

**➡ NEXT ACTION: build and verify `VHE-Progress-update 16`** — Eli's explicit gate is that the round-13
append and documentation changes be **committed first**. That commit is done (see Checkpoint).

## ⚠ `0034` (the VHE-2 blueprint amendment) is AUTHORIZED but Eli has DEFERRED it — do NOT execute it

Ashley authorized §4.2 option (iii) at round 12. **Eli's round-13 ruling: deferring the edit was correct,
and `0034` must NOT be executed yet.** Do **not** modify §4.1 or §4.2 and do **not** rerun
`_BLUEPRINTS-TEXT/_regenerate.py` while these blockers are open — amending now would freeze **incomplete**
contracts into both the Markdown mirror and the binary blueprint, forcing an immediate second amendment.

**After round 13 clears review**, Ashley can authorize **one deliberately scoped `0034`** covering **both**
§4.1's `kind: "execute"` payload **and** §4.2's typed execution result/failure + transactional ledger
contract, with the regenerate script rerun in that same session. **`0034` remains reserved and unexecuted.
VHE-2 on disk still says exactly what it always said.**

**Reading order for anyone picking up:**
1. `CURRENT-STATUS.md` (this file)
2. `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-45_claude-code-desktop_CC-OPUS-01.md` — the round-13
   handoff. Handoff 44 covers round 12 + package 15; 42 covers package 14; 41 covers round 11
3. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — body **and all nine appends** (rounds 5–13).
   **Later appends govern on conflict.**
4. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_...md` (base spec)
5. The code seams the logs cite — `packages/jobs/worker.ts` (`:35-45`, `:37`, **`:39-40` the staleness
   predicate R13·1 reuses**, `:68-72`, `:69-71`, `:76`, `:77-81`, `:83-85`), **`packages/providers/routing.ts`
   (`:115-136` — the `walkChain` loop that decided R13·4)**, `packages/queue/runtime.ts` (`:49`, `:62`,
   `:66`, `:90-94`), `packages/queue/queues.ts` (`:59-62`, `:85`), `packages/jobs/errors.ts` (`:12`,
   `:28-37`, `:43-48`), `packages/jobs/create.ts` (`:56-68`), `migrations/0001_schema.sql`, and
   **`node_modules/bullmq/dist/cjs/classes/job.js:1045` and `:1049-1051`** — the two custom-job-id guards
   that make R12·1 and R13·6's `wake-` prefix hard requirements rather than style points.

## The removal-lane spec chain (current shape)

- `0029` superseded · `0031` frozen · `0032` **base spec** · `0033` **binding correction + rounds 5–13
  appends** (later append wins). Build from `0033` (body + all nine appends) + `0032` together.
- Review history: r1 (14 → `0031` body) · r2 (9 → append) · r3 (→ `0032`) · r4 (9 → `0033`) · r5 (8) ·
  r6 (6 + 2 self-corrections) · r7 (6 + the 7-status resume table) · r8 (6) · r9 (5) · r10 (4 + 1 doc
  correction) · r11 (7) · r12 (8) · **r13 (7; spec REJECTED).**
- **`0033` round-13's resolutions** — every cited line re-read, not taken on trust:
  1. **Reconciler adoption fired only on a TERMINAL owner** (`0033:2553-2555`) while round-12 **test 3**
     required **canceled OR stale** (`0033:2864-2865`) — a stale owner is not terminal — and no reconciler
     identity, lease, CAS, or delivery target was ever defined. Now: durable `reconciler_owner_id` / lease
     / `reconciler_generation`, **two explicit adoption predicates** (terminal owner, or `running` with a
     heartbeat older than 120s — **reusing `worker.ts:39-40`'s existing definition of stale** rather than
     inventing a second), single-winner CAS, generation-guarded renewal. **R12·2's "adoption is an
     outbox-eligible event" RETRACTED** — the outbox targets *jobs*, and after a terminal owner there is
     no job to target; reconciler polling is a durable DB scan instead.
  2. **"Continuation generation" occurred EXACTLY ONCE in 2,916 lines** (`0033:2666`) and was defined
     nowhere. The only defined generation, `dispatch_generation`, increments per redelivery — so reaching
     for it would make a redelivery mint a **different** routing key and destroy the collapse guarantee.
     New durable **`jobs.continuation_generation`**, incremented once per logical continuation, with the
     binding rule that **only it may enter a durable business key**.
  3. **R12·5's transaction had no failure branch** (`0033:2678-2680`); a naive rollback would undo
     `consumed_at`, stranding a consumed wake on a still-`waiting` follower. Now **two commit shapes,
     never a rollback to nothing** — funded, or refused (no binding installed, no unfunded attempt
     executable, attachment resolved, job `failed`/`BUDGET_EXCEEDED`, marker cleared, **`consumed_at`
     written**), all atomic.
  4. **The direct-ledger grain assumed one billable operation per execution attempt**, but `walkChain`
     (`routing.ts:115-136`) loops the whole chain inside one call. **Option 1 chosen** —
     `UNIQUE (job_id, execution_attempt, provider_attempt_no) WHERE origin='direct'` — **with the reason
     stated**: option 2 would change already-shipped §7 fall-through behavior, which is scope growth into
     built code. *Option 1 records reality; option 2 changes it.*
  5. **`provider_charge_id`'s guard was unscoped** (`0033:2739`), assuming a global charge-id namespace
     across every provider. Now **`UNIQUE (provider_connection_id, provider_charge_id) WHERE ... NOT
     NULL`**, with the connection id carried on the row.
  6. **`BIGSERIAL` cannot round-trip a JS `number`** — `job_wakeup_outbox.id BIGSERIAL` (`0033:1921`) vs
     `outboxId: number` (`0033:2774`); above 2^53 precision is lost, and node-postgres returns `int8` as a
     string anyway. Now **`outboxId: string`**, regex-validated, never numerically coerced
     (`dispatchGeneration` stays `number` — stated so the fix isn't over-applied). **My own find:**
     `job.js:1045` also throws **`Custom Id cannot be integers`**, so the **`wake-` prefix is
     load-bearing**, not decoration.
  7. **The queue binding was still two alternative schemas** (`0033:2788-2790`) — **the exact defect
     R12·7 corrected a few paragraphs earlier in the same append.** `target_job_type` **REMOVED** from the
     outbox; the dispatcher loads authoritative `jobs.type` in its own claim; composite-FK alternative
     **RETRACTED**.
- **8 round-13 tests.** **The widened test-list discipline round 12 promised was actually EXECUTED this
  round**, with its result reported: one test amended (r12 test 8, for `provider_attempt_no`), one **rule**
  corrected to match its test (r12 test 3), **zero tests retracted**.
- **New standing pre-filing check:** grep the round's own new text for an **"or" at a decision point**, and
  confirm **every new identifier is defined somewhere** — a term used exactly once is a placeholder, not a
  specification. R13·2 was findable by one grep; R13·7 by reading one sentence.
- **Superseded round-12 text (for reference only):**
  1. **`wake:{outbox_id}` is an ILLEGAL BullMQ job id** — `node_modules/bullmq/dist/cjs/classes/job.js:1049-1051`
     **throws `Custom Id cannot contain :`**. Every round-11 wake delivery would have failed at the queue
     boundary. Now **`wake-{outbox_id}`** (+ `-{dispatch_generation}`). **My own binding note: never use a
     3-part colon id to dodge the check** — the adjacent source comments mark that exemption a legacy
     carve-out slated for removal in BullMQ's next breaking change.
  2. **Followers were woken for states they cannot act on**, and that wake opens a **lost-wake race**: a
     transiently-`running` follower makes the terminal wake's resume claim match zero rows. `in_flight`
     wake **RETRACTED**; **round-10 test 1 retracted in full** (round 11 had reshaped its *rule* to satisfy
     that stale *test*). Actionable-only wake set defined, plus **operation-level reconciler adoption** so
     an accepted operation orphaned by its owner's death never strands its followers.
  3. **`dispatched_at` does not prove consumption.** New delivery lifecycle: `dispatch_generation`,
     `dispatch_lease_expires_at`, **`consumed_at` written in the SAME Postgres transaction as the winning
     resume claim**. Sweeper reissues **only** after an unconsumed lease expires. Index predicate corrected
     to **`WHERE consumed_at IS NULL`**.
  4. **A crash AFTER the resume claim strands the job at `running`** — the retried wake can't claim it, and
     `claimForExecution` would take it over, **increment `attempt`** (`worker.ts:37`) and drop a follower
     into the **initial-submit branch**. Durable continuation marker + per-mode stale takeover that
     preserves execution mode and never increments the paid attempt.
  5. **R11·3 and R8·6 were unimplementable together** — R8·6 (`0033:1324-1326`) mandates a **full**
     `UNIQUE (routing_attempt_id)` where *a released row still blocks re-reservation*. A follower therefore
     **cannot** "acquire a fresh reservation" on its old walk. The continuation now **mints a NEW routing
     attempt** (new key, remaining-candidates snapshot, one new reservation, atomic binding repoint) and
     never reopens the released walk.
  6. **The follower PK forbade a job from ever following the same operation twice.** Own **`id` PK** +
     partial unique **`WHERE state='waiting'`** (one *active* attachment); parked job links to the exact
     attachment id; resolved history immutable; composite FK **unweakened**.
  7. **The direct-ledger key was an alternative, not a schema.** One grain:
     **`UNIQUE (job_id, execution_attempt) WHERE origin='direct'`**, optional `provider_charge_id` with its
     own partial unique guard, explicit per-origin null/non-null CHECKs, `reserved_cents=0` for `backfill`
     and `direct`.
  8. **The queue payload was still two contracts.** Eli's exact discriminated **`QueueDelivery`** union
     adopted verbatim; **`execute` removed from the `wake_kind` set**; unknown shapes fail loudly; queue
     name derived from authoritative `jobs.type`, never an unbound copied `target_job_type`.
- **10 round-12 tests**, superseding the round-10/round-11 tests they correct.
- **Discipline widened after round 12:** read new rules against the **ENTIRE live test list — every prior
  round included — and retract by number any test a new rule invalidates.** Round 11 ran this check only
  on its own new tests, which is exactly how round-10 test 1 survived to shape a wrong rule.
- **Superseded round-11 text (for reference only):**
  1. **The follower had no durable job lifecycle.** `worker.ts:68-72` would mark a parked follower
     **`succeeded`**; staying `running` reproduces R9·5's 120-second takeover loop with inflating
     `attempt`. New additive state **`awaiting_provider_operation`**, R8·1 guarded park, a separate
     guarded resume with **no `attempt` increment**, a one-transaction structural link to the follower
     row, and cancel that resolves the follower without touching the owning operation. Plus my own
     generalization: **every guarded write names the exact state it replaces** — a blanket
     `status='running'` guard silently no-ops on parked jobs.
  2. **The wake-up set contradicted round 10's own test and stranded followers.** `in_flight` was missing
     though round-10 test 1 requires it, and a `submission_unknown`-`parked` follower was never woken
     again. **Followers never poll** (owner/reconciler own all provider polling); the `parked` follower
     state is **retracted** in favor of re-parking as `waiting`; the wake set is now exact: `succeeded` ·
     `failed` · `submission_unknown` · **`in_flight`** · every reconciliation transition out of
     `submission_unknown`.
  3. **The `failed` branch was self-contradictory and unsafe.** R10·1 sent it to R6·4's same-operation
     retry, R10·2 advanced it to the next candidate. Generic `failed` does not prove pre-acceptance
     rejection (R5·5), and R8·4 establishes accepted-then-failed may have **billed**. The branch is now
     decided by the **structured submission outcome**, never the label.
  4. **BullMQ's `{jobId}` dedupe PREVENTS the wake-up.** `queues.ts:85` uses the DB job id as the custom
     job id; `removeOnComplete` appears **nowhere** in `packages/` (grep: 0 hits) and bullmq 5.80.1
     retains completed jobs — so re-adding `target_job_id` is ignored and the resume is never enqueued.
     Two identities: delivery id **`wake:{outbox_id}`**, payload `{targetJobId, wakeKind, outboxId}`.
  5. **The transport could not reach any resume claim.** `runtime.ts:49` types the payload `{jobId}` only
     and `:62` always calls `claimForExecution` — every rounds-9/10 resume was silently dropped at `:66`.
     New durable **`wake_kind`** (`execute` / `resume_children` / `resume_provider_follower` /
     `resume_reconciliation`), dispatched explicitly, **never inferred from mutable status**.
  6. **The sweeper cannot cover a stopped dispatcher.** A component that only inserts rows cannot deliver
     them when the only reader is stopped. The sweeper repairs **intent**; delivery availability comes
     from **redundant dispatchers** (wake-ups delayed, not lost). **Round-10 test 10 is RETRACTED.** Plus
     my own find: the re-insert needs **`UNIQUE (target_job_id, wake_kind) WHERE dispatched_at IS NULL`**
     — a blanket key would block the very re-wake the sweeper exists to provide.
  7. **`origin='direct'` had the wrong billing grain.** One row per job cannot represent up to three
     attempts (`worker.ts:76`, `queues.ts:59-62`), and a success-only insert discards every
     accepted-then-failed charge R8·4 requires reconciling. Grain becomes **one billable execution
     attempt** — `UNIQUE (job_id, execution_attempt) WHERE origin='direct'`, keyed on the **claim-time
     frozen** `attempt` — with `jobs.cost_cents` a derived rollup and **`reserved_cents = 0` on both
     `backfill` and `direct`** (`reserved_cents` is `NOT NULL`; neither prior round supplied a value —
     the `backfill` half is my find).
- **10 new round-11 tests** (round-10 test 10 replaced) on top of `0032` §12 + §9's seven + r5's seven +
  r6's six + r7's eight + r8's eight + r9's eight + r10's ten.
- **New standing pre-filing step:** *read the round's own added tests back against the round's own added
  rules.* Three of these seven blockers were findable in minutes by that check alone.

## OPEN DECISIONS for the owner

1. **§4.2 amendment — AUTHORIZED (round 12) but DEFERRED by Eli (round 13).** Nothing for Ashley to decide
   right now; the condition is "after round 13 clears review." See the boxed section at the top.
2. **When it is time, `0034` is ONE scoped task covering BOTH** §4.1's `kind: "execute"` payload **and**
   §4.2's typed contract — Eli's sequencing, adopted. The §4.1 half still needs Ashley's explicit
   authorization, since her round-12 grant named §4.2 only.
3. **RESOLVED earlier and unchanged:** the missing cost channel on the §4.2 failure path (the typed
   failure/result contract is that channel).

**Named but NOT fixed (no scope growth):** direct-spend jobs hold no reservation while running, so
concurrent one-shot jobs can overshoot the cap between the §4.1 pre-check and the terminal write —
**existing** §4.1/§2 behavior, unchanged by rounds 10–13. **Also named and deliberately not taken:**
R13·4's option 2 (prohibiting same-attempt fall-through after a billed disposition) would change
already-shipped §7 `walkChain` behavior and needs its own work order.

**The owner's standing ruling is unchanged:** spec approval → explicitly-authorized zero-spend probe →
implementation, with the probe gated on Ashley's separate in-person key/network approval.

**Checkpoint:** the round-13 commit is docs-only. **No source file was created, changed, or deleted this
session, and no blueprint `.docx` was touched.** Suite/preflight **153/153 · 13/4/1**, last actually
measured at `52e3277`; not re-run because no source has changed since.

## Where the build stands

- **Built (content-replacement side):** S3-backed AssetStore (`packages/storage/s3-store.ts`); §9.2
  keyframe content-replacement orchestration (`packages/repair/keyframe-repair.ts`); fal `image.inpaint`
  adapter; §9.2A/§9.5 deterministic cores; real §9.1 via OpenAI. See `0022`–`0027`.
- **Removal lane: SPEC ONLY (`0032` + `0033` rounds 5–13), NOTHING built.** Rejected at round 13.

## Verified state

- **Vitest 153/153 PASS (17 files)** on Node v22.23.1 (not re-run this session; no source changed).
- **Preflight PASS 13 / FAIL 4 / SKIP 1** — only the four undelivered real §1 AI fixtures.
- **fal key location verified (contents NOT read):**
  `C:\Users\user\Documents\Soren-Tools-Library-V1 - TRANSFER 2026-07-17\Api key.txt`.
- **One limit stated plainly:** R11·4 rests on BullMQ's documented retention of completed jobs.
  `runtime.test.ts:173-179` proves duplicate suppression only against a **waiting** job, and **that
  behavior was not measured this session** (no Redis, no network). Round-11 test 4 exists to close it.

## Backup & review packages

Routine lives in `_LOGS/README.md`. Progress-update packages live in **`VHE Backups\VHE FOR Review\`**;
full backups in the `VHE Backups\` root. All package byte figures are the compressed ZIP size.

- **Latest review package — `15` (the round-12 re-review artifact):** `VHE Backups\VHE FOR Review\VHE-Progress-update 15_2026-07-27.zip` — **167 entries** (165 lean tracked files + manifest + provenance) · **1,078,864 bytes (compressed ZIP)** / 2,034,859 uncompressed · SHA-256
  `AD95378016F537D167371EEBB7E3E8BADBB658DEEDBFB00D1FAB78CDEACED971`, built at HEAD **`9f73cf5`** (the
  committed round-12 correction). **28/28 post-build verification checks PASSED**, including that
  `0033` in-zip carries **all eight** appends (rounds 5–12) with `R12·1`–`R12·8` and the
  `job.js:1049-1051` citation intact, and that `PACKAGE-PROVENANCE.md` states option (iii) is
  **AUTHORIZED** (not merely recommended) and that the blueprint `.docx` was **NOT** edited.
  **This is the package to upload to the Eli room for the round-12 re-review — an owner action, not yet
  done. Next Progress-update = `16`.**
  - **Build integrity note, stated plainly:** the first build of `15` shipped with stale round-11
    provenance wording ("Eli recommends option (iii)") because a scripted edit silently failed its
    match. It was **caught by inspection, discarded, and rebuilt** before any metric was recorded or the
    file was shipped. The SHA-256 above is the rebuilt artifact; the discarded one was never referenced
    anywhere and no longer exists on disk.
- **`14`:** `VHE Backups\VHE FOR Review\VHE-Progress-update 14_2026-07-27.zip` —
  **164 entries** (162 lean tracked files + `EXCLUDED-BINARIES-MANIFEST.md` +
  `PACKAGE-PROVENANCE.md`) · **1,049,701 bytes (compressed ZIP)** / 1,961,268 uncompressed · SHA-256
  `5F14F62AF4BFC8DFCB8BC9B1E2E1F8E5100B09752730352E41B1E45CFC20EC8E`, built at HEAD **`d429944`**
  (committed round-11 correction) with every tracked file committed. **31/31 post-build verification
  checks PASSED:** ZIP integrity · 164 entries · 0 duplicates · 0 backslash paths · 0
  absolute/drive-letter/traversal paths · no real `.env` · 0 image/video binaries leaked (same 8
  stripped, none added) · no `library/tools/`/`node_modules` leak · no `_IN-PROGRESS` scratch shipped ·
  all required documents and cited source seams present (adds `packages/jobs/errors.ts` to the cited
  set, per R11·7's consequence-2 finding) · `0033` in-zip confirmed to carry **all seven** appends
  (rounds 5–11) signed `CC-OPUS-01` 2026-07-27 · `PACKAGE-PROVENANCE.md` carries all three §4.2 options
  plus Eli's round-11 recommendation · manifest titled for `14`. **This is the package to upload to the
  Eli room for the round-11 re-review — an owner action, not yet done. Keep the six `.docx` blueprints
  in it** — Eli ruled on handoff 40's question: the convention is unchanged. **Next Progress-update =
  `15`.**
- **`13`:** `VHE-Progress-update 13_2026-07-27.zip` — **161 entries** · **1,023,617 bytes** · SHA-256
  `D98ABFE75FDBFC664D74C40282FF2C8DD9A11EB58377D1FCE18D4F80EF79B61C`, built at HEAD `241a27c`, **45/45
  post-build verification checks passed**. **This is the package Eli's round-11 verdict was issued
  against — it contains rounds 5–10 only, NOT round 11.**
- **`12`:** 158 entries · 1,001,694 bytes · SHA-256
  `E32C8FCD770BA8810804FCB10C152315061A92B7016B75DC18469D56B7A5A699`, built at HEAD `53c645f`.
- **`11`:** `204771A8517FE58A63BF1FEAB26CF08216602F5E2A16C3768B3CCF3AA58D4E7C`, 986,142 bytes, 157 entries.
- **`10`:** `165E9B7473DFEF75999C3E96B30A9563D0BC7142B48F3F371FE30EACA34B2CBB`, 970,159 bytes, 155 entries.
- **`09`:** `9B892C335CDA7883D59F63F4F50D8CD143F3EB0805482BC03BACDCA8E1E1B657`, 952,474 bytes, 154 entries.
- **`08`:** `654E30383584A6A5D20BD0AE8954492A3E08BD4D764721E456BABC7D8682AFF7`, 946,814 bytes, 153 entries.
- **`07`:** `8A190B1569BA74E9A45038D5509658F3688C85D5BC11A240C18E912CA36AC749`, 938,101 bytes, 152 entries.
- **`06`:** `32D5BFB797896CE34C6BC315833628279577ECAB5546AF0406C0C3B7D1D0FE51`, 195,431 bytes compressed /
  462,775 uncompressed, 42 entries.
- **Prior:** `05` (`FE9F49611567B5EBD2EB6C337393E4D40C6F8B87C439286B7DE00FD1533FDB55`) · `04` · `03` · `02`.
- **Full backup (latest) — `v08` (LOCAL ONLY — never upload, per Ashley):**
  `VHE Backups\VHE-BACKUP-FULL_v08_2026-07-24.zip` — 161 entries · 8,724,772 bytes · SHA-256
  `0B6477ED9E0A8430E464A0AAC8E7A5AF61B7B8FA004B34B36A585E6617CB4260`. **Next = `v09`.** **Eli says no
  `v09` is needed yet**; nothing is at risk (everything is committed to git).
- Prior backups are **never moved, renamed, overwritten, or deleted** — the number always climbs. The
  provider KEK in `.env` is NOT in any zip (gitignored, verified absent).

## Honest boundary

`0032` + `0033` (rounds 5–13) are a **design contract, not code.** Nothing built, probed, or spent. The
§9.1 real-fixture quality gate and the full §9.5 real-video exit gate remain OPEN. The removal lane exists
only on paper. The spec has now been rejected **nine consecutive rounds**. **Blocker counts: 6, 6, 5, 4,
7, 8, 7.**

**What changed this round is the *kind* of defect, and it is worth being precise about.** Rounds 11–12
were contradictions against reality — rules that the code or the infrastructure could not support. Round
13's are mostly **incompleteness dressed as completeness**: a term used exactly once and never defined, a
transaction with only a success branch, an unscoped uniqueness guard, a type that cannot hold its own
values, and twice an **"or"** where an implementer needs a decision. That is a *later-stage* failure mode
— the design is roughly right and the specification of it is not yet executable — but it is not obviously
better, and **R13·7 repeating R12·7's exact defect a few paragraphs later in the same append** is the
clearest evidence that my pre-filing review of my own text is still the weakest link.

**What is working:** verifying against real source keeps paying out. R13·4 was decided by reading the
shipped `walkChain` loop rather than reasoning abstractly, and R13·6 surfaced a second BullMQ guard
(`job.js:1045`) Eli had not named. **What is not yet working:** the checks I add each round are correct
and I keep applying them incompletely — round 12 promised a test-list reconciliation, round 13 is the
first round that actually ran it and reported the result.

## Next action

1. **Build and verify `VHE-Progress-update 16`** — Eli's explicit gate is the round-13 append +
   documentation changes being committed (done). This is the round-13 re-review artifact.
2. **Do NOT execute `0034`** — Eli deferred it until round 13 clears review. No blueprint edit, no
   `_regenerate.py` run.
3. If round 14 returns items: **append to `0033`** — do not rewrite `0032`, `0033`'s body, or rounds 5–13.
4. Standing items (unblocked, untouched): the 4 frozen §1 fixtures; a concrete `S3_REGION` for the live
   fal `image.inpaint` validation (`0027`); optional full backup `v09` (Eli says still not needed).
5. Keep OpenRouter/video generation, identity/face-swap, and deployment topology deferred.

## Warnings

- Never use bare system FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Every removal-lane ffmpeg
  string lives ONLY in `packages/media/ffmpeg.ts`.
- Use Node v22.23.1; Python `py -3.11`. Never recursively scan `library/tools/`. Never echo live keys.
- `.env` contains the provider KEK; losing it makes encrypted provider rows unreadable.
- **NOT authorized until Ashley says otherwise (in person):** the fal zero-spend probe, reading the fal
  API key, any provider call, any network access, any spend, any removal-lane code, any deploy.
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–13 appends
  (takes further appended corrections; do NOT rewrite).**
- **Naming:** "Marcus" = Ashley's chat nickname for this Claude Code assistant (also "Marcus Jr."); "Eli"
  = her nickname for the ChatGPT reviewer. Formal logs sign with the `AI-ACCOUNT-REGISTRY.md` identifier.
- **Identifier ruling:** the Opus family signs `CC-OPUS-01` regardless of version; **no `CC-OPUS-02`.**
- **Next unused issue-log number is `0034`.**
