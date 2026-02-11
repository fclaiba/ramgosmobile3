# Game Contract + Theme Tokens (Parte 0)

**Scope**: este contrato está pensado para conectar los 6 juegos (`src/components/games/*.tsx`) a un wrapper común en `src/components/pet/MiMascotaView.tsx`.  
**Nota**: aquí no hay refactors; solo contrato/tipos/tokens/documentación.

## Contrato mínimo (Game Adapter)

El contrato vive en:
- `src/components/games/gameContracts.ts`

### Estados estándar (wrapper)
- `start | playing | paused | gameover | levelup`

### Métricas estándar (HUD)
- `score`, `level`, `progressToNext`, `lives` (**siempre**), `ammo` (**solo** Duck Hunt)

### Acciones estándar (wrapper → juego)
- `start`, `pause`, `resume`, `restart`

### Eventos estándar (juego → wrapper)
Ver `GameEvent`:
- `status`, `metrics`, `levelup`, `gameover`, `currencyDelta`

## Mapeo recomendado (estado actual → estándar)

Este mapeo permite migrar juego por juego sin romper UX:

### Dino (`DinoGame.tsx`)
- `IDLE` → `start`
- `PLAYING` → `playing`
- `GAMEOVER` → `gameover`

### Duck (`DuckHunt.tsx`)
- `IDLE` → `start`
- `PLAYING` → `playing`
- `GAMEOVER` → `gameover`
- **ammo**: reportar `metrics.ammo`

### Fruit (`FruitCatcher.tsx`)
- `IDLE` → `start`
- `PLAYING` → `playing`
- `GAMEOVER` → `gameover`
- **lives**: ya existe (3)

### Memory (`MemoryGame.tsx`)
- `IDLE` → `start`
- `PREVIEW` → `start` (overlay/preview)
- `PLAYING` → `playing`
- `LEVEL_COMPLETE` → `levelup`
- `GAMEOVER` → `gameover`

### Roulette (`RouletteGame.tsx`) y Slots (`SlotMachine.tsx`)
- `start`: pantalla con CTA “GIRAR”
- `playing`: animación/spin activo
- `gameover`: no aplica como “muerte”, pero el wrapper puede usar `gameover` para “round end” si quiere uniformidad; alternativamente usar `status` + `currencyDelta` y mantener `playing/start`.
- **currencyDelta**: usar `GameEvent` / `GameEndSummary.currencyDelta`

## Theme Tokens

### Objetivo
Consolidar estilo visual sin imponer un refactor masivo:
- `Arcade` vs `Casino`
- Overrides por juego (Fruit/Duck/Memory/Dino/Roulette/Slots)

### Naming consistente (resumen)
Los tokens están en `GAME_THEMES`:
- `colors`: `bg`, `surface`, `surface2`, `text`, `textMuted`, `border`, `accent`, `accent2`, `success`, `warning`, `danger`, `hudBg`, `hudText`, `hudBorder`
- `gradients`: `bg`, `cta`, `hud`
- `typography`: `display`, `title`, `hud`, `body`
- `spacing`: `xs|sm|md|lg|xl|2xl`
- `radius`: `sm|md|lg|xl|pill`
- `shadows`: `elev1|elev2`

### Regla práctica
- El wrapper (y luego cada juego) debería **consumir tokens semánticos** (ej. `colors.accent`) y evitar colores hardcodeados en UI/HUD.

