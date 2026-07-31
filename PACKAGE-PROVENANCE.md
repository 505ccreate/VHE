# PACKAGE-PROVENANCE.md

**Ships in:** `VHE-Progress-update 16_2026-07-27.zip`

**This is a build-time record, NOT cryptographic proof.** A ZIP file cannot contain its own
hash, and a ZIP without `.git` metadata cannot cryptographically authenticate the repository
HEAD claimed below. This file discloses what the build script observed at build time; it does
not prove the ZIP was not altered after creation.

- **Built at HEAD:** `6d00b541f20f3f46481045182e69f7e865ab1b6b`
- **HEAD commit summary:** Append 0033 round-13 removal-lane correction (7 blockers)
- **`git status --short` at build time (disclosed, not asserted clean):**
```
(clean)
```

- **Inclusion/exclusion rule:** every `git ls-files`-tracked file from the current working tree, EXCEPT image/video binaries (png/jpg/jpeg/mp4/mov/gif/webp/bmp/ico), which are stripped and recorded in `EXCLUDED-BINARIES-MANIFEST.md` (path, size, SHA-256). This `PACKAGE-PROVENANCE.md` and the manifest are then added as the two non-tracked entries.
- **File counts:** 166 lean tracked files + `EXCLUDED-BINARIES-MANIFEST.md` + `PACKAGE-PROVENANCE.md` = 168 entries.
- **`.env` status:** no `.env` (or any `.env.*` variant other than `.env.example`) is tracked or included. `.env.example` is credential-free but carries the two known non-secret defaults `S3_REGION=auto` and `VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296` — all credential-bearing values are empty; safe non-secret configuration defaults are permitted.
- **`library/tools/` leak check:** zero tracked paths under `library/tools/` (37k-file directory is never scanned; verified via `git ls-files` grep, not a directory walk).

## VHE-2 4.2 - amendment AUTHORIZED (round 12) but DEFERRED (round 13). NOT APPLIED.

Ashley authorized option (iii) - a documented amendment to VHE-2 4.2 implementing a typed execution failure/result contract (frozen claim-time `execution_attempt`, provider/operation references, submission disposition, charge state, known `cost_cents`, retryability, machine error code); known billed failures ledgered before retry or termination; accepted/ambiguous with unknown cost enters reconciliation and never auto-retries; `jobs.cost_cents` recomputed from the reconciled ledger sum so the terminal assignment can never overwrite the rollup; terminal state + ledger + rollup in ONE short Postgres transaction; no database transaction ever held open across a network call.

**The reviewer then DEFERRED execution at round 13, and that ruling governs.** Entry `0034` must NOT be executed and 4.1/4.2 must NOT be modified while the round-13 blockers are open - amending now would freeze incomplete contracts into both the Markdown mirror and the binary blueprint, forcing an immediate second amendment. After round 13 clears review, ONE scoped `0034` covers both 4.1's `kind: "execute"` payload and 4.2's typed contract, with `_BLUEPRINTS-TEXT/_regenerate.py` rerun in that same session.

**Every blueprint `.docx` in this package is byte-for-byte unchanged from every prior package.** `0034` remains reserved and unexecuted. VHE-2 on disk says exactly what it always said.

