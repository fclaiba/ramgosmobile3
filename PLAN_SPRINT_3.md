# PLAN_SPRINT_3 — Puntos/Bonos + Perfil + Admin Ops

## Objetivo
Que el usuario entienda puntos y referidos, y que el admin vea nuevos registros.

## Scope (qué se hace)
- Puntos:
  - En `PointsManager`: agregar módulo “Cómo funciona” (reglas simples, conversión, fuentes, tiers).
- Bonos/Checkout:
  - Mostrar preview “Ganás X puntos con esta compra” (sin mutar puntos).
  - Aclarar puntos por compra/bono donde aplique.
- Perfil:
  - Historial de puntos (transactions) + cuadro de referidos (summary).
- Admin:
  - Tabla de “Nuevos registros (sign ups)” (email/fecha/rol/estado verificación/KYC si aplica).
  - Si el backend es mock: usar `mockConvexStore` como fuente.

## Archivos candidatos
- `src/components/PointsManager.tsx`
- `src/contexts/PointsContext.tsx` (agregar helper de preview si hace falta)
- `src/screens/marketplace/CheckoutScreen.tsx`
- `src/screens/PaymentScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/AdminDashboardScreen.tsx`
- `src/services/auth/mockConvexStore.ts` (si se necesita exponer “recent signups”)

## Definition of Done (DoD)
- Existe sección clara “Cómo funciona” en Puntos.
- Checkout/Payment muestran “puntos a ganar” antes de confirmar.
- Perfil muestra historial de puntos + resumen de referidos.
- Admin ve una lista real (mock o backend) de nuevos registros.

---

## Context Engineering (Sprint 3)
- Preview de puntos NO debe llamar `trackPurchase` (eso otorga puntos). Debe ser cálculo puro.
- UI con safe-area; listas con performance (FlatList si corresponde).
- Admin: evitar mocks hardcode en UI si existe store disponible.

---

## Prompt Engineering (Sprint 3) — Copiar/pegar en Cursor Chat
@PLAN_MAESTRO.md @PLAN_SPRINT_3.md @Codebase

Hola. Ejecutá Sprint 3 completo.
Implementá:
- “Cómo funciona” en PointsManager
- Preview de puntos a ganar en checkout/pago (cálculo puro)
- Perfil: historial de puntos + cuadro referidos
- Admin: tabla de nuevos registros

Reglas:
- No romper typecheck.
- No mutar puntos en preview.
- Reusar datos de contexts/stores existentes.

Entregables:
- Código aplicado.
- Captura de “qué ve el usuario” por pantalla (descripción).
- Checklist DoD completo.

