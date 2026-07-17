#!/usr/bin/env python3
"""
apply_liquid_glass.py — elevate Ramgos RN frontend toward Liquid Glass + brand.

Brand (kept): #7C3AED / #8B5CF6 / #6D28D9
Design ref: .agents/skills/liquid-glass-design (blur, tint, interactive glass)

Usage:
  py scripts/apply_liquid_glass.py              # audit only
  py scripts/apply_liquid_glass.py --apply      # safe brand + glass replacements
  py scripts/apply_liquid_glass.py --apply --write-report

ponytail: does NOT rewrite whole screens. Patches shared anti-patterns and
reports remaining opaque cards for manual GlassSurface adoption.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [ROOT / "src", ROOT / "App.tsx"]
SKIP_PARTS = {"node_modules", ".git", "graphify-out", "_archive", "dist", "build"}
# Never mutate the design-system sources themselves
SKIP_FILES = {
    "src/utils/glass.ts",
    "src/theme/brand.ts",
    "src/components/ui/GlassSurface.tsx",
}

# iOS system blue → Ramgos violet
BRAND_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"#007AFF", re.I), "#7C3AED"),
    (re.compile(r"#0A84FF", re.I), "#8B5CF6"),
    (re.compile(r"rgb\(\s*0\s*,\s*122\s*,\s*255\s*\)", re.I), "rgb(124, 58, 237)"),
]

# Opaque flat surfaces that fight Liquid Glass (report + optional soft replace)
OPAQUE_CARD_RE = re.compile(
    r"backgroundColor:\s*['\"]#(fff|ffffff|1F2937|27272A|18181B|F9FAFB)['\"]",
    re.I,
)
GLASS_HINT_RE = re.compile(r"glassTokens|GlassSurface|glassSurface|BlurView")
HARD_BLUE_RE = re.compile(r"#007AFF|#0A84FF", re.I)

SOFT_OPAQUE_MAP = {
    "#fff": "rgba(255,255,255,0.62)",
    "#ffffff": "rgba(255,255,255,0.62)",
    "#F9FAFB": "rgba(249,250,251,0.7)",
    "#1F2937": "rgba(31,41,55,0.72)",
    "#27272A": "rgba(39,39,42,0.72)",
    "#18181B": "rgba(24,24,27,0.78)",
}


@dataclass
class FileHit:
    path: Path
    brand_hits: int = 0
    opaque_hits: int = 0
    has_glass: bool = False
    notes: list[str] = field(default_factory=list)


def iter_frontend_files() -> list[Path]:
    files: list[Path] = []
    for entry in SCAN_DIRS:
        if entry.is_file() and entry.suffix in {".tsx", ".ts", ".jsx", ".js"}:
            files.append(entry)
            continue
        if not entry.is_dir():
            continue
        for p in entry.rglob("*"):
            if not p.is_file():
                continue
            if any(part in SKIP_PARTS for part in p.parts):
                continue
            if p.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
                continue
            # ponytail: skip generated / heavy vendor
            if "_generated" in p.parts:
                continue
            rel = p.relative_to(ROOT).as_posix()
            if rel in SKIP_FILES:
                continue
            files.append(p)
    return sorted(files)


def audit_file(path: Path) -> FileHit:
    text = path.read_text(encoding="utf-8", errors="ignore")
    hit = FileHit(path=path)
    hit.brand_hits = len(HARD_BLUE_RE.findall(text))
    hit.opaque_hits = len(OPAQUE_CARD_RE.findall(text))
    hit.has_glass = bool(GLASS_HINT_RE.search(text))
    if hit.brand_hits:
        hit.notes.append(f"{hit.brand_hits} iOS-blue color(s)")
    if hit.opaque_hits and not hit.has_glass:
        hit.notes.append(f"{hit.opaque_hits} opaque surface(s), no glass yet")
    return hit


def apply_brand(text: str) -> tuple[str, int]:
    n = 0
    out = text
    for pat, repl in BRAND_REPLACEMENTS:
        out, c = pat.subn(repl, out)
        n += c
    return out, n


def apply_soft_opaque(text: str) -> tuple[str, int]:
    """Replace common opaque StyleSheet fills with translucent glass fills."""
    n = 0

    def _sub(m: re.Match[str]) -> str:
        nonlocal n
        raw = m.group(0)
        color = m.group(1)
        key = f"#{color}"
        # normalize
        for k, v in SOFT_OPAQUE_MAP.items():
            if key.lower() == k.lower() or f"#{color.upper()}" == k.upper():
                n += 1
                quote = "'" if "'" in raw[:20] else '"'
                return f"backgroundColor: {quote}{v}{quote}"
        return raw

    # rebuild with case-insensitive map lookup
    def replacer(m: re.Match[str]) -> str:
        nonlocal n
        color = m.group(1)
        mapped = None
        for k, v in SOFT_OPAQUE_MAP.items():
            if k.lower() == f"#{color.lower()}":
                mapped = v
                break
        if not mapped:
            return m.group(0)
        n += 1
        q = "'" if "'" in m.group(0) else '"'
        return f"backgroundColor: {q}{mapped}{q}"

    out = OPAQUE_CARD_RE.sub(replacer, text)
    return out, n


def main() -> int:
    ap = argparse.ArgumentParser(description="Ramgos Liquid Glass frontend elevator")
    ap.add_argument("--apply", action="store_true", help="Apply safe brand + soft opaque patches")
    ap.add_argument("--soft-opaque", action="store_true", help="Also soften opaque card fills (with --apply)")
    ap.add_argument("--write-report", action="store_true", help="Write graphify-out/liquid_glass_report.md")
    args = ap.parse_args()

    files = iter_frontend_files()
    hits = [audit_file(p) for p in files]
    actionable = [h for h in hits if h.brand_hits or (h.opaque_hits and not h.has_glass)]

    print(f"Scanned {len(files)} frontend files")
    print(f"Need attention: {len(actionable)}")
    print(f"Already glass-aware: {sum(1 for h in hits if h.has_glass)}")

    changed_files = 0
    brand_total = 0
    opaque_total = 0

    if args.apply:
        for h in hits:
            text = h.path.read_text(encoding="utf-8", errors="ignore")
            original = text
            text, bn = apply_brand(text)
            brand_total += bn
            on = 0
            if args.soft_opaque:
                text, on = apply_soft_opaque(text)
                opaque_total += on
            if text != original:
                h.path.write_text(text, encoding="utf-8")
                changed_files += 1
                print(f"  patched {h.path.relative_to(ROOT)}")
        print(f"\nApplied: {changed_files} files · brand={brand_total} · soft_opaque={opaque_total}")
        print("Shared primitives already elevated: GlassSurface, Card, Button, Sheet")
    else:
        print("\nTop offenders (audit):")
        for h in sorted(actionable, key=lambda x: -(x.brand_hits + x.opaque_hits))[:25]:
            rel = h.path.relative_to(ROOT)
            print(f"  {rel}: {', '.join(h.notes) or 'ok'}")
        print("\nRun with --apply to patch iOS blue -> Ramgos violet.")
        print("Add --soft-opaque to translucent-ize common opaque fills.")

    if args.write_report:
        out = ROOT / "graphify-out" / "liquid_glass_report.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Liquid Glass migration report\n",
            f"- Files scanned: {len(files)}\n",
            f"- Glass-aware: {sum(1 for h in hits if h.has_glass)}\n",
            f"- Actionable: {len(actionable)}\n",
            "\n## Brand\nKeep `#7C3AED` / `#8B5CF6`. Replace `#007AFF`.\n",
            "\n## How to adopt\n",
            "```tsx\nimport { GlassSurface } from '../components/ui/GlassSurface';\n",
            "<GlassSurface intensity=\"regular\">{...}</GlassSurface>\n```\n",
            "\n## Offenders\n",
        ]
        for h in sorted(actionable, key=lambda x: str(x.path)):
            lines.append(f"- `{h.path.relative_to(ROOT)}` — {', '.join(h.notes)}\n")
        out.write_text("".join(lines), encoding="utf-8")
        print(f"Report -> {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
