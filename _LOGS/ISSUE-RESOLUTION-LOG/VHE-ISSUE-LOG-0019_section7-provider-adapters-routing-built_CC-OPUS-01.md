# VHE-ISSUE-LOG-0019  —  §7 built: BYOK provider adapters + capability routing

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0019 |
| **Date / time** | 2026-07-20 ~11:25 EDT |
| **Logged by** | `CC-OPUS-01` (Claude Opus 4.8) |
| **Platform / room** | Claude Code — Desktop, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §7 (Provider Adapters & Capability Routing) · §6.1 (boundary tests, Ruling 3) |
| **Category** | Decision / Discovery (blueprint defect) / build record |
| **Status** | **RESOLVED** — §7 exit gate passes live; core built and verified |

---

## 1. What happened

With §17 Q2 answered (`VHE-ISSUE-LOG-0018`), §7 was unblocked and built. Scope this session was set by
the owner in chat: **core routing engine + exit gate, everything verified; real fal/Replicate/Google/
OpenAI SDK adapters DEFERRED** because they are BYOK and this room holds no provider key, so they could
not be verified this session. Built under `packages/providers/`:

- `types.ts` — verbatim §7 `Capability`, `CapabilityManifest`, `GenRequest`, `GenResult`,
  `ProviderAdapter`.
- `crypto.ts` — AES-256-GCM provider-key storage mapping onto the frozen §2
  `provider_connections` columns (`key_ciphertext` = ciphertext‖16-byte GCM tag, `key_nonce` = 12-byte
  nonce, `kek_version`). KEKs from env `PROVIDER_KEK_V<n>`; highest version encrypts, any version
  decrypts (rotation).
- `cost-defaults.ts` — conservative per-capability cent defaults (data module — see §4 note).
- `routing.ts` — `manifestSatisfies` (verbatim filter), `routeChain` (owner `is_default_for` head,
  then the `0018` fallback order fal→replicate→google→openai, unranked slugs last/stable), `walkChain`
  (try each, record `error_code`, fall through; empty/exhausted → `NO_PROVIDER` before spend).
- `connections.ts` — `loadConnections` (key-free manifests for routing) + `decryptConnectionKey`
  (last-moment plaintext, per the §7 security rule).
- `cost.ts` — `estimateCostCents` (sync createJob seam) + `estimateCostCentsFromChainHead` (§7 form).
- `registry.ts` — adapter registry + `runGeneration` orchestration (load → route → walk → decrypt →
  submit → poll-to-terminal), returning the winning `connectionId` + `costCents` for the job row.
- `providers.test.ts` — deterministic layer (crypto round-trip/tamper, routing order/filter/empty,
  the exit gate via two mock adapters, cost seam) + a **live-Postgres** exit-gate test.

**Two blueprint findings (both minor, both handled):**

1. **The .docx dropped two compile-required generics from its own §7 code** — the same defect class as
   `VHE-ISSUE-LOG-0016`. `describeCapabilities(key): Promise;` must be `Promise<CapabilityManifest>`;
   `cancel?(...): Promise;` must be `Promise<void>`. Both restorations are unambiguous from the
   surrounding contract. Flagged inline in `types.ts` with `🔧 BUILDER` comments.
2. **`estimateCostCents` seam-timing mismatch.** §7 says it "reads costHintCentsPerOp from the chosen
   chain's head," but createJob's `deps.estimateCostCents` runs at CLAIM time, before routing, so no
   chain exists yet (and the chain can fall through — the head is not necessarily who bills). Resolved
   by splitting: the sync createJob seam returns the conservative per-capability default (exactly §7's
   "unknown → defaults" branch — the only honest pre-spend gate), and a separate
   `estimateCostCentsFromChainHead` implements the "reads from head" form for post-routing use. No §4
   change — the sync seam shape createJob expects is unchanged.

## 2. Why it matters

§7 is the wall in front of §8/§9/§10. Routing + BYOK key storage + cost estimation are now in place and
the exit gate is proven, so the visual-repair pipeline work can proceed. The dropped-generics finding
matters because a future builder copying §7 verbatim from the .docx would get code that does not
compile; it is now recorded as a third instance of the "the source document lost its own tokens"
pattern (`0016`, and the numeric-constant class in `0017`).

## 3. Attempted solutions

Straight build, no dead ends. The only design decisions were the two findings in §1 (generics; cost
seam timing) and the config-table question in §4 below. All were resolved by flagging + a
behavior-preserving choice rather than a silent pick.

## 4. Resolution

Files as listed in §1. One decision deliberately NOT made unilaterally (anti-drift):

