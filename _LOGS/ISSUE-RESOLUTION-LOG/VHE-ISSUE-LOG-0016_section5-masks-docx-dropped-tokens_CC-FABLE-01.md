# VHE-ISSUE-LOG-0016  —  §5 mask format built; the .docx dropped compile-required tokens from its own §5 code (generics, template backticks, the opening <svg> tag)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0016 |
| **Date / time** | 2026-07-20 (EDT, post-midnight) |
| **Logged by** | `CC-FABLE-01` (Claude Fable 5) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §5 |
| **Category** | Blueprint defect (format loss) / Resolution / Build |
| **Status** | **RESOLVED** — §5 built, exit gate (IoU ≥ 0.99) passes; every reconstructed token listed for owner review |

---

## 1. What happened

Built VHE-2 §5 (mask schema + rasterize) in `packages/masks/masks.ts` and its exit-gate golden
test. Copying the §5 code verbatim from `word/document.xml` revealed that **the .docx dropped
tokens its own code requires to compile** — a stronger version of the paragraph-collapse loss in
VHE-ISSUE-LOG-0013. Verified directly against the raw XML (not just the lossy mirror). The
verbatim source, as stored, is not valid TypeScript.

## 2. The dropped tokens (each verified in the raw XML, each reconstructed)

Every reconstruction is forced unambiguously by the surrounding code and/or the §5 exit gate —
none is a design choice:

1. **`export type MaskObject = z.infer;`** → **`z.infer<typeof MaskObject>`**. The .docx stores
   bare `z.infer` with the generic gone. The only valid completion referencing the const schema
   above it is `<typeof MaskObject>` (standard zod idiom; const+type same-name is legal TS).
2. **`…): Promise {`** → **`Promise<Buffer>`**. The function's last line is
   `return img.png().toBuffer()`, whose type is `Promise<Buffer>`. The generic was dropped.
3. **`const px = ([x,y]) => ${x * W},${y * H};`** → backticks restored:
   **`` `${x * W},${y * H}` ``**. The `${…}` interpolation is inside a Word "VerbatimChar" run
   but the enclosing backticks are absent in the stored text; without them it is a syntax error,
   and its use (`s.points.map(px).join(' ')` to build SVG `points`) requires a string.
4. **The opening `<svg …>` root element.** The .docx stores `` const svg = `\n<rect …/>…</svg>` ``
   — a closing `</svg>` but **no opening tag**. Reconstructed as
   `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`. This is mandatory:
   `sharp(Buffer.from(svg))` cannot rasterize without a root SVG element carrying the W×H
   viewport, and the §5 exit gate ("rasterize at 1280×720 and 1920×1080") is untestable without
   it. The child shapes use absolute pixel coords (`x*W`, `y*H`), so width/height = W/H maps them
   1:1 (default viewBox = `0 0 width height`).

Also applied the routine VHE-ISSUE-LOG-0012 smart-quote mapping (§5 had 10×`"`, 10×`"` in string
literals like `z.literal("rect")`, `import … from "zod"`).

## 3. Why it matters

§5 is the substrate every gesture (rect/lasso/brush/smart-tap) compiles to, and rasterizeMask is
what turns a vector mask into the white-on-black pixel mask that §8 SAM prep, §9 inpaint, and
§9.4 detection all consume. A silently-wrong SVG viewport would scale every mask incorrectly at
non-native resolutions — exactly what the §5 IoU exit gate exists to catch. Because the source
was non-compiling, some reconstruction was unavoidable; the discipline is to reconstruct only
format-lost tokens, list them, and let the exit gate prove correctness.

## 4. Resolution

`packages/masks/masks.ts`: `NormPoint`, `MaskShape` (discriminated union rect/polygon/stroke/
points), `MaskObject` zod schema with defaults, and `rasterizeMask(m, W, H): Promise<Buffer>`.
Single-MaskObject rasterize unions all shapes to white on black. The multi-mask composition
described in §5 prose ("add composites with blend lighten, subtract with multiply") is **between**
MaskObjects and is not yet code — no section composes multiple masks yet, and the exit gate is a
single-object test. Flagged for whenever multi-mask compositing is first needed.

`points` shapes throw "must be resolved by SAM before rasterize" (verbatim) — §8 resolves them to
polygons first.

## 5. Verification (actually run — `vitest run`, fnm Node 22.23.1)

**Test Files 4 passed, Tests 16 passed** (5 §6 + 6 §3 + 3 §4 + 2 §5). The §5 assertions:
- Schema: a well-formed MaskObject parses and applies defaults (`mode='add'`, `featherPx=12`); a
  polygon point of `1.4` (outside normalized [0,1]) is **rejected** by `NormPoint`.
- **Exit gate:** a mask with rect+polygon+stroke shapes rasterized at 1280×720 and 1920×1080,
  the 1080p render downscaled to 720p, thresholded, IoU of the white regions **≥ 0.99**. Passed.
  (featherPx=0 for a crisp-boundary pure-geometry check.)

## 6. Affected files / components / tests / commits

- `packages/masks/masks.ts` (new), `packages/masks/masks.test.ts` (new).
- Consumers (future): §8 SAM prep, §9 inpaint/repair, §9.4 detection.

## 7. Prevention

- **The VHE .docx files lose compile-required tokens inside code blocks**, not just whitespace:
  generics (`<T>`), template backticks, and at least one whole opening tag. Any room copying a
  verbatim code block MUST compile/type-check it and reconstruct format-lost tokens deliberately,
  listing each — do not assume a clean paste. This is now the third distinct .docx corruption
  class logged (smart quotes 0012, paragraph-collapse 0013, dropped tokens 0016).
- The single-object-vs-multi-object mask composition split is a latent gap: the prose describes
  multi-mask compositing that has no code yet. First builder to compose two masks must implement
  it (lighten for add, multiply-after-negate for subtract) per the §5 prose.

## 8. Related entries

- `VHE-ISSUE-LOG-0012` — smart-quote mapping (also applied here).
- `VHE-ISSUE-LOG-0013` — paragraph-collapse loss; §6.1 defect. Same corruption family.
- `VHE-ISSUE-LOG-0003` — §17 Q2 provider ranking still open; gates §7, the next major section
  after §5 and the current build wall.
