# Ramgos Design System

**Direction:** refined utilitarian marketplace (scan-first, daily use).  
**Memorable detail:** Liquid Glass on chrome (nav / headers / sheets) with Ramgos violet accents — never purple wallpaper.

## Why this direction

Ramgos is a marketplace + escrow + rewards product. Users need to scan listings, orders, and balances quickly. A lilac full-page wash reads as generic AI UI and fights content. Neutral zinc canvas + violet brand chrome elevates UX without losing identity.

## Anti-slop rules

- No purple/lilac page backgrounds (`#F5F3FF` wallpaper banned).
- No glass on every surface — glass = interactive chrome + elevated panels only.
- No nested cards-in-cards.
- Brand violet (`#7C3AED`) for CTAs, active nav, links, focus — not fills for everything.

## Tokens

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `bg` | `#FAFAFA` | `#09090B` | Screen canvas |
| `bgElevated` | `#FFFFFF` | `#18181B` | Solid elevated |
| `glass` | `rgba(255,255,255,0.72)` | `rgba(255,255,255,0.07)` | Cards / panels |
| `primary` | `#7C3AED` | `#7C3AED` | Brand CTA / active |
| `text` | `#18181B` | `#FAFAFA` | Body |
| `textMuted` | `#71717A` | `#A1A1AA` | Secondary |

Source of truth: `src/theme/tokens.ts` + `src/theme/brand.ts` + `design-tokens.json`.

## Spacing & radius

- Space scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48
- Radius: sm 10 · md 14 · lg 18 · xl 22 · 2xl 28 · full pill
- Touch targets ≥ 44px

## Liquid Glass usage

| Surface | Glass? | Notes |
|---------|--------|-------|
| Bottom nav / MobileHeader | Yes | `ChromeGlass`: blur + frost 72% + specular rim (no purple wash) |
| Sheets / escrow / filters | Yes | Slide-up glass |
| Marketplace/list cards | Soft glass | Translucent, not purple |
| Page background | No | Neutral atmosphere only |
| Primary CTA | Solid brand | `.glass` variant for secondary |

## Typography

- Display / Heading / Title / Body / BodySm / Caption (`src/theme/tokens.ts` → `Type`)
- Prefer weight + letter-spacing over oversized heroes in tools

## Implementation

```tsx
import { colors, atmosphere, Radius, Space } from '../theme/tokens';
import { GlassSurface } from '../components/ui/GlassSurface';
import { GlassScreen } from '../components/ui/GlassScreen';
```

Migrate views with:

```bash
py scripts/apply_design_system.py
```

## Preview

Open `design-preview.html` in a browser for token QA.