**Config table vs. code for cost defaults.** §7 says the per-capability defaults live in a "config
table, not code." The §2 schema is FROZEN and has no config table; adding one is an architecture
change the builder must not make alone. Implemented the defaults as a **data module**
(`cost-defaults.ts` — a plain lookup, no branching logic), which honors the "editable as
configuration" intent without a migration. **Flagged for the owner** (here and in `0018` §4): if a DB
`config` table is wanted, that is a future migration and this module becomes its seed/fallback.

**Deferred (owner-scoped this session):** the four real provider adapters
(`fal`/`replicate`/`google`/`openai`) that implement `ProviderAdapter` against the vendored SDKs. They
need live keys to verify; building them blind would violate "never claim tested without verification."
The registry + routing are provider-agnostic and ready to receive them once a key is granted.

## 5. Verification

Ran the full suite under fnm Node 22.23.1:
`node node_modules/vitest/vitest.mjs run --reporter=verbose` →
**Test Files 6 passed, Tests 32 passed** (was 21; +8 §7 deterministic, +1 §7 live-Postgres,
+2 §6.1 boundary).

- **§7 exit gate, deterministic:** two mock adapters, first throws, `runGeneration` routes past it and
  returns the SECOND connection's id (`conn-ok`) and its cost (`7`). Empty chain → `NO_PROVIDER`.
- **§7 exit gate, live Postgres (1922 ms — genuinely hit the DB):** inserted two real
  `provider_connections` rows (keys encrypted via `crypto.ts`) + a real `jobs` row; `runGeneration`
  fell through the failing mock to the second; wrote `provider_id` + `cost_cents` onto the job row;
  asserted the row shows the SECOND provider's id and cost (`11`). This is the §7 exit gate verbatim.
- **crypto:** encrypt→decrypt round-trips; a one-byte flip of the ciphertext throws (GCM auth).
- **§6.1 boundary (Ruling 3):** every integer ms 0..300000 at 30000/1001 and 60000/1001 — `msToFrame`
  is monotonic, skips no frame, and each frame's first ms is within ±1 ms of `frameToMs(frame)`.
- `pnpm preflight` → **PASS 13 / FAIL 4 / SKIP 1** (unchanged — §7 does not touch the fixture gate).

## 6. Affected files / components / tests

- `packages/providers/{types,crypto,cost-defaults,routing,connections,cost,registry}.ts` — created.
- `packages/providers/providers.test.ts` — created (8 deterministic + 1 live).
- `packages/media/ffmpeg.test.ts` — added the §6.1 arbitrary-ms boundary block (Ruling 3).
- `_LOGS/LOG-INDEX.md` — 0018/0019 claimed; §17 Q2 open item closed.
- No change to any §2 schema, any verbatim §4 code, or `packages/jobs/*`.

## 7. Prevention

- **Third instance of "the .docx dropped its own code tokens"** (`0016` generics/backticks/`<svg>`;
  `0017` numeric constants; now `0019` two `Promise<…>` generics). Harvest candidate: a lint/CI check
  that flags a bare `Promise;` / `Promise<>`-less return in transcribed blueprint interfaces. Until
  then the rule stands: **transcribe §-code from `word/document.xml`, restore obviously-dropped
  compile tokens, and run the suite (type-stripping surfaces the syntax breakage).**
- **Cost-default "config table" is an unresolved owner decision**, not settled by this build — see §4.

## 8. Related entries

- `VHE-ISSUE-LOG-0018` — the owner ruling that unblocked and shaped this build.
- `VHE-ISSUE-LOG-0016` — prior ".docx dropped its own tokens" instance (§5 generics/backticks).
- `VHE-ISSUE-LOG-0015` / `0017` — the §4 lifecycle + transport `runGeneration` will feed via the
  worker handlers; `estimateCostCents` drops into createJob's existing seam with no §4 change.
- `VHE-ISSUE-LOG-0007` — production worker topology still open; §7 wrote no deployment config.

---

## Appended corrections

**2026-07-20 ~11:40 EDT — `CC-OPUS-01` — committed + review zip.** §7 was committed to `master` after
the entry above was filed (the entry's §6 listed files but no commit — this records it):
- Pre-§7 baseline: `41b9657169a4f6ed456a4a95bc87d9cf6582f276`.
- §7 implementation commit: `f77aaf11604e30a5e1423e41a905e7a9da7a5e28` (15 files, +1377/−100).
- `HEAD` is a logs-only follow-up recording these hashes (this correction + handoff `-08`).
Working tree clean at close. A review package `VHE-SECTION-7-ELI-REVIEW_2026-07-20.zip` was generated
for Eli post-commit (source + tests + logs + `41b9657..HEAD` patch/diff; no secrets, no binaries;
gitignored, regenerable). Test result at close unchanged: **32/32** (`--reporter=verbose`), preflight
**PASS 13 / FAIL 4 / SKIP 1**. Nothing in the entry above changed; this only appends the commit facts.
