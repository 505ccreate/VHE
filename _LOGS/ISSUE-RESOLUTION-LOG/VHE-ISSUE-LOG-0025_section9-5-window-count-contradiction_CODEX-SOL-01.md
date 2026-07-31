# VHE-ISSUE-LOG-0025 — §9.5 300-frame window-count contradiction

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0025 |
| **Date / time** | 2026-07-22 22:39 EDT |
| **Logged by** | `CODEX-SOL-01` — Codex Sol |
| **Platform / room** | Codex — Desktop app, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.5 · VHE-5 §B3/B5 |
| **Category** | Discovery + delegated decision |
| **Status** | **PARTIALLY RESOLVED** — ruling recorded; implementation/verification in progress |

---

## 1. What happened

VHE-2 §9.5 fixes `W=48`, `O=8` and the sequence `[a,a+W-1]`, then starts each next window at `previousStart + W - O`. Its exit gate says a 300-frame range creates 7 children. That is arithmetically impossible: seven windows cover `48 + 6×40 = 288` frames; an eighth window is required for the final 12 frames. VHE-5 repeats the 7-child expectation.

## 2. Why it matters

Forcing seven children would silently drop frames 288–299, violating the repair range and the product's "wrong is worse than slow" rule.

## 3. Attempted solutions

1. Recomputed the inclusive range and enumerated the written formula. Result: starts `0,40,80,120,160,200,240,280`; 8 windows.
2. Checked VHE-5 for an alternate rule. Result: it explicitly says the §9.5 rules are unchanged, so it repeats rather than resolves the contradiction.

## 4. Resolution

Under the owner's 2026-07-22 delegated authority, preserve the normative W/O formula and complete frame coverage. A 300-frame inclusive range produces 8 children. Treat the number 7 in both exit-gate sentences as a documentation defect. Do not modify frozen VHE-2; flag VHE-5 text for a later source-document correction.

## 5. Verification

Pending implementation tests.

## 6. Affected files / components / tests / commits

- `_LOGS/LOG-INDEX.md` — claimed entry 0025.
- Planned: `packages/repair/chunked-repair.ts` and tests.
- No commit yet.

## 7. Prevention

Derive expected child counts from the window formula in tests; never hardcode a count that does not prove full `[a..b]` coverage.

## 8. Related entries

- `VHE-ISSUE-LOG-0024` — §9.2A deterministic core that §9.5 extends.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one signed and dated.

### 2026-07-22 22:48 EDT — `CODEX-SOL-01` / Codex Sol — deterministic build completed

Implemented `packages/repair/chunked-repair.ts`: exact W/O coverage, global absolute keyframes + fixed seed, deterministic `{parentJobId}:win:{index}` payloads, carry-mask frames, sequential resume from the first non-succeeded child, mask-only overlap blending, masked SSIM, and env-configured native/proxy memory selection. Added `createChildJob` to set and verify `parent_job_id` under §4's budget/idempotency/enqueue rules. `VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296` is documented in `.env.example`; no ceiling is hidden in code.

Verification: scoped §9.5/job tests **18/18 PASS**; full suite **123/123 PASS (14 files)** on Node v22.23.1; live Postgres child claim proved one row/one enqueue with the correct parent. Preflight remains **PASS 13 / FAIL 4 / SKIP 1**, solely the four undelivered §1 AI fixtures. The real 300-frame repaired-output count, real overlap-quality run, and peak worker RSS gate remain OPEN because §9.2 GPU/hosted quality execution is still explicitly blocked. No such result is claimed.
