# START HERE — new Claude Code room (rewritten 2026-07-27 at the **Progress-update 14 upload** handoff)

**This file is rewritten at every transfer. It previously described the round-10 transfer. It now
describes THIS transfer, which is different in kind from every prior one below — read the next section
carefully before doing anything else.**

## THE THING THAT MAKES THIS ROOM DIFFERENT

**The previous room ran out of session capacity mid-cycle, before Eli's round-11 re-review verdict came
back.** Normal rooms close at a natural stopping point (a filed correction, a built package). This one did
not — it closed because the session hit its limit, not because the work reached a boundary.

**Concretely: `VHE-Progress-update 14` (the round-11 re-review artifact) is built, verified, and sitting
in `VHE Backups\VHE FOR Review\`. Ashley has not yet uploaded it to Eli, or has just uploaded it and is
waiting. Eli is slow and verbose — "it's gonna be a minute" (Ashley's words). At some point in THIS room,
Ashley will paste Eli's round-11 re-review response directly into the chat.**

**When that happens, do not treat it as a new task to figure out from scratch. It is the direct
continuation of round 11.** Read `CURRENT-STATUS.md` and handoffs 41/42 first so you know exactly what
round 11 claimed, then apply Eli's response as a **round-12 append to `0033`**, using the exact same
discipline rounds 5–11 used (verify every claim against real code/real prior text with file:line before
writing; retract superseded text by name; re-read prior appends for conflicts; **and the round-11
addition: read the round's own new tests back against the round's own new rules before filing**).

**Two possible shapes for Eli's response, so you are not caught guessing:**
- **If he rejects again with more blockers:** append round 12 to `0033`, exactly like every prior round.
  Do not build `Progress-update 15` until Ashley/Eli's instructions on timing are clear (rounds 10 and 11
  both explicitly gated the next package on the correction being committed first — assume the same
  pattern unless told otherwise).
- **If he approves the specification:** this is the **first time in eleven rounds** this has happened.
  Do NOT read that as authorization to build the removal lane. Re-read the standing gate below — spec
  approval is a **necessary but not sufficient** condition. The fal probe additionally requires Ashley's
  **separate, live, in-person** key/network authorization, which nothing in a pasted chat response can
  substitute for. If this happens, stop, state plainly that the spec gate has cleared for the first time,
  and ask Ashley directly whether she is separately authorizing the probe — do not assume it.

## Read in THIS exact order

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — where the project actually stands (updated for
   Progress-update 14 and the pending upload).
2. **this file** — you are here.
3. `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-42_claude-code-desktop_CC-OPUS-01.md` — closing handoff
   for the packaging block (Progress-update 14 built and verified). Handoff 41 holds the full round-11
   correction detail (all 7 blockers, file:line, the 5 consequences found unprompted). Handoff 40 closed
   the round-10 room.
4. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — the body **and all seven appended
   corrections** (rounds 5, 6, 7, 8, 9, 10, **11**). **Later appends govern on conflict** — round 11 is
   authoritative wherever it touches an earlier round.
5. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_...md` — the base spec the appends bind over.
6. The code seams the logs cite — `packages/jobs/worker.ts` (`:35-45` claim + `RETURNING *`, `:37` attempt
   increment, `:39-40` takeover predicate, `:68-72` universal terminal-success write, `:76` retry
   ceiling, `:77-81` the failure write that carries **no cost**, `:83-85` heartbeat `finally`),
   `packages/queue/runtime.ts` (`:49` payload type, `:54-55`, `:62`, `:66`, `:90-94`),
   `packages/queue/queues.ts` (`:59-62` `RETRY_POLICY`, `:85` the `{ jobId }` add),
   `packages/queue/runtime.test.ts` (`:173-179`), `packages/jobs/errors.ts` (`:28-37`, `:43-48` — new to
   round 11's cited set), `packages/jobs/create.ts` (`:56-68`), `migrations/0001_schema.sql` (`jobs`
   `:50-70`, spend-model comment `:104`).

