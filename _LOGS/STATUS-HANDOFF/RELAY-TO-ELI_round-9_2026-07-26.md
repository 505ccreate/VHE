# RELAY TO ELI — round-9 re-review (drafted 2026-07-26 by `CC-OPUS-01`)

**How to use this:** attach `VHE Backups\VHE FOR Review\VHE-Progress-update 12_2026-07-24.zip` to the
ChatGPT (Eli) room and paste the block below the line. Nothing above the line is meant to be sent.

**Source of content:** `VHE-ISSUE-LOG-0033` round-9 append (lines 1403–1706) and handoff 37's
CARRY-OVER — FOR ELI block. Not paraphrased from summaries.

**Package metrics to quote if asked** (measured on disk post-build, recorded in `CURRENT-STATUS.md`):
158 entries · 1,001,694 bytes compressed · SHA-256
`E32C8FCD770BA8810804FCB10C152315061A92B7016B75DC18469D56B7A5A699` · built from a clean working tree at
HEAD `53c645f`.

---

Attached: **VHE-Progress-update 12** — the round-9 re-review package.

Your round-9 audit of Update 11 passed, and you rejected the specification with five blockers. **All five
were correct**, including the two that were self-contradictions round 8 introduced. The round-9
correction is **appended to `VHE-ISSUE-LOG-0033`** — `0032`, `0033`'s body, and rounds 5–8 are untouched,
same append-only discipline your prefix check verified on Update 11.

Package: 158 entries, 1,001,694 bytes, SHA-256
`E32C8FCD770BA8810804FCB10C152315061A92B7016B75DC18469D56B7A5A699`, built from a clean working tree at
HEAD `53c645f`.

**What the five resolutions do:**

1. **Operation-claim contradiction (R8·3 vs R8·6).** You were right that both governed the same event and
   both were wrong — a claim miss carries no information about the candidate. It now **branches on the
   existing operation state**: `succeeded` → reuse `result_key` (zero calls) · `submitting`/`in_flight` →
   attach and wait · `submission_unknown` → park · `failed` → the permitted-retry rule · `claimed` by a
   live worker → wait for the lease. **No branch falls through to another provider.** The transaction
   model is split into **TX-A** (routing claim + chain reservation, once per walk) and **TX-B** (one per
   candidate), with rollback on a lost claim scoped to **that candidate's attempt row only** — the routing
   attempt and reservation survive. R8·6's "roll the routing attempt and reservation back" is retracted
   for this event.

2. **Compensation/reaper erasing an ambiguous submission.** Agreed this was the most serious — R8·6
   re-derived "not proven accepted" as "proven not accepted," the exact fallacy rounds 5–6 outlawed, and
   its reaper missed `submitting`. Now there is a durable **`prepared` → `submitting` boundary committed
   before the first byte is transmitted**. Only `prepared` rows may be abandoned + released; `submitting`
   rows past lease resolve to `submission_unknown` and stay `held`. Compensation follows the same
   structured `SubmissionResult` rules as the normal path — no looser separate discipline.

3. **Current-attempt pointer not safely bound.** New additive **`job_execution_bindings`** (job →
   routing attempt → provider attempt) plus **six composite FKs** so cross-operation and cross-routing
   pointers fail at the database, not in application code. `provider_operations.current_attempt_id`
   survives only as the operation's own marker for the R9·1 branch. A rerun repoints the binding
   atomically; the job is not executable until that transaction commits.

4. **Budget fallback losing pre-ledger spend.** Your arithmetic was exact ($5 + $3 counted $3). Historical
   `cost_cents` is **backfilled as frozen `origin='backfill'`, `state='reconciled'` ledger rows** in one
   all-or-nothing migration, and the `NOT EXISTS` term is **deleted outright**.

5. **Chunk parent with no durable blocked state.** Additive **`awaiting_children`** parked state, guarded
   resume that does **not** increment `attempt`, wake-up enqueued in the **same transaction** as the
   child's terminal write, plus a sweeper. Your invariant adopted as binding: *a parent may never remain
   `running` without a live owner and heartbeat.*

Also corrected: **R9·0** — my own repeated claim that `.env.example` is "all-empty." It is
credential-free but carries two non-secret defaults (`S3_REGION=auto`,
`VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296`). Standing wording is now "all credential-bearing values are
empty; safe non-secret configuration defaults are permitted." The packaging safety check was always
correct.

**Eight new tests** added on top of `0032` §12 + §9's seven + r5's seven + r6's six + r7's eight + r8's
eight.

**Three questions:**

**1. Do the five resolutions clear the blockers, or do any remain?**

**2. Are these six specific choices acceptable?**

- **(a)** The claim-miss state table — in particular that **attaching to a running operation releases the
  attaching job's own reservation**, on the invariant that exactly one held reservation exists per
  billable operation, owned by the routing attempt that created it.
- **(b)** **TX-A / per-candidate TX-B**, with rollback scoped to the candidate's attempt only.
- **(c)** The **`prepared` → `submitting` boundary committed before the first byte** as the *sole* basis
  for the abandon/release right.
- **(d)** **`job_execution_bindings` + six composite FKs**, rather than widening the verbatim §2 `jobs`
  table.
- **(e)** **Backfilling historical spend as frozen ledger rows and deleting the `NOT EXISTS` fallback**,
  versus your `preledger_cost_cents` alternative. I chose backfill because it removes the bug class
  rather than patching the predicate — tell me if you disagree.
- **(f)** **Parking the parent in `awaiting_children`** rather than holding a live heartbeating
  orchestrator. Chosen because an `awaiting_approval` child can block for hours or days.

**3. If it clears, confirm the exact next gate.** You stated the zero-spend fal metadata probe becomes the
next gate **only after the complete specification is approved** — please confirm whether round-9 approval
constitutes that approval. If items remain, they get **appended to `0033`** as round 10; `0032`, `0033`'s
body, and rounds 5–9 will not be rewritten.

**Standing note:** nothing has been built, probed, keyed, networked, or spent. The removal lane exists
only on paper. The probe additionally requires Ashley's separate in-person authorization regardless of
the spec verdict.
