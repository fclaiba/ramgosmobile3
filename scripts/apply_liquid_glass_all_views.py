#!/usr/bin/env python3
"""
Ramgos Liquid Glass — A→Z pass (largest → smallest) across ALL frontend views.

Layers (applied in order):
  A  App shell / navigator backgrounds
  B  Screen / root containers
  C  Sheets, modals, drawers, sidebars
  D  Cards, panels, list rows, sections
  E  Inputs, chips, badges, icon buttons (small chrome)
  F  Brand color fixes (iOS blue → Ramgos violet)
  G  Contrast restore (cards stay elevated vs page atmosphere)

Usage:
  py scripts/apply_liquid_glass_all_views.py
  py scripts/apply_liquid_glass_all_views.py --dry-run
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Entire frontend surface area
TARGETS = [
    ROOT / "App.tsx",
    ROOT / "src" / "screens",
    ROOT / "src" / "components",
    ROOT / "src" / "payments",
    ROOT / "src" / "contexts",
    ROOT / "src" / "hooks",
    ROOT / "src" / "utils",
    ROOT / "src" / "theme",
]

SKIP_DIRS = {
    "node_modules",
    "_generated",
    "graphify-out",
    "_archive",
    ".git",
    "dist",
    "build",
}

# Never self-mutate design tokens
SKIP_FILES = {
    "src/utils/glass.ts",
    "src/theme/brand.ts",
    "src/components/ui/GlassSurface.tsx",
    "src/components/ui/GlassScreen.tsx",
    "scripts/apply_liquid_glass_all_views.py",
}

# --- Brand glass palette ---
PAGE_DARK = "#0B0A12"
PAGE_LIGHT = "#F5F3FF"
CARD_DARK = "rgba(255,255,255,0.08)"
CARD_LIGHT = "rgba(255,255,255,0.78)"
CHIP_DARK = "rgba(255,255,255,0.10)"
CHIP_LIGHT = "rgba(255,255,255,0.85)"
BORDER_DARK = "rgba(255,255,255,0.12)"
BORDER_LIGHT = "rgba(33, 150, 243,0.14)"
BRAND = "#2196F3"

PAGE_TERNARY = f"isDark ? '{PAGE_DARK}' : '{PAGE_LIGHT}'"
CARD_TERNARY = f"isDark ? '{CARD_DARK}' : '{CARD_LIGHT}'"
CHIP_TERNARY = f"isDark ? '{CHIP_DARK}' : '{CHIP_LIGHT}'"

# A/B — page / shell ternaries (old grays → brand atmosphere)
RE_PAGE_TERNARY = re.compile(
    r"""isDark\s*\?\s*['"](#(?:0[Bb]0[Aa]12|0[Ff]172[Aa]|111827|09090[Bb]|0f172a|18181[Bb]|1[Aa]1[Aa]2[Ee]|020617))['"]\s*:\s*['"](#(?:[Ff]{3,8}|[Ff][Aa][Ff][Aa][Ff][Aa]|[Ff]9[Ff]9[Ff]9|[Ff]9[Ff][Aa][Ff][Bb]|[Ff]8[Ff][Aa][Ff][Cc]|[Ff]5[Ff]3[Ff][Ff]|f9f9f9|fafafa|f8fafc|ffffff))['"]""",
    re.I,
)

RE_CONST_BG = re.compile(
    r"""(const\s+(?:bg|background|pageBg|screenBg)\s*=\s*isDark\s*\?\s*)['"][^'"]+['"](\s*:\s*)['"][^'"]+['"]""",
    re.I,
)

# C — sheets / modals often use solid surfaces
RE_SHEET_SOLID = re.compile(
    r"""backgroundColor:\s*isDark\s*\?\s*['"]#(?:18181[Bb]|1[Ff]2937|111827)['"]\s*:\s*['"]#(?:fff|ffffff|[Ff][Ff][Ff][Ff][Ff][Ff])['"]""",
    re.I,
)

