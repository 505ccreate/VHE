# VHE-ISSUE-LOG-####  —  [Short Title]

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-#### |
| **Date / time** | YYYY-MM-DD HH:MM TZ |
| **Logged by** | `IDENTIFIER` (from AI-ACCOUNT-REGISTRY.md) |
| **Platform / room** | e.g. Claude Code — Desktop, Windows 11, room "…" |
| **Blueprint section(s)** | e.g. VHE-2 §6.4, VHE-5 §B4.5 — or "N/A" |
| **Category** | Failure / Mistake / Unexpected behavior / Discovery / Decision / Drift event |
| **Status** | **RESOLVED** / PARTIALLY RESOLVED / DEFERRED / UNRESOLVED |

---

## 1. What happened

State the issue plainly. What was being attempted, and what actually occurred instead of the
expected result. Include the exact error text or observed behavior — not a paraphrase.

## 2. Why it matters

The downstream consequence. What breaks, what gets slower, what a future builder would get wrong if
they did not know this.

## 3. Attempted solutions

Every attempt, in order, including the ones that failed. Failed attempts are the most valuable part
of this section — they stop the next builder from repeating them.

1. **Attempt:** …
   **Result:** …
2. **Attempt:** …
   **Result:** …

## 4. Resolution

The exact correction that worked. Be specific enough to reproduce: exact commands, exact file paths,
exact code changes, exact settings.

**If not resolved:** state exactly where it stands, what is blocking it, and what the next builder
should try first.

## 5. Verification

How the fix was confirmed. What was run, and what it output. If nothing was run, write
`NOT VERIFIED` — never imply verification that did not happen.

## 6. Affected files / components / tests / commits

- `path/to/file.ts` — what changed
- Test: `…` — pass/fail
- Blueprint section: `…`

## 7. Prevention

What tool, wrapper, test, lint rule, checklist item, or blueprint clarification would stop this from
recurring. This section is harvested at project end for the Soren Tools Library.

## 8. Related entries

- `VHE-ISSUE-LOG-####` — how it relates

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

_(none)_
