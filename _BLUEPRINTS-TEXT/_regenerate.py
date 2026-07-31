#!/usr/bin/env python3
"""Regenerate the _BLUEPRINTS-TEXT/ mirror from the .docx blueprints in the project root.

Stdlib-only (works on any Python 3.8+, no pip installs). Run from anywhere:

    python _BLUEPRINTS-TEXT/_regenerate.py

Rules (from VHE-ISSUE-LOG-0004):
  - The .docx files are the AUTHORITATIVE source. This mirror is a lossy, read-optimized copy.
  - Verbatim code blocks MUST be copied from the original .docx, never from this mirror —
    extraction strips code-block boundaries, indentation, and table structure.
  - Rerun this script whenever ANY blueprint changes (especially VHE-5, which is still active).
    A stale mirror is worse than no mirror.
"""
import glob
import os
import re
import sys
import zipfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

HEADER = """\
> **MIRROR COPY — NOT THE SOURCE OF TRUTH.**
> Extracted from `{src}` on {stamp}.
> The .docx is authoritative. This extraction is LOSSY: code-block boundaries, indentation,
> and table structure are not preserved. Never copy "verbatim" code blocks from this file —
> open the original .docx for those. If this file looks out of date, rerun
> `python _BLUEPRINTS-TEXT/_regenerate.py` and check `VHE-ISSUE-LOG-0004` for context.

---

"""


def extract_docx_text(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab[^>]*/>", "\t", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    for ent, ch in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&apos;", "'")):
        xml = xml.replace(ent, ch)
    return re.sub(r"\n{3,}", "\n\n", xml).strip() + "\n"


def main():
    docs = sorted(glob.glob(os.path.join(ROOT, "VHE-*.docx")))
    if not docs:
        print("ERROR: no VHE-*.docx files found in", ROOT, file=sys.stderr)
        return 1
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")
    # Remove stale mirror files so renamed/deleted blueprints don't leave orphans behind.
    for old in glob.glob(os.path.join(HERE, "VHE-*.md")):
        os.remove(old)
    for src in docs:
        base = os.path.basename(src)
        out = os.path.join(HERE, os.path.splitext(base)[0] + ".md")
        text = extract_docx_text(src)
        with open(out, "w", encoding="utf-8") as f:
            f.write(HEADER.format(src=base, stamp=stamp))
            f.write(text)
        print(f"{base} -> {os.path.basename(out)} ({len(text):,} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
