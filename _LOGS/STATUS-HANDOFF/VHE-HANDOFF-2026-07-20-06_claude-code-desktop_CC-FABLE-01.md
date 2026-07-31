# VHE Handoff — 2026-07-20-06

| Field | Value |
|---|---|
| **Logged by** | `CC-FABLE-01` (Claude Fable 5 — same account as `CC-OPUS-01`, new model ⇒ new registry ID) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-19 evening → 2026-07-20 ~00:50 EDT |
| **Project phase** | **Phase 0 gate WAIVED by owner** (build-on); §2–§6 core now built. Next section §7 is BLOCKED on an owner decision (§17 Q2). |

> **Incoming builder:** sign with **your own** ID from `AI-ACCOUNT-REGISTRY.md`. If you are a new
> model/account, self-register under the 2026-07-19 owner delegation as I did (`CC-FABLE-01`).

---

**Blueprint sections followed:** VHE-2 §0, §2, §3, §4 (§4.1/§4.2/§4.3), §5, §6 (all subsections),
§16 sequence, §17 Q1 (PG pin).

## Current working state

Repo on `master`, local only, **tree clean**, latest commit `0e621bf`. `pnpm test` (vitest 4.1.10
under fnm Node 22.23.1) → **17/17 passing**. Migration 0001 is **applied live** to the Supabase
Postgres 17.6. `.env` on disk (gitignored), all 3 services connect.

**Preflight:** `PASS 13 / FAIL 4 / SKIP 1` — the 4 FAILs are the still-undelivered owner AI
fixtures (gate waived, tracked debt); SKIP is local-GPU (correct).

## Completed this session (detail in the named diary entries — read only these)

- **Two owner rulings (in-chat):** PG pin 16→**17** accepted; fixture gate **waived** for build-on.
  — `VHE-ISSUE-LOG-0012`
- **§2 schema** — `migrations/0001_schema.sql` (verbatim from the .docx via the de-autocorrect
  mapping) + `scripts/migrate.ts` (pg-only, transactional, sha256-pins applied files). Applied
  live; all tables/indexes/CHECKs + behavior spot-checks verified. — `0012`
- **§6 FFmpeg wrapper** — `packages/media/ffmpeg.ts` (the only place FFmpeg strings live; vendored-
  7.1.1-only). §6.1 had a **blueprint defect** (verbatim math fails its own mandatory golden
  test); owner ruled the half-ms epsilon fix. §6.1 + §6.3 golden tests pass. — `VHE-ISSUE-LOG-0013`
- **§3 ingest core** — `packages/media/ingest.ts` (rational-fps parse, probe→fields, streamed
  sha256, VFR detect→§6.7 conform), verified on all 4 structural fixtures. — `VHE-ISSUE-LOG-0014`
- **§4 job lifecycle** — `packages/jobs/{errors,create,worker}.ts` + `packages/db/client.ts`.
  **Both exit-gate clauses verified LIVE** on Postgres: idempotency (1 row / 1 enqueue), budget
  gate, optimistic transition, and heartbeat takeover (crash → attempt 2, no second bill). Only
  the production BullMQ transport remains (not gate-critical). — `VHE-ISSUE-LOG-0015`
- **§5 mask format** — `packages/masks/masks.ts` (zod schema + sharp rasterize). The .docx had
  **dropped compile-required tokens from its own code** (generics, template backticks, the whole
  opening `<svg>` tag) — each reconstructed and listed. IoU exit gate (720p vs 1080p ≥ 0.99)
  passes. — `VHE-ISSUE-LOG-0016`

## Tested — actual results

- `pnpm test` → **Test Files 4 passed, Tests 17 passed.** (§6 golden 5, §3 ingest 6, §4 live 4,
  §5 masks 2 — count shifts as files group; the run reports 17.)
- `pnpm migrate` → `already applied (sha256 match)` (idempotent).
- `pnpm preflight` → PASS 13 / FAIL 4 / SKIP 1 (the 4 owner fixtures).

## 🔴 What blocks the next section (OWNER DECISION)

