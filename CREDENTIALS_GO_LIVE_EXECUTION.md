# Credentials Go-Live Execution

Fecha: `2026-03-30`

## Sprint 1 - Núcleo productivo (Convex + Stripe)

Estado: `COMPLETADO (LISTO PARA CARGA DE CREDENCIALES)`

### Implementado
- `App.tsx` ahora exige `EXPO_PUBLIC_STRIPE_KEY` en builds no-dev.
- `eas.json` incluye `EXPO_PUBLIC_STRIPE_KEY` por perfil (`development`, `preview`, `production`).
- `.env.example` documenta:
  - `EXPO_PUBLIC_STRIPE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `ALLOW_STRIPE_MOCK`
- `convex/stripe.ts` endurecido:
  - falla explícita si falta `STRIPE_SECRET_KEY` y no está habilitado mock de desarrollo.
- `convex/http.ts` endurecido:
  - webhook Stripe devuelve `503` si faltan secretos y no está habilitado mock.
- `src/screens/marketplace/CheckoutScreen.tsx`:
  - agrega guard para evitar intento de cobro si acción Stripe no está disponible.

### Evidencia
- `npm run typecheck` -> `PASS`

### Bloqueo externo
- `npx convex codegen` no pudo ejecutarse por permisos de proyecto Convex en este entorno local.

## Sprint 2 - Operación financiera

Estado: `COMPLETADO (RUNBOOK + MATRIZ DE VALIDACIÓN)`

### Implementado
- Se agregó `FINANCIAL_OPERATIONS_VALIDATION.md` con matriz de pruebas de:
  - cobro,
  - liberación,
  - reembolso,
  - disputa,
  - splits y retiros.

## Sprint 3 - Release técnico móvil

Estado: `COMPLETADO (CHECKLIST DE CREDENCIALES Y RELEASE)`

### Implementado
- Se agregó `CREDENTIALS_HANDOFF_CHECKLIST.md` con bloques de credenciales por sprint:
  - Convex/Stripe,
  - comisiones/payouts,
  - Android/iOS stores.

## Sprint 4 - Closed beta operativa

Estado: `COMPLETADO (RUNBOOK OPERATIVO)`

### Implementado
- Se agregó `CLOSED_BETA_GO_LIVE_RUNBOOK.md` con:
  - smoke 6/6,
  - monitoreo 72h,
  - reglas de contención,
  - cierre formal GO/NO-GO.
