#!/usr/bin/env python3
"""
Apply Ramgos Design System v2 across ALL frontend views.

Fixes AI purple-wash from prior pass:
  page #F5F3FF / #0B0A12  ->  neutral #FAFAFA / #09090B
Keeps brand violet for accents only.
Elevates cards to glass fills; borders to hairline tokens.

Usage:
  py scripts/apply_design_system.py
  py scripts/apply_design_system.py --dry-run
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "App.tsx",
    ROOT / "src" / "screens",
    ROOT / "src" / "components",
    ROOT / "src" / "payments",
]
SKIP_DIRS = {"node_modules", "_generated", "graphify-out", "_archive", ".git"}
SKIP_FILES = {
    "src/theme/tokens.ts",
    "src/theme/brand.ts",
    "src/utils/glass.ts",
    "src/components/ui/GlassSurface.tsx",
    "src/components/ui/GlassScreen.tsx",
}

PAGE_DARK = "#09090B"
PAGE_LIGHT = "#FAFAFA"
CARD_DARK = "rgba(255,255,255,0.07)"
CARD_LIGHT = "rgba(255,255,255,0.72)"
BORDER_DARK = "rgba(255,255,255,0.10)"
BORDER_LIGHT = "rgba(0,0,0,0.08)"

# Purple wash / old night -> neutral canvas
RE_PURPLE_LIGHT = re.compile(r"#F5F3FF", re.I)
RE_OLD_NIGHT = re.compile(r"#0B0A12", re.I)

# Ternary page leftovers still using purple/old night
RE_PAGE_TERNARY = re.compile(
    r"""isDark\s*\?\s*['"]#(?:09090[Bb]|0[Bb]0[Aa]12|111827|0[Ff]172[Aa])['"]\s*:\s*['"]#(?:[Ff][Aa][Ff][Aa][Ff][Aa]|[Ff]5[Ff]3[Ff][Ff]|[Ff]9[Ff][Aa][Ff][Bb])['"]""",
    re.I,
)

RE_CONST_BG = re.compile(
    r"""(const\s+(?:bg|background|pageBg|screenBg)\s*=\s*isDark\s*\?\s*)['"][^'"]+['"](\s*:\s*)['"][^'"]+['"]""",
    re.I,
)

RE_CARD_SOLID = re.compile(
    r"""backgroundColor:\s*isDark\s*\?\s*['"]#(?:1[Ff]2937|27272[Aa]|18181[Bb]|374151)['"]\s*:\s*['"]#(?:fff|ffffff|[Ff][Ff][Ff][Ff][Ff][Ff]|[Ff]9[Ff][Aa][Ff][Bb])['"]""",
    re.I,
)

RE_BORDER = re.compile(
    r"""border(?:Top|Bottom|Left|Right)?Color:\s*isDark\s*\?\s*['"]#(?:374151|27272[Aa]|4[Bb]5563)['"]\s*:\s*['"]#(?:[Ee]5[Ee]7[Ee][Bb]|[Ff]3[Ff]4[Ff]6|[Dd]1[Dd]5[Dd][Bb]|[Ff]0[Ff]0[Ff]0)['"]""",
    re.I,
)

RE_IOS = re.compile(r"#007AFF|#0A84FF", re.I)


def patch(text: str) -> tuple[str, dict[str, int]]:
    c = {
        "purple_wash": 0,
        "night": 0,
        "page_ternary": 0,
        "const_bg": 0,
        "card": 0,
        "border": 0,
        "blue": 0,
    }

    text, n = RE_PURPLE_LIGHT.subn(PAGE_LIGHT, text)
    c["purple_wash"] = n
    text, n = RE_OLD_NIGHT.subn(PAGE_DARK, text)
    c["night"] = n

    def page_sub(_: re.Match) -> str:
        c["page_ternary"] += 1
        return f"isDark ? '{PAGE_DARK}' : '{PAGE_LIGHT}'"

    text = RE_PAGE_TERNARY.sub(page_sub, text)

    def const_sub(m: re.Match) -> str:
        c["const_bg"] += 1
        return f"{m.group(1)}'{PAGE_DARK}'{m.group(2)}'{PAGE_LIGHT}'"

    text = RE_CONST_BG.sub(const_sub, text)

    def card_sub(_: re.Match) -> str:
        c["card"] += 1
        return f"backgroundColor: isDark ? '{CARD_DARK}' : '{CARD_LIGHT}'"

    text = RE_CARD_SOLID.sub(card_sub, text)

    def border_sub(m: re.Match) -> str:
        c["border"] += 1
        prop = m.group(0).split(":")[0]
        return f"{prop}: isDark ? '{BORDER_DARK}' : '{BORDER_LIGHT}'"

    text = RE_BORDER.sub(border_sub, text)

    text, n = RE_IOS.subn("#2196F3", text)
    c["blue"] = n
    return text, c


def iter_files():
    for entry in TARGETS:
        if entry.is_file():
            yield entry
            continue
        if not entry.is_dir():
            continue
        for p in entry.rglob("*"):
            if not p.is_file() or p.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
                continue
            if any(x in p.parts for x in SKIP_DIRS):
                continue
            if p.name.endswith(".d.ts"):
                continue
            rel = p.relative_to(ROOT).as_posix()
            if rel in SKIP_FILES:
                continue
            yield p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = list(iter_files())
    totals = {k: 0 for k in ("purple_wash", "night", "page_ternary", "const_bg", "card", "border", "blue")}
    changed = 0
    print(f"Design System v2 — scanning {len(files)} files...\n")

    for path in sorted(files, key=str):
        original = path.read_text(encoding="utf-8", errors="ignore")
        updated, counts = patch(original)
        if updated == original:
            continue
        changed += 1
        for k, v in counts.items():
            totals[k] += v
        hit = {k: v for k, v in counts.items() if v}
        print(f"{'[dry] ' if args.dry_run else ''}{path.relative_to(ROOT)}  {hit}")
        if not args.dry_run:
            path.write_text(updated, encoding="utf-8")

    print("\n========== DESIGN SYSTEM v2 ==========")
    for k, v in totals.items():
        print(f"{k:16} {v}")
    print(f"files_changed    {changed}")
    print(f"canvas           dark {PAGE_DARK} / light {PAGE_LIGHT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