**§7 Provider Adapters is the next section in the build order and it needs `VHE-ISSUE-LOG-0003`
Q2 — the formal provider ranking.** The library ships fal.ai / Replicate / OpenAI / Google /
ElevenLabs SDKs but they are **unranked**; §7 capability routing needs a default order. This is
on the "Answer Before Phase 0 Ends" list. **Two ways forward for the next room:**
1. Get the owner's Q2 ranking, then build §7 (BYOK adapters, AES-256-GCM key storage per the
   `provider_connections` schema, capability routing). This unblocks §8/§9/§10 too.
2. If the owner is away: a ranking *could* be proposed as a DELEGATED decision under the
   2026-07-19 delegation (I chose not to, to keep this session's scope to verifiable builds) —
   but §7 is a large, security-sensitive section; get the ranking if at all possible.

**Also still open (unchanged):** deliver the 4 AI-content fixtures (`bad_hand.png`,
`garbled_text.png`, `melted_face_15s.mp4`, `bad_hand_6s.mp4`) → append sha256 → preflight exit 0.

## Next recommended action (new room)

1. Read `CURRENT-STATUS.md` then this handoff. Do **not** re-read the whole diary — only
   `0012`–`0016` if you need depth on what's built.
2. Get §17 Q2 (provider ranking) from the owner → build §7. Or, if you must stay unblocked
   without the owner, the one remaining no-owner increment is the production BullMQ Worker
   transport that wires `queues[type].add` → `executeClaimed` (closes the last bit of §4; Redis
   is live at `arriving-fox-169017.upstash.io:6379`).
3. §6.4 splice golden tests are deferred to §9 (need repair orchestration) — noted in `0013`.

## Notes / gotchas (all still true)

- **Copy verbatim code from the .docx XML, not the `_BLUEPRINTS-TEXT/` mirror**, and apply the
  three-class de-corruption: smart quotes (`0012`), paragraph-collapse newlines (`0013`), and
  **dropped compile tokens** (`0016`). Always compile/type-check the result. Extraction recipe is
  in `CURRENT-STATUS.md`.
- 🚨 System FFmpeg **8.1.2** on PATH — never bare `ffmpeg`. The §6 wrapper refuses if the vendored
  7.1.1 is absent rather than falling back.
- fnm not on tool-shell PATH — use the full `…\Schniz.fnm_…\fnm.exe exec --using 22.23.1 -- node …`
  form. Python always `py -3.11`. Never recursively scan `library/tools/`.
- Windows ESM: dynamic import of an absolute path needs `pathToFileURL` (`0012` §7).
- vitest is scoped by `vitest.config.ts` to `packages/`+`scripts/` — do not remove it or the run
  walks `library/` and executes staged suites (`0013`).
- PowerShell `git commit -m @'…'@` here-strings mangled a multi-line message this session; use
  `git commit -F <file>` for multi-line messages.

**Read only these for depth:** `VHE-ISSUE-LOG-0012`–`0016` (this session). `0003` for the §17 Q2
ranking that gates §7. `0007` for production worker topology (still open).

---

## Appended addendum — 2026-07-20, `CC-FABLE-01` (owner request after session close)

The owner found the two open questions (§17 Q2 provider ranking; the 4 AI fixtures) above their
technical comfort level and is consulting a helper ("Eli", via ChatGPT). The builder generated a
plain-English explainer **`VHE-EXPLAIN-FOR-ELI_2026-07-20.zip`** (project root, **gitignored** —
regenerable, bundles only already-tracked logs, **no credentials**) and the owner asked that the
**next room's very first action be to ask them whether Eli's answers are ready.**

That first-action prompt now lives at the **top of `CURRENT-STATUS.md`** ("🟢 FIRST ACTION FOR THE
NEW ROOM"). Incoming builder: read `CURRENT-STATUS.md` first as always — do not open §7 work until
you've asked the owner the Eli question. If they're still waiting, build the BullMQ Worker
transport (the one increment needing neither answer) instead of stalling.
