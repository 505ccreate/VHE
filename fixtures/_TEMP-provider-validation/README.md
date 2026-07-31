# TEMPORARY provider-validation fixtures — NOT the real §1 fixtures

These synthetic images exist only to validate that a real provider (OpenAI / Gemini) call
flows through §7 routing → §9.1 image inpaint end-to-end (auth, request, response, crop,
composite). They are hand-drawn stand-ins with a known defect region, **not** genuine
AI-hallucination artifacts.

They DO prove: the pipeline plumbing works against a live paid provider.
They do NOT prove: repair quality on real hallucinations. That still requires the owner's
frozen `bad_hand.png` / `garbled_text.png` (VHE-2 §1), which remain undelivered — so the
`pnpm preflight` FAIL 4 gate is intentionally left red. See VHE-ISSUE-LOG-0022 / 0009 / 0011.

Regenerate: `node scripts/make-temp-fixtures.ts`.
