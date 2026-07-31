# VHE Handoff — 2026-07-23-16 — fal key-location correction

| Field | Value |
|---|---|
| **Logged by** | `CODEX-SOL-01` — Codex Sol |
| **Platform / room** | Codex — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 06:30 EDT |
| **Purpose** | Correct Marcus restart brief: fal key is now available in the central library |

**Verified central key location:** `C:\Users\user\Documents\Soren-Tools-Library-V1 - TRANSFER 2026-07-17\Api key.txt`

The file exists. Its contents were not opened, copied, logged, or committed. When wiring fal, read it only inside the existing server-side encrypted-connection flow; never echo it, place it in `.env.example`, or commit it. This replaces the prior statement that a fal key was absent. No code or tests changed in this correction-only session.
