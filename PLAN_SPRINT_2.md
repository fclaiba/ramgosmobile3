# PLAN_SPRINT_2 — Unified Access Layer (Gating) + Certificación por acción

## Objetivo
Implementar el “middleware lógico”: bloquear acciones sensibles según estado, sin duplicar sesión.

## Scope (qué se hace)
- Crear `useActionGate` (hook único).
- Aplicar gating:
  - Checkout/pago: si `anonymous`, pedir login/registro.
  - Vender/publicar/retirar: si `pending_verification`, bloquear y llevar a verificación.
  - Si está verificado pero sin KYC: llevar a KYC.
- Ajustar puntos de entrada:
  - Checkout flow (ej: botones que llevan a `CheckoutScreen` / `PaymentScreen`).
  - Publicación/listing (ej: `CreateListingScreen` u otros accesos).
  - Wallet/retiros (business/influencer).

## Archivos candidatos
- Nuevo: `src/hooks/useActionGate.ts` (o `src/utils/useActionGate.ts`)
- `src/screens/marketplace/CheckoutScreen.tsx`
- `src/screens/PaymentScreen.tsx`
- `src/screens/CreateListingScreen.tsx`
- `src/screens/marketplace/SellerWalletScreen.tsx`
- `src/screens/BusinessDashboardScreen.tsx`
- `src/contexts/AuthContext.tsx` (solo si hace falta exponer helpers/flags; NO crear otro context)

## Definition of Done (DoD)
- Anonymous: puede armar carrito pero al intentar pagar, se le pide login (no rompe UI).
- Pending: puede comprar, pero no puede vender/publicar/retirar (mensaje claro + CTA).
- Authenticated sin KYC: se bloquea vender/publicar/retirar con CTA a KYC.
- No se duplicó sesión en otro context.

---

## Context Engineering (Sprint 2)
- `AuthContext` sigue siendo el source of truth.
- `useActionGate` no debe navegar “por sorpresa” sin mostrar feedback: usar Toast + navegación explícita.
- Los bloqueos deben ser consistentes en toda la app (no solo en 1 pantalla).

---

## Prompt Engineering (Sprint 2) — Copiar/pegar en Cursor Chat
@PLAN_MAESTRO.md @PLAN_SPRINT_2.md @Codebase

Hola. Ejecutá Sprint 2 completo.
Implementá un hook central `useActionGate` y aplicalo en los entrypoints de:
- checkout/pago (anonymous => login)
- vender/publicar/retirar (pending => verification; sin KYC => KYC)

Reglas:
- No crees nuevos contexts de sesión.
- Dejá mensajes claros (Toast) y CTA a la pantalla correcta.

Entregables:
- Código aplicado.
- Tabla: Feature -> Estado -> Resultado esperado (anonymous/pending/authenticated).
- Checklist DoD con evidencia de flujo.

