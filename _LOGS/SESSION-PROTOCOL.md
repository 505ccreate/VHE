# Session Protocol — how to log *during* a session

The failure this protocol prevents: a session hits its context or time limit mid-task, dies, and the
next builder inherits half-written code with no record of intent. Logs written only at the end of a
session are logs that frequently never get written.

**Log as you go. Assume this session can be cut off at any moment, without warning.**

---

## 1. Session start

1. Read `STATUS-HANDOFF/CURRENT-STATUS.md`, then the latest dated handoff.
2. **If the previous session ended without a handoff log** (CURRENT-STATUS.md is stale, or the last
   handoff says work was in progress with no closing entry): your first action is to reconstruct and
   write that missing log. Inspect the actual file state on disk, determine what really happened, and
   write the overdue Issue & Resolution entries and handoff log **before** starting new work.
   Mark reconstructed entries clearly:
   `RECONSTRUCTED — written by [username] on [date] for a session that terminated before logging.`
3. Confirm your identifier in `AI-ACCOUNT-REGISTRY.md`.
4. Open a working draft immediately: `STATUS-HANDOFF/_IN-PROGRESS_[username].md`.
   This is your live scratch handoff. It exists from minute one, not minute ninety.

## 2. During the session — checkpoint cadence

Update `_IN-PROGRESS_[username].md` at **every one** of these moments. It takes 30 seconds.

- Before starting a new work order or blueprint section.
- After any file is created or meaningfully changed.
- After any test run — record the actual result, pass or fail.
- The moment anything unexpected happens (error, wrong behavior, surprising discovery).
- Before any long or risky operation (install, migration, large refactor, batch render).
- Roughly every 20–30 minutes of continuous work even if nothing notable occurred.

Each checkpoint is one or two lines with a timestamp. Format:

```
[12:36] Started VHE-2 §3 ingest worker. Created src/workers/ingest.ts.
[12:51] ffprobe wrapper returns fps as float on vfr_phone.mp4 — violates §0 rational-fps rule. Investigating.
[13:04] Confirmed: ffprobe r_frame_rate parse was using parseFloat. Fixed to keep num/den. Test passes.
```

**When an issue takes more than one checkpoint to resolve, stop and open the numbered diary entry
immediately** — do not wait for session end. Claim the next number in `LOG-INDEX.md` first so two
rooms working in parallel cannot collide on the same number.

## 3. Session end — strict order

1. Finish all implementation, verification, testing, and file updates **first**.
2. Write or complete the numbered Issue & Resolution diary entries.
3. Update `LOG-INDEX.md` with the new entries.
4. Write the dated handoff log in `STATUS-HANDOFF/`, referencing diary entries by exact number only.
5. Overwrite `CURRENT-STATUS.md` with the true final state.
6. Delete your `_IN-PROGRESS_[username].md` draft — it has been superseded.

The handoff must describe what is **actually true on disk**, including unfinished and broken work.
An honest "left mid-refactor, tests red, see VHE-ISSUE-LOG-0012" is far more valuable to the next
builder than an optimistic summary.

## 4. Anti-drift rules

These are the behaviors the logging system exists to prevent. They apply to every builder.

- **No assumptions.** If the blueprint does not specify it, the answer is not "pick something
  reasonable" — it is "flag it and log it as an open decision."
- **No pivots.** Do not change architecture, stack, library, or approach because you think there is a
  better way. Log the proposal as a diary entry and let the project owner decide.
- **No invented history.** Never write a log entry describing work you did not verify. If you did not
  run the test, say the test was not run.
- **No silent scope growth.** Building something the work order did not ask for is a drift event and
  gets logged as one.
- **Verbatim means verbatim.** VHE-2 §0 requires code blocks be copied as written; only
  `// BUILDER:` lines are adapted. Deviating from that is a loggable event.
- **No FFmpeg improvisation.** Every FFmpeg invocation goes through the VHE-2 §6 wrapper. If the
  command you need is not there, stop and flag it.
