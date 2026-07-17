#!/usr/bin/env python3
"""
Restore glass card contrast after all-views bg pass.
Keeps screen containers as brand atmosphere; elevates cards/surfaces.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [ROOT / "src" / "screens", ROOT / "src" / "components"]

PAGE = "isDark ? '#0B0A12' : '#F5F3FF'"
CARD = "isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)'"
SURFACE_CONST = re.compile(
    r"(const\s+surface\s*=\s*)isDark\s*\?\s*'#0B0A12'\s*:\s*'#F5F3FF'"
)
BG_PROP = re.compile(r"backgroundColor:\s*isDark\s*\?\s*'#0B0A12'\s*:\s*'#F5F3FF'")


def should_keep_page(context: str) -> bool:
    ctx = context.lower()
    keep_keys = (
        "container",
        "root",
        "screen",
        "wrapper",
        "safearea",
        "flex: 1, backgroundcolor",
        "flex:1, backgroundcolor",
    )
    return any(k in ctx for k in keep_keys)


def patch(text: str) -> str:
    text = SURFACE_CONST.sub(rf"\1{CARD}", text)

    out = []
    last = 0
    for m in BG_PROP.finditer(text):
        start = max(0, m.start() - 120)
        ctx = text[start:m.start()]
        out.append(text[last:m.start()])
        if should_keep_page(ctx):
            out.append(m.group(0))
        else:
            out.append(f"backgroundColor: {CARD}")
        last = m.end()
    out.append(text[last:])
    return "".join(out)


def main() -> int:
    n_files = 0
    for base in TARGETS:
        for path in base.rglob("*.tsx"):
            original = path.read_text(encoding="utf-8", errors="ignore")
            updated = patch(original)
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                n_files += 1
                print(path.relative_to(ROOT))
    print(f"Contrast fixed in {n_files} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
