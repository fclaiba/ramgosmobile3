# Pendientes Front-Back para llegar al 100%

## Objetivo

Cerrar el 30% restante para que la app quede 100% alineada front-back en producción Convex:

- Seguridad/identidad server-centric real.
- Wallet/points/rewards con backend como fuente de verdad.
- Carrito y contratos de dominio unificados end-to-end.

---

## Estado actual (estimado)

- Avance global: **70%**
- Restante para 100%: **30%**

### Desglose por módulo

- **Auth/KYC:** 80%
- **Marketplace/Orders:** 75%
- **Disputas/Chat:** 75%
- **Wallet/Points/Rewards:** 45%
- **Carrito:** 60%
- **Build/Env:** 90%

---

## Lo ya resuelto (cerrado)

- Checkout async corregido en `src/screens/marketplace/CheckoutScreen.tsx`.
- Contrato `confirmDelivery` agregado en `src/contexts/MarketplaceContext.tsx` y usado por `src/screens/marketplace/OrderDetailScreen.tsx`.
- Stubs críticos de auth reemplazados en `src/contexts/AuthContext.tsx`.
- KYC dejó de usar `mock_url_*` en `src/screens/KYCScreen.tsx`.
- Dependencia directa a `mockConvexStore` eliminada del ciclo principal de KYC en `src/contexts/FintechContext.tsx`.
- `NativeMap` agregado para cubrir imports en mapas.
- `typecheck` y build release verificados en iteración previa.

---

## Pendientes reales para 100% (el 30% que pesa)

## 1) Seguridad e identidad backend (prioridad máxima)

**Problema actual**
- Aún hay endpoints que validan por IDs enviados por cliente en vez de identidad de servidor.
- Esto no es auth server-centric completa.

**Cambios a hacer**
- Migrar autorización a identidad de servidor (`ctx.auth` / identidad verificable) en:
  - `convex/users.ts`
  - `convex/orders.ts`
  - `convex/disputes.ts`
  - `convex/cart.ts`
  - `convex/files.ts`
  - `convex/developer.ts`
- Sustituir validaciones de `actorId/userId` cliente por identidad derivada del token/sesión.
- Mantener solo controles de rol/ownership derivados del usuario autenticado.

**Criterio de aceptación**
- Ninguna operación sensible depende de IDs arbitrarios enviados por frontend.
- Test de acceso denegado pasa para intentos cruzados (otro usuario, otro seller, otro cart).

---

## 2) Wallet / Points / Rewards como backend source-of-truth

**Problema actual**
- `WalletContext`, `PointsContext` y `RewardsContext` conservan mucha lógica local/memoria.

**Cambios a hacer**
- Definir tablas/mutaciones Convex para:
  - balances
  - ledger de puntos
  - historial de recompensas/challenges
- Hacer que contexts lean/escriban en backend (no solo estado local).
- Asegurar idempotencia en operaciones de compra/canjeo.

**Criterio de aceptación**
- Reiniciar app no pierde estado financiero/recompensas.
- Saldo y puntos son consistentes entre sesiones/dispositivos.

---

## 3) Carrito y contratos de dominio unificados

**Problema actual**
- Existe backend de carrito (`convex/cart.ts`) pero estrategia aún híbrida.
- Contratos de dominio (order/dispute/escrow) todavía requieren consolidación total.

**Cambios a hacer**
- Elegir una estrategia definitiva de carrito:
  - Opción A: carrito backend (recomendada para multi-dispositivo)
  - Opción B: carrito local (aceptando limitaciones)
- Si backend: conectar `src/contexts/CartContext.tsx` a `api.cart.*`.
- Alinear estados y transiciones en:
  - `src/contexts/MarketplaceContext.tsx`
  - `convex/orders.ts`
  - `convex/disputes.ts`

**Criterio de aceptación**
- Un solo source-of-truth de carrito.
- Flujos order-dispute-escrow sin divergencias de estado entre front y back.

---

## 4) Cierre operativo y QA final de producción

**Problema actual**
- Build/env está casi cerrado, pero falta cierre formal con smoke completo sobre backend real.

**Cambios a hacer**
- Ejecutar smoke E2E obligatorio sobre producción:
  - login
  - listado
  - compra
  - disputa/chat
  - reseña
  - perfil
- Verificar rutas de soporte y comportamiento en escenarios sin secretos opcionales.
- Validar checklist de despliegue en:
  - `eas.json`
  - `.env.example`
  - `build-release.ps1`
  - `App.tsx`

**Criterio de aceptación**
- Smoke E2E aprobado.
- Build reproducible sin ambiguedad de backend.

---

## Plan de ejecución recomendado (solo restante)

1. **Fase A (Seguridad/Identidad):** cerrar auth server-centric en Convex.
2. **Fase B (Datos financieros):** backend source-of-truth para wallet/points/rewards.
3. **Fase C (Dominio):** unificar carrito + contratos order/dispute/escrow.
4. **Fase D (QA/Release):** smoke final y cierre operativo.

---

## Checklist final para declarar 100%

- [ ] Seguridad basada en identidad de servidor en endpoints críticos.
- [ ] Wallet/points/rewards persisten y sincronizan desde backend.
- [ ] Carrito definido y unificado en una sola estrategia.
- [ ] Contratos de order/dispute/escrow totalmente consistentes.
- [ ] Smoke E2E sobre backend de producción aprobado.
- [ ] Build/release reproducible validado.

