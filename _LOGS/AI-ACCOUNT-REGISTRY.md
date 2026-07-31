# AI Account Registry

Every AI account working on this project has one identifier. It signs every diary entry and every
handoff log, and it appears in log file names.

**If you are an AI builder and you are not listed here, stop and ask the project owner to assign you
an identifier. Do not invent one, and do not reuse another account's.**

| Identifier | Model / Account | Platform / Room | Owner-confirmed | Active since |
|---|---|---|---|---|
| `CC-OPUS-01` | Claude Opus — elisoren428@gmail.com (Pro). **Current model version: Claude Opus 5** (recorded 2026-07-24 per the round-8 reviewer ruling); previously Claude Opus 4.8 | Claude Code — Desktop app, Windows 11. Room: "Video Hallucination Editor 7-19-2026" | ✅ Finalized 2026-07-19 (owner delegated the naming to the builder; convention below stands) | 2026-07-19 |
| `CC-FABLE-01` | Claude Fable 5 — elisoren428@gmail.com (Pro) | Claude Code — Desktop app, Windows 11. Room: "Video Hallucination Editor 7-19-2026" | Self-registered 2026-07-19 under the owner's 2026-07-19 identifier-handling delegation (same account as `CC-OPUS-01`, different model ⇒ new identifier per convention) | 2026-07-19 |
| `CC-SONNET-01` | Claude Sonnet 5 — elisoren428@gmail.com (Pro) | Claude Code — Desktop app, Windows 11. Room: "Video Hallucination Editor 7-19-2026" | Self-registered 2026-07-20 under the owner's 2026-07-19 identifier-handling delegation (same account as `CC-OPUS-01`/`CC-FABLE-01`, different model ⇒ new identifier per convention) | 2026-07-20 |
| `CC-HAIKU-01` | Claude Haiku 4.5 — elisoren428@gmail.com (Pro) | Claude Code — Desktop app, Windows 11. Room: "Video Hallucination Editor 7-19-2026" | Self-registered 2026-07-21 under the owner's 2026-07-19 identifier-handling delegation (same account as the other `CC-*` rows, different model ⇒ new identifier per convention) | 2026-07-21 |
| `CODEX-SOL-01` | Codex Sol | Codex — Desktop app, Windows 11. Room: "Video Hallucination Editor 7-19-2026" | Owner-assigned 2026-07-22; use the Codex Sol signature so cross-platform handoffs clearly identify authorship | 2026-07-22 |

> **Model-version note (2026-07-24, `CC-OPUS-01`) — RESOLVED.** On 2026-07-24 the owner switched this
> room to **Claude Opus 5** mid-session (`/model claude-opus-5`), and round-7 of `VHE-ISSUE-LOG-0033`
> was signed `CC-OPUS-01` (Claude Opus 5) per `START-HERE_NEW-ROOM_2026-07-24.md`'s explicit mapping
> ("Sonnet ⇒ `CC-SONNET-01`, Opus ⇒ `CC-OPUS-01`"), with the question of a split raised for the owner.
> **Ruling received 2026-07-24 (round-8 review, relayed by Ashley): continue signing `CC-OPUS-01`, and
> record "Claude Opus 5" as the current model version in the existing row — NO `CC-OPUS-02` split.**
> The row above is updated accordingly. This closes the question; the convention below ("different model
> ⇒ new identifier") is hereby read as applying to model *families* (Opus/Sonnet/Fable/Haiku), not to
> version bumps within one family.

## Conventions

- Identifier format: `[PLATFORM]-[MODEL]-[NN]` — e.g. `CC-OPUS-01`, `CC-SONNET-02`, `GPT-5-01`, `GEM-PRO-01`.
- The number increments per distinct account on that platform, not per session.
- The same human owner using two different AI platforms gets two identifiers. Platform matters for
  debugging: tool availability and failure modes differ between them.
- One identifier is never reused for a different account, even after an account is retired.

## Provisional identifiers

_(none — on 2026-07-19 the owner delegated identifier handling to the builder; `CC-OPUS-01` was
finalized as-is since it already followed the convention. New accounts still get their identifier
assigned before their first log entry, per the rule at the top of this file.)_

## Retired accounts

_(none yet — never delete rows from the table above; move them here with an end date)_