# D — cards / panels
RE_CARD_TERNARY = re.compile(
    r"""backgroundColor:\s*isDark\s*\?\s*['"]#(?:1[Ff]2937|27272[Aa]|374151|3[Ff]3[Ff]46)['"]\s*:\s*['"]#(?:fff|ffffff|[Ff]9[Ff][Aa][Ff][Bb]|[Ff]3[Ff]4[Ff]6|[Ee]5[Ee]7[Ee][Bb])['"]""",
    re.I,
)

# E — small chrome (chips / icon btn fills that are flat gray)
RE_CHIP_TERNARY = re.compile(
    r"""backgroundColor:\s*isDark\s*\?\s*['"]#(?:374151|4[Bb]5563|27272[Aa])['"]\s*:\s*['"]#(?:[Ee]5[Ee]7[Ee][Bb]|[Ff]3[Ff]4[Ff]6|[Dd]1[Dd]5[Dd][Bb])['"]""",
    re.I,
)

# Borders → glass hairlines (safe common pair)
RE_BORDER_TERNARY = re.compile(
    r"""border(?:Top|Bottom|Left|Right)?Color:\s*isDark\s*\?\s*['"]#(?:374151|27272[Aa]|4[Bb]5563)['"]\s*:\s*['"]#(?:[Ee]5[Ee]7[Ee][Bb]|[Ff]3[Ff]4[Ff]6|[Ff]0[Ff]0[Ff]0|[Dd]1[Dd]5[Dd][Bb])['"]""",
    re.I,
)

# F — brand
RE_IOS_BLUE = re.compile(r"#007AFF|#0A84FF", re.I)

# Soft leftovers from earlier pass
RE_SOFT_LIGHT = re.compile(
    r"""backgroundColor:\s*['"]rgba\(249,\s*250,\s*251,\s*0\.7\)['"]"""
)

# G — contrast: page-colored cards → elevated glass (skip containers)
RE_PAGE_AS_FILL = re.compile(
    r"""backgroundColor:\s*isDark\s*\?\s*'#0B0A12'\s*:\s*'#F5F3FF'"""
)

RE_SURFACE_CONST = re.compile(
    r"""(const\s+surface\s*=\s*)isDark\s*\?\s*'#0B0A12'\s*:\s*'#F5F3FF'"""
)


def _ctx_keep_page(ctx: str) -> bool:
    c = ctx.lower()
    keys = (
        "container",
        "root",
        "screen",
        "wrapper",
        "safearea",
        "contentstyle",
        "navigationcontainer",
        "flex: 1, backgroundcolor",
        "flex:1, backgroundcolor",
        "mydarktheme",
        "mylighttheme",
        "background:",
    )
    return any(k in c for k in keys)


