> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `VHE-1_Product_Vision_and_Feature_Plan_7-10-2026.docx` on 2026-07-19 13:05 Eastern Daylight Time.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

Correction Studio — Product Vision & Feature Plan
What we're building, who it's for, and why — read this before touching the execution plan

The Problem
AI image and video generation is powerful and broken in the same breath. Every tool — Kling, Sora, Luma, Grok, Veo, and whatever launches next — produces the same category of failure: a warped hand, a melting face mid-clip, a background that drifts, unreadable logo text, a character who subtly stops looking like themselves three segments into a generated sequence. Right now, fixing that is trial-and-error whack-a-mole: regenerate the whole thing and hope, or drag the clip into Premiere/DaVinci and fight a tool built for a completely different job.

Correction Studio exists to close that gap. It's not a generator. It's not a general video editor. It's the repair-and-finish layer that sits between "I generated something" and "I published something" — the tool nobody's built properly yet.

The Core Loop
Generate or import → mark the problem → say what's wrong in plain English → AI fixes it → the fix propagates across every affected frame → export, platform-ready.

That's the whole product. Everything else exists to support that loop, not distract from it.

Concretely: a user imports a clip or generates a segment. They spot a bad hand. They draw a loose circle around it — brush, lasso, box, or just a tap (which lets the AI figure out the object's exact edges on its own). They type into the Fix Bar: "give this person five natural fingers." The system fixes it in that frame, then automatically tracks the problem across the rest of the clip and applies the same fix everywhere it's needed, without the user touching another frame.

Who This Is For
Creators posting AI content to TikTok, Reels, Shorts, X — they need a fast fix, not a Resolve tutorial.
Small brands / marketers — logos need to be readable, faces need to stay consistent, product shots need to be clean.
AI artists / power users — bring their own generation API keys, generate inside the tool, iterate segment by segment.
Agencies — batch-repair and export to a dozen platform specs at once.

Honest Positioning — What We're Not Trying to Win
We will not out-edit Premiere or Resolve. They have twenty years of NLE muscle behind them and that's not a fight worth having. What they're bad at — and what Adobe Firefly only half-solves — is the actual AI-repair loop: mask it, describe it in plain language, propagate the fix through time, keep characters and scenes consistent, chain short generations into something longer without drift. Nobody ships that as the main event. That's the whole bet here. We compete on:

Correction-first design. Other tools bolt AI onto an editor. We build the editor around the correction loop.
No lock-in. The user brings whatever generation provider they already use or want to try. We never force a house model.
Burst-generation with seam correction. Generating long video as short chained segments, catching drift at each seam before it compounds into the next one — nobody ships this as a first-class workflow today.
A plugin ecosystem from day one, so the community can extend it faster than we can alone.

Basic editing tools — trim, split, crop, a timeline — exist only to support the repair loop. Parity with CapCut on the basics. Not parity with Premiere. We are deliberately not building keyframed motion graphics, color-grading wheels, multicam, or a full audio mixer in the first version. Saying no to those is what keeps the core loop fast.

What It Actually Does (Feature List)
Fixing images
Circle, brush, box, or tap to select the problem area.
Type the fix in plain English. Get 2–4 corrected candidates back.
Before/after comparison, pick one, apply — original is never destroyed, every edit is reversible.
Fast-path fixes for the most common failures: hands, unreadable text/logos, object removal, keeping a specific face consistent with a reference.
Fixing video
Same selection tools, now scrubbing frame-by-frame on a timeline.
Mark the problem on one frame; the system finds where it starts and ends across the clip automatically (or the user sets the range manually) and tracks it through motion.
The fix applies across every frame in range without re-touching the rest of the clip — only the broken section ever gets reprocessed, not the whole video.
Preview just the repaired range before committing.
Generating video in chained segments (burst mode)
Generate long video as a sequence of short segments (3–10 seconds each), where every new segment picks up exactly where the last one visually left off — same character, same environment, no drift.
After each segment, a checkpoint: approve it, regenerate it, or fix a problem in the handoff frame before it becomes the seed for the next segment. This is the feature that stops small errors from compounding into a ruined 30-second video.
The system actively watches for a face or character starting to drift and flags it before the user even notices.
Keeping characters consistent
The system learns what a character/face looks like early in a project and checks new generations against that reference automatically, catching drift the user might not spot in the moment.
Exporting
One-click export to the exact spec each platform wants — TikTok, Instagram, YouTube, Facebook, X, LinkedIn, Pinterest, Snapchat, Rumble — correct dimensions, frame rate, loudness, and safe zones for captions/UI overlays, without the user memorizing any of it.
Smart reframing keeps the subject in frame when converting between aspect ratios.
Batch export to several platforms from one click.
Bring-your-own AI
Connect whatever image/video generation accounts you already use. The tool routes each job to whichever connected provider can actually do it, and falls back to another automatically if one fails or is down — the user never has to think about which model is "supposed" to do what.
Extensible by design
Custom brushes, new AI provider connections, and community-built panels can all plug into the app without touching the core product, so it can grow past what we build ourselves.

What Makes It Feel Premium, Not Janky
One thing stays visually consistent everywhere a fix is happening — a single accent color reserved only for AI-repair moments (masks, the healing state, the Fix Bar). Nothing else in the interface gets to use it. That restraint is what makes it read as intentional instead of busy.
A signature moment when a fix lands — a brief, subtle visual sweep across the repaired area. Everything else in the interface moves quickly and gets out of the way.
The natural-language Fix Bar is the single most important element on screen. It stays visible at all times. Everything else is arranged to support it, not compete with it.

Build Phases (the order this gets built in)
Foundations — the invisible plumbing: storage, job processing, the exact-math tools every later feature depends on. Nothing user-facing yet, but nothing works without it.
Image repair, end to end — the full core loop working for still images: select, describe, fix, export. This is the first version a real user could actually use.
Full editing toolkit — smart selection, crop/rotate/text, complete undo/redo, the full export preset library.
Video repair — the same repair loop, now working frame-by-frame across a clip.
Burst generation — chained short-segment generation with seam checkpoints and drift correction. This is the standout feature nobody else has shipped well.
Full social export — every platform preset, smart reframing, batch export, direct publishing where platforms allow it.
Ongoing — plugin marketplace, community extensions, performance polish.

Each phase has an exact technical checklist and a pass/fail exit test — that detail lives in the companion execution plan, not here. This document is the "what and why"; the execution plan is the "how." Read this one when a decision needs judgment; read that one when you're writing code.

Open Decisions Before Building Starts
These need real answers, not assumptions, before Phase 1 begins:

What does the current platform already run on (framework, database, storage, hosting)? Everything downstream assumes an answer here.
Which AI generation providers do we want connected first?
Do we run our own GPU hardware for the local AI tools, or launch fully on hosted APIs and add our own hardware later?
Web app only at launch, or does a desktop version need to exist too?
What's the actual team size and skill mix building this?
Do community plugins get sold, or is it free-install only at launch?
