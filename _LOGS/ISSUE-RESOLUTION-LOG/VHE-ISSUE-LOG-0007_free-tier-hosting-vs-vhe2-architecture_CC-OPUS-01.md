# VHE-ISSUE-LOG-0007  —  Free-tier hosting direction (Vercel/Firebase/Supabase) vs VHE-2's long-running-services architecture

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0007 |
| **Date / time** | 2026-07-19 14:25 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Blueprint section(s)** | VHE-2 §0 (stack), §2 (schema), §4 (job lifecycle/BullMQ), §14 (realtime/WS) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Category** | Decision / Architectural tension |
| **Status** | **DEFERRED** — direction recorded; concrete provider mapping is an open decision for the owner |

---

## 1. What happened

While answering the VHE-2 §17 questions (recorded in `VHE-ISSUE-LOG-0003`), the owner added a
hosting constraint not present in any blueprint:

> Build locally, but host on free-tier services — Vercel, Firebase, Supabase, "wherever we can
> host typically for free."

(The owner's message said "for sale" — read in context as a voice-input rendering of **Vercel**.
If that reading is wrong, the owner should correct this entry.)

## 2. Why it matters

VHE-2's architecture assumes **long-running processes**: a Fastify API server, Node media workers,
Python AI workers, BullMQ consumers polling Redis, and WebSocket connections (§14). Typical
free tiers are serverless: short-lived request-scoped functions, no resident workers, no
long-lived sockets, no local Redis.

This is a tension, **not** a contradiction — but it must be resolved deliberately, not absorbed
silently by whoever writes the first deployment config:

| VHE-2 component | Free-tier fit |
|---|---|
| Postgres 16 | ✅ **Supabase free tier is exactly this** — cleanest alignment |
| S3-compatible storage | ✅ Supabase Storage / Cloudflare R2 free tier |
| Fastify API | ⚠️ Runs on Vercel functions with an adapter, but not as a resident server |
| Redis 7 + BullMQ workers | 🚨 **No mainstream free tier runs resident BullMQ consumers**; serverless Redis (Upstash) exists but polling workers need somewhere to live |
| FFmpeg/video processing | 🚨 CPU-heavy, exceeds serverless time/size limits |
| WebSockets (§14) | ⚠️ Not on Vercel functions; Supabase Realtime is a *different* mechanism than the §14 contract |

The likely resolution shape (recorded for discussion, **not decided**): dev runs everything
locally per VHE-2; production splits into hosted-Postgres/Storage (Supabase) + serverless frontend
(Vercel) + **some** always-on element for workers (a free-tier container host, a home machine, or
deferring heavy jobs entirely to the hosted AI APIs which already do the GPU work). Since Q3 chose
API-only, the heaviest compute already lives with fal.ai/Replicate — what remains local is FFmpeg
assembly work, which is the piece that most needs a real process.

## 3. Attempted solutions

Analysis only — mapping VHE-2's components against free-tier capabilities (table above). No
deployment work attempted; nothing exists to deploy.

## 4. Resolution

**Deferred.** The constraint is now recorded where every room will see it (CURRENT-STATUS +
CLAUDE.md). What is *decided*: build and develop locally against the VHE-2 stack as written;
target free-tier hosting. What is *open*: the exact production mapping, especially **where BullMQ
workers and FFmpeg jobs run in production**. This does not block Phase 0–2 (local development);
it must be answered before any deployment work begins.

Also recorded from the same owner message: a central **API-key library** exists, managed by the
owner, who will grant rooms access when needed. Keys are never stored in this project
(`library/` policy, `VHE-ISSUE-LOG-0006`).

## 5. Verification

Nothing to verify — this entry records a constraint and an analysis, not a change. The free-tier
capability table reflects general platform knowledge as of 2026-07 and should be re-checked
against current provider terms when deployment work actually starts.

## 6. Affected files / components / tests / commits

- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`, `CLAUDE.md` — constraint recorded
- Future: every deployment config; VHE-2 §4/§14 production topology

## 7. Prevention

Deployment-shaped decisions get logged **before** the first deployment config is written. Any
builder who finds themselves choosing a production host for workers without an owner decision on
record here is drifting — stop and flag.

## 8. Related entries

- `VHE-ISSUE-LOG-0003` — the §17 answers this constraint arrived with
- `VHE-ISSUE-LOG-0005` — local Postgres/Redis gaps that Supabase/hosted routes could cover
- `VHE-ISSUE-LOG-0006` — library policy on credentials; central API-key library

---

## Appended corrections

_(none)_
