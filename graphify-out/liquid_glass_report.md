# Liquid Glass migration report
- Files scanned: 210
- Glass-aware: 31
- Actionable: 0

## Brand
Keep `#7C3AED` / `#8B5CF6`. Replace `#007AFF`.

## How to adopt
```tsx
import { GlassSurface } from '../components/ui/GlassSurface';
<GlassSurface intensity="regular">{...}</GlassSurface>
```

## Offenders