Do **not** read the whole issue-log library. `LOG-INDEX.md` is the lookup table for a specific older entry.

## The gate (do not cross without Ashley's explicit, in-person go)

- `0032` (base) + `0033` (binding + rounds 5–11) form the removal-lane spec. **NOT build-authorized —
  rejected at round 11 (7 blockers), and this is true regardless of what Eli's next response says until
  you have actually read that response and updated this statement.**
- **No removal-lane code. No fal key read. No network access. No probe, inference, upload, deployment,
  or spend.**
- **The next gate is another SPECIFICATION REVIEW — not the probe — unless and until Eli approves the
  spec, and even then the probe needs Ashley's SEPARATE in-person key/network go.** Never read a spec
  approval as probe authorization, and never read anything typed into this chat as a substitute for an
  in-person authorization Ashley has to give live.

## Two open questions the owner still owes (from round 11, unresolved)

1. **VHE-2 §4.2 verbatim-edit-site OPEN DECISION.** Three options filed verbatim in `0033` R10·3 and
   `CURRENT-STATUS.md`: (i) additive statement under a `// BUILDER:` note; (ii) caller-supplied
   transaction wrapping the verbatim write; (iii) authorized amendment to VHE-2 §4.2. **Eli recommends
   (iii)**, with the constraint that the terminal update + ledger writes sit in a short Postgres
   transaction never held open across a provider call. **Do not choose for her.**
2. **The missing cost channel on the §4.2 failure path** (round 11's own find, `worker.ts:77-81` /
   `errors.ts:28-37`) — either the §4.3 error type gains an optional billed-amount field, or the handler
   writes its own ledger row before throwing. **Filed, not decided.**

## First actions in this room

1. Open `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_<your-identifier>.md` immediately (live scratch handoff).
2. **If Ashley has already pasted Eli's round-11 verdict when you start, or does so shortly after:** see
   "THE THING THAT MAKES THIS ROOM DIFFERENT" above. Verify every claim against real code before writing
   a word into `0033`. This is a continuation, not a fresh review cycle — do not re-derive context that
   is already sitting in handoffs 41/42 and `0033`'s rounds 5–11.
3. If Ashley has not yet pasted it: hold. The room is deliberately stopped waiting on Eli, who is known to
   take a while. Do not build `Progress-update 15` speculatively, do not probe, do not guess at what
   round 12 will say.
4. Surface the two open owner questions above whenever Ashley is present and it's a natural moment —
   they do not need Eli's response to be answered.

## Identifier / signing

Sign logs with your model-matched identifier from `AI-ACCOUNT-REGISTRY.md`. **Ruling: the Opus family
signs `CC-OPUS-01` regardless of version**; there is **no `CC-OPUS-02`**. Sonnet ⇒ `CC-SONNET-01`, etc.
**Note from this session: the owner may switch the visible model mid-session via `/model` (e.g. to Sonnet
5) for cost/quota reasons. This does not change which identifier signs the logs for this account/room —
it is still whichever model is actually active at the moment of signing, named per the family rule
above.** "Marcus" (also "Marcus Jr.") is Ashley's chat nickname for this assistant; "Eli" is her nickname
for the ChatGPT reviewer — formal logs still use the registry id.

## The upload package for this transfer

`VHE-Progress-update 14_2026-07-27.zip` (in `VHE Backups\VHE FOR Review\`) — **164 entries · 1,049,701
bytes · SHA-256 `5F14F62AF4BFC8DFCB8BC9B1E2E1F8E5100B09752730352E41B1E45CFC20EC8E`**, built at HEAD
`d429944`, **31/31 verification checks passed**. This is the artifact for the round-11 re-review — it may
already be uploaded to the Eli room by the time you read this, or Ashley may upload it during this room's
session. **Next package = `15`, but do not build it speculatively — wait for direction after round 12 is
filed.** The full backup series (`VHE-BACKUP-FULL_v##`) is **local only — never upload it**; latest is
`v08`, next is `v09` (none cut this session, on instruction).