def patch_text(text: str) -> tuple[str, dict[str, int]]:
    counts = {
        "A_page": 0,
        "B_const": 0,
        "C_sheet": 0,
        "D_card": 0,
        "E_chip": 0,
        "E_border": 0,
        "F_blue": 0,
        "G_contrast": 0,
        "soft": 0,
    }

    # A — page atmosphere
    def page_sub(m: re.Match[str]) -> str:
        counts["A_page"] += 1
        return PAGE_TERNARY

    text = RE_PAGE_TERNARY.sub(page_sub, text)

    # B — const bg =
    def const_sub(m: re.Match[str]) -> str:
        counts["B_const"] += 1
        return f"{m.group(1)}'{PAGE_DARK}'{m.group(2)}'{PAGE_LIGHT}'"

    text = RE_CONST_BG.sub(const_sub, text)

    # soft leftover
    def soft_sub(_: re.Match[str]) -> str:
        counts["soft"] += 1
        return f"backgroundColor: '{PAGE_LIGHT}'"

    text = RE_SOFT_LIGHT.sub(soft_sub, text)

    # C — sheets/modals
    def sheet_sub(_: re.Match[str]) -> str:
        counts["C_sheet"] += 1
        return f"backgroundColor: {CARD_TERNARY}"

    text = RE_SHEET_SOLID.sub(sheet_sub, text)

    # D — cards
    def card_sub(_: re.Match[str]) -> str:
        counts["D_card"] += 1
        return f"backgroundColor: {CARD_TERNARY}"

    text = RE_CARD_TERNARY.sub(card_sub, text)

    # E — chips / small fills
    def chip_sub(_: re.Match[str]) -> str:
        counts["E_chip"] += 1
        return f"backgroundColor: {CHIP_TERNARY}"

    text = RE_CHIP_TERNARY.sub(chip_sub, text)

    def border_sub(m: re.Match[str]) -> str:
        counts["E_border"] += 1
        prop = m.group(0).split(":")[0]
        return f"{prop}: isDark ? '{BORDER_DARK}' : '{BORDER_LIGHT}'"

    text = RE_BORDER_TERNARY.sub(border_sub, text)

    # F — brand blue
    text, n = RE_IOS_BLUE.subn(BRAND, text)
    counts["F_blue"] = n

    # G — surface const
    text, n_surf = RE_SURFACE_CONST.subn(rf"\1{CARD_TERNARY}", text)
    counts["G_contrast"] += n_surf

    # G — page-colored fills that aren't containers → card glass
    out: list[str] = []
    last = 0
    for m in RE_PAGE_AS_FILL.finditer(text):
        start = max(0, m.start() - 140)
        ctx = text[start : m.start()]
        out.append(text[last : m.start()])
        if _ctx_keep_page(ctx):
            out.append(m.group(0))
        else:
            counts["G_contrast"] += 1
            out.append(f"backgroundColor: {CARD_TERNARY}")
        last = m.end()
    out.append(text[last:])
    text = "".join(out)

    return text, counts


def iter_files():
    for entry in TARGETS:
        if entry.is_file():
            rel = entry.relative_to(ROOT).as_posix()
            if rel not in SKIP_FILES:
                yield entry
            continue
        if not entry.is_dir():
            continue
        for p in entry.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            if p.name.endswith(".d.ts"):
                continue
            rel = p.relative_to(ROOT).as_posix()
            if rel in SKIP_FILES:
                continue
            yield p


def main() -> int:
    ap = argparse.ArgumentParser(description="Liquid Glass A→Z for all Ramgos views")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    keys = ["A_page", "B_const", "C_sheet", "D_card", "E_chip", "E_border", "F_blue", "G_contrast", "soft"]
    total = {k: 0 for k in keys}
    changed = 0
    files = list(iter_files())

    print(f"Scanning {len(files)} frontend files (A->Z liquid glass)...\n")

    for path in sorted(files, key=lambda p: str(p)):
        original = path.read_text(encoding="utf-8", errors="ignore")
        updated, counts = patch_text(original)
        if updated == original:
            continue
        if sum(counts.values()) == 0:
            continue
        changed += 1
        for k, v in counts.items():
            total[k] += v
        rel = path.relative_to(ROOT)
        hit = {k: v for k, v in counts.items() if v}
        prefix = "[dry] " if args.dry_run else ""
        print(f"{prefix}{rel}  {hit}")
        if not args.dry_run:
            path.write_text(updated, encoding="utf-8")

    print("\n========== A->Z SUMMARY ==========")
    print(f"A  Page/shell backgrounds : {total['A_page']}")
    print(f"B  const bg variables     : {total['B_const']}")
    print(f"C  Sheets/modals          : {total['C_sheet']}")
    print(f"D  Cards/panels           : {total['D_card']}")
    print(f"E  Chips/small fills      : {total['E_chip']}")
    print(f"E  Borders (glass)        : {total['E_border']}")
    print(f"F  Brand blue->violet     : {total['F_blue']}")
    print(f"G  Contrast restore       : {total['G_contrast']}")
    print(f"   Soft leftovers         : {total['soft']}")
    print(f"Files changed             : {changed}")
    print(f"Page atmosphere           : dark {PAGE_DARK} / light {PAGE_LIGHT}")
    print(f"Card glass                : {CARD_DARK} / {CARD_LIGHT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
