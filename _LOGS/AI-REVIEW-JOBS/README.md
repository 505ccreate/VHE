# VHE AI REVIEW JOBS — permanent reviewer entry point

This folder is the official queue for **review, audit, consultation, and specification-check assignments** performed by an AI that is not the author of the material under review.

## Start here when you are asked to review VHE

1. Read `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`.
2. Read the newest handoff named by CURRENT-STATUS.
3. Read `_LOGS/SESSION-PROTOCOL.md` and `_LOGS/AI-ACCOUNT-REGISTRY.md`.
4. Open the active assignment in this folder. Active files begin with `ACTIVE-`.
5. Read only the authority files and source seams named by that assignment. Do not re-derive the entire project unless the assignment explicitly requires it.

## Reviewer rules

- **Review is not implementation.** Do not edit source, migrations, blueprints, package files, provider configuration, or runtime behavior unless the assignment explicitly authorizes implementation.
- **Do not grade from summaries alone.** Verify every important claim against the exact cited specification text, source file, schema, test, or package evidence.
- **Do not silently repair the author’s work.** Record each defect, contradiction, undefined term, missing state, race, type mismatch, or test gap in the verdict.
- **Do not self-certify.** The author of an assignment cannot count as its independent reviewer.
- **Later append wins.** When reviewing append-only VHE specification chains, preserve all prior text and treat later binding corrections as governing on conflict.
- **No assumptions, no pivots, no invented history, no scope growth.** If the assignment does not authorize a decision, identify it as unresolved.
- **No provider access or spend unless explicitly authorized by Ashley.** Do not read keys, call provider APIs, run paid probes, upload media, or spend money.
- **No blueprint edits while a review gate is open** unless the active assignment explicitly says the gate has cleared and authorizes the edit.

## Required review output

Every reviewer must create one verdict file in this folder named:

`VERDICT-<assignment-id>_<YYYY-MM-DD>_<REVIEWER-SIGNATURE>.md`

The verdict must include:

1. Reviewer name/signature and platform.
2. Exact commit or branch reviewed.
3. Files actually read.
4. Verification method for each reviewed claim.
5. One finding section per numbered review target.
6. Final verdict: `PASS`, `PASS WITH CONDITIONS`, or `REJECTED`.
7. Exact remaining blockers, if any.
8. Statement of what was **not** run or changed.
9. Recommended next gate.

Do not overwrite another reviewer’s verdict. Multiple independent verdicts may coexist.

## Logging and signatures

Before reviewing, the AI must confirm its identity in `_LOGS/AI-ACCOUNT-REGISTRY.md`. Owner-recognized display signatures are:

- **Eli Soren** — ChatGPT/main AI
- **Marcus Soren** — Claude AI
- **Eli Junior** — Codex/online builder
- **Marcus Junior** — Claude Code

Historical machine identifiers remain valid aliases in older logs. New work must use the owner-recognized display signature and its registered identifier where available.

At the beginning of the review, create an intent log under `_LOGS/STATUS-HANDOFF/` following the session protocol. At the end, write the verdict, update the relevant status/handoff files only if the assignment authorizes that bookkeeping, and close the in-progress log.

— Permanent system established by **Eli Soren (`GPT-5-01`)** under Ashley’s authorization, 2026-08-01.
