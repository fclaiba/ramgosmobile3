# Plan Estratégico Integral Maestro — Ramgos Mobile

> **Versión:** 1.10 · **Última actualización plan:** 2026-08-20 · **Grafo:** 4641 nodos · 9192 edges · 422 comunidades (desactualizado — falta `graphify update` post-sesión)  
> **Fase activa:** Ranking dual Feed/Loops (RS-RANK) — código listo y deployado a dev ✅, QA runtime 🔴 sin ejecutar (mismo bloqueante de herramientas de navegador que E-083), prod pendiente de deploy (ver §15.4, E-085/E-086). Bloqueantes previos sin cambios: `pointsUnification` en prod y el hallazgo de ledger de E-082 siguen pendientes de que el usuario actúe  
> **Estado general:** Fases 1–2, 6–8 y SEC-1 cerradas · Fases 3–5 código listo (QA manual §12.4 + tarea final Fase 5 pendientes) · RS-1 a RS-10 código listo, dev migrado y verificado, runtime todavía sin recorrer · RS-RANK (ranking dual) código listo en dev, mismo pendiente de QA runtime  
> **Objetivo:** Llevar Ramgos de MVP con deuda de seguridad → **production-ready** → pentest → launch NY (pagos live).

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Estado actual del proyecto](#2-estado-actual-del-proyecto)
3. [Graphify — protocolo obligatorio](#3-graphify--protocolo-obligatorio)
4. [Conceptos clave (backend vs contextos)](#4-conceptos-clave-backend-vs-contextos)
5. [Arquitectura objetivo](#5-arquitectura-objetivo)
6. [BLOQUE A — Código seguro (Fases 1–7)](#6-bloque-a--código-seguro-fases-17)
7. [BLOQUE B — Ops y deuda (Fase 8)](#7-bloque-b--ops-y-deuda-fase-8)
8. [BLOQUE C — Ciberseguridad y pentest](#8-bloque-c--ciberseguridad-y-pentest)
9. [BLOQUE D — Beta, live y launch NY](#9-bloque-d--beta-live-y-launch-ny)
10. [Protocolo de IA (Fable 5 + GPT 5.6 SOL)](#10-protocolo-de-ia-fable-5--gpt-56-sol)
11. [Mapa visual del plan completo](#11-mapa-visual-del-plan-completo)
12. [Checklists de validación](#12-checklists-de-validación) — incluye [§12.4 validación manual post-desarrollo](#124-checklist-final--validación-manual-en-runtime-post-desarrollo)
13. [Riesgos conocidos (confirmados por grafo)](#13-riesgos-conocidos-confirmados-por-grafo)
14. [Estado final del proyecto (después de todo)](#14-estado-final-del-proyecto-después-de-todo)
15. [Tablero de progreso por fase](#15-tablero-de-progreso-por-fase)
16. [Bitácora de ejecución (errores y soluciones)](#16-bitácora-de-ejecución-errores-y-soluciones)
17. [Protocolo de mantenimiento y reanálisis del plan](#17-protocolo-de-mantenimiento-y-reanálisis-del-plan)

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Es código basura? | **No.** Es un MVP ambicioso con deuda de seguridad y arquitectura. |
| ¿Lanzable hoy? | **No** con dinero real. Sí para demo/beta con tarjetas test. |
| ¿Plan validado por grafo? | **Sí (~90%).** Grafo actualizado en commit `4adcaa45`. |
| ¿Cuánto tarda todo? | **6–8 semanas** (código + ops + pentest + beta + launch). |
| ¿Pagos en este plan? | Solo **modo TEST** (`sk_test_`) hasta Bloque D. |
| ¿Fase 1 cerrada? | **Sí.** Auth + verificación (typecheck/constitution) vía Fase 1b. |

**Regla de oro:** Toda consulta de análisis → **Graphify primero** → implementar después.

---

## 2. Estado actual del proyecto

### 2.1 Grafo Graphify (validado 2026-07-13)

| Ítem | Valor | Estado |
|---|---|---|
| Commit | `4adcaa45` | ✅ Actual |
| Nodos | 3188 (antes 638) | ✅ |
| Edges | 5371 | ✅ |
| Comunidades | 399 | ✅ |
| Extracción | 99% EXTRACTED | ✅ |
| Corpus | 426 archivos · ~328k palabras | ✅ Suficiente |
| Queries | `py -m graphify query` funciona | ✅ |

**Comandos Graphify instalados (Windows):**

```powershell
py -3.11 --version                   # Python 3.11.9
py -3.11 -m graphify --version       # graphify 0.9.11
py -3.11 -m graphify update .        # actualizar grafo (sin costo API)
py -3.11 -m graphify query "..."     # consultar
start graphify-out\graph.html        # visualizar
```

> **Nota:** Usar `py`, no `python` (alias de Microsoft Store roto en Windows).
>
> **Importante (2026-08-15, E-060):** el `py` por defecto pasó a ser **Python
> 3.13**, donde graphify **no** está instalado — `py -m graphify` falla con
> "No module named graphify". Usar **`py -3.11`** (o el ejecutable `graphify`
> en el PATH, que resuelve al 3.11).

### 2.2 Notas de arquitectura (pre-plan)

| Área | Nota actual | Objetivo post-plan |
|---|---|---|
| Seguridad | 4/10 | 8/10 |
| Arquitectura backend | 6/10 | 8/10 |
| Frontend (contextos) | 5/10 | 7/10 |
| Tests | 4/10 (JEST-01) | 7/10 |
| Pagos | Caminos duplicados + respaldo | Un solo flujo TEST |

### 2.3 Hubs del grafo (módulos críticos)

| Comunidad | Hub | Rol |
|---|---|---|
| C6 | `economy.ts` | Gamificación, mascota, monedas |
| C15 | `disputes.ts` | Disputas |
| C18 | `orders.ts` | Órdenes |
| C19 | `PointsContext.tsx` | Puntos y tiers |
| C21 | `PaymentScreen.tsx` | Checkout UI |
| C4 | `EscrowSheet.tsx` | UI escrow |
| C49 | `AuthActor` / `authHelpers.ts` | Auth server-side |
| C50 | `AuthContext.tsx` | Sesión frontend |
| C60 | `stripe.ts` | Pagos Stripe |
| C22 | Módulo Pagos respaldo | **Eliminar/aislar** |

### 2.4 Bugs documentados en grafo (A_Z_Test_Report)

| ID | Severidad | Descripción |
|---|---|---|
| **CART-03** | CRÍTICO | Guest puede ir al checkout sin login |
| **ADSP-02** | ALTO | Admin no puede resolver disputas |
| **AUSR-03** | ALTO | No hay `banUser` ni UI |
| **IMP-01** | MEDIO | Impersonate sin UI |
| **JEST-01** | MEDIO | 6/7 suites de tests fallan |

---

## 3. Graphify — protocolo obligatorio

### 3.1 Antes de tocar código (siempre)

```
1. py -m graphify update .
2. py -m graphify query "tu pregunta"
3. Leer graphify-out/GRAPH_REPORT.md
4. Implementar solo los nodos/archivos que el grafo indique
5. Al terminar la fase → py -m graphify update . de nuevo
```

### 3.2 Queries por fase

```powershell
# Fase 1 - Auth
py -m graphify query "auth userId requireActor authHelpers security"

# Fase 2 - Passwords
py -m graphify query "users login password hash authentication"

# Fase 3 - Carrito
py -m graphify query "cart CartContext convex cart checkout"

# Fase 4 - Checkout guest
py -m graphify query "CART-03 guest checkout gateCheckout useActionGate"

# Fase 5 - Pagos
py -m graphify query "stripe payment test escrow http webhook respaldo"

# Fase 6 - Contextos stub
py -m graphify query "stub WalletProvider MarketplaceProvider FintechProvider empty"

# Fase 7 - App.tsx cleanup
py -m graphify query "App.tsx providers EscrowProvider PaymentMode"

# Fase 8 - Admin ops
py -m graphify query "resolveDispute banUser admin dashboard ADSP AUSR"

# Pre-pentest
py -m graphify query "security risks IDOR admin banUser resolveDispute"
py -m graphify path "AuthContext" "orders.ts"
py -m graphify path "PaymentScreen" "stripe.ts"
```

### 3.3 Cuándo refrescar el grafo

| Momento | Comando |
|---|---|
| Antes de empezar una fase | `py -m graphify update .` |
| Después de terminar una fase | `py -m graphify update .` |
| Antes del pentest | `py -m graphify update .` |
| Después de cada PR grande | `py -m graphify update .` |

---

## 4. Conceptos clave (backend vs contextos)

### 4.1 Los contextos NO son el backend

```
❌ Modelo incorrecto:
   Contexto → agrupa funciones backend → las manda en bloque a Convex

✅ Modelo correcto:
   Pantalla → useQuery/useMutation(api.modulo.funcion) → Convex
   Contexto   → solo estado local del celular (cache UI, tema, toasts)
```

### 4.2 Capas del sistema

```
EXPO APP (frontend)
  │  useQuery / useMutation / useAction  (1 función = 1 llamada)
  ▼
CONVEX (backend — única puerta)
  │  query / mutation / action / httpAction / crons
  ▼
STRIPE (test) · RESEND · IAP · ZENDESK
```

### 4.3 Reglas de backend (no negociables)

1. El servidor **nunca confía** en `userId`, rol o montos enviados por el cliente.
2. Toda mutación sensible empieza con `requireActor(ctx)` desde `ctx.auth`.
3. Una fuente de verdad por dominio (carrito, wallet, órdenes).
4. Pagos: monto calculado en server → webhook confirma → recién ahí se crea orden.
5. Microservicios (futuro): **detrás** de Convex `actions`, nunca expuestos al celular.

### 4.4 Contextos — estado actual

| Contexto | Estado | Acción en plan |
|---|---|---|
| `AuthContext` | ✅ Completo | Mantener |
| `RewardsContext` | ✅ Completo | Mantener |
| `EscrowContext` | ✅ Completo | Mantener |
| `CartContext` | ⚠️ Local only | Fase 3 → sincronizar con `convex/cart.ts` |
| `PointsContext` | ✅ Convex (`economy.ts`) | Mantener |
| `PaymentModeContext` | ✅ Completo | Mantener (modo test) |
| `MarketplaceContext` | ✅ Convex (`listings.ts` + orders) | Mantener |
| `WalletContext` | ✅ Convex (`finance.ts`) | Mantener |
| `FintechContext` | ✅ Convex (`finance.ts` + `users.ts` KYC) | Mantener |
| `BusinessContext` | ✅ Convex (dashboard + listings); branches local | Mantener |
| `ReferralContext` | ✅ Convex (`users.ts` referidos) | Mantener |

---

## 5. Arquitectura objetivo

### 5.1 Backend Convex (módulos por dominio)

```
convex/
├── authHelpers.ts      ← transversal: requireActor, roles
├── schema.ts           ← tablas (partir en Components a futuro)
├── http.ts             ← webhooks Stripe/IAP
├── crons.ts            ← escrow auto-release, reconciliación
├── users.ts            ← auth, perfil, KYC, referidos
├── cart.ts             ← carrito (fuente única)
├── listings.ts         ← marketplace catálogo
├── orders.ts           ← órdenes + estados
├── disputes.ts         ← disputas
├── stripe.ts           ← pagos TEST (único camino)
├── finance.ts          ← wallets, ledger, retiros
├── connect.ts          ← Stripe Connect
├── economy.ts          ← gamificación
├── points.ts           ← puntos
├── bonos.ts            ← descuentos QR
├── social.ts           ← red social
├── notifications.ts    ← push, OTP
└── adminQueries.ts     ← stats admin
```

### 5.2 Flujo de pago objetivo (modo TEST)

```
1. Usuario autenticado → CartScreen
2. gateCheckout() bloquea guests (UI)
3. Server valida sesión en createOrder (backend)
4. stripe.createPaymentIntent (sk_test_, monto desde DB)
5. Stripe webhook → http.ts → finance.recordPaymentEvent (idempotente)
6. orders.createOrder (estado: payment_received, escrow: held)
7. Escrow lifecycle → cron o confirmReceipt → released
```

### 5.3 Variables de entorno (solo TEST en Bloques A–C)

| Variable | Dónde | Valor |
|---|---|---|
| `EXPO_PUBLIC_STRIPE_KEY_TEST` | `.env.local` | `pk_test_...` |
| `STRIPE_SECRET_KEY` | Convex dashboard | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Convex dashboard | `whsec_...` (test) |
| `EXPO_PUBLIC_CONVEX_URL` | `.env.local` | URL deployment |
| `PaymentMode` | App | `test` |

> **Nunca** commitear credenciales. `sk_live_` solo en Bloque D.

---

## 6. BLOQUE A — Código seguro (Fases 1–7)

**Duración estimada:** 2–4 semanas  
**IA recomendada:** Fable 5 (plan + ejecución) · GPT 5.6 SOL (fixes puntuales)  
**Entre cada fase:** `npm run typecheck` + `npm run test:constitution` + `py -m graphify update .`

> **Nota (2026-07-13):** Tras Fase 1 auth funcional, usar **Fase 1b** (1 sprint) para depurar errores transversales e interconectar backend ↔ frontend ↔ tests antes de escalar marketplace/social/rewards.

---

### Fase 1 — Auth server-side estricto

**Estado:** ✅ **CERRADA** · Auth implementado; cierre formal vía **Fase 1b** · Última sesión: 2026-07-13  
**Grafo:** `authHelpers.ts` (C49), `AuthContext.tsx` (C50), guideline `ctx.auth.getUserIdentity`  
**IA usada:** Fable 5 (ejecución auth) · **Próxima sesión:** sprint Fase 1b o Fase 2 (bcrypt) en paralelo

#### Objetivo de la fase

El servidor **nunca** acepta `userId` / `actorId` del cliente como fuente de identidad en mutaciones/actions sensibles. La identidad sale de:

1. `ctx.auth.getUserIdentity()` (Convex Auth / OAuth futuro), o
2. Token opaco `ses_*` emitido en login/register y guardado en tabla `sessions`.

#### Patrón implementado (referencia para auditorías)

```typescript
// Mutación/action sensible
const actor = await requireActor(ctx, args.sessionToken);
assertSelfOrAdmin(actor, targetUserId); // si opera sobre un userId

// Admin-only
assertAdminOrDeveloper(actor);
```

`requireActor` en `authHelpers.ts` **rechaza** raw userId — solo `ses_*` o identity de Convex Auth.

---

#### Checklist detallado — qué está HECHO ✅

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| 1.1 | Tabla `sessions` en `schema.ts` | ✅ | `sessions` + índices `by_token`, `by_user` |
| 1.2 | `createSession()` en login/register | ✅ | `users.ts` → `register`, `login` |
| 1.3 | `requireActor()` sin fallback a userId cliente | ✅ | `authHelpers.ts` L101–117 |
| 1.4 | `logout` revoca sesión server-side | ✅ | `users.ts` → `logout` |
| 1.5 | `AuthContext` envía `sessionToken` en mutaciones | ✅ | `src/contexts/AuthContext.tsx` |
| 1.6 | IDOR cerrado en `connect.ts` | ✅ | `assertSelfOrAdminAction` usa `sessionToken` |
| 1.7 | IDOR cerrado en `stripe.ts` (payouts, PM, admin escrow) | ✅ | `requireActor` + `assertSelfOrAdmin` |
| 1.8 | IDOR cerrado en `subscriptions.ts` | ✅ | checkout/cancel/getMySubscription |
| 1.9 | IDOR cerrado en `iapActions.ts` | ✅ | validateApple/Google con actor |
| 1.10 | IDOR cerrado en `payments/actions.ts` | ✅ | sin `args.userId \|\| anonymous` |
| 1.11 | `syncUser` no emite sesión si cuenta tiene password | ✅ | anti account-takeover |
| 1.12 | `sendPushNotification` → admin-only | ✅ | `notifications.ts` |
| 1.13 | `getOrderById` exige sesión | ✅ | `orders.ts` |
| 1.14 | ~29 módulos convex con `requireActor(ctx, sessionToken)` | ✅ | cart, orders, finance, social, etc. |
| 1.15 | Frontend pasa `sessionToken` en pagos/payouts/admin | ✅ | PaymentForm, WithdrawalScreen, AdminDashboard, DisputeScreen |
| 1.16 | Dep `fbjs` reinstalada (web bundle) | ✅ | `node_modules/fbjs/lib/invariant.js` existe |
| 1.17 | Archivos fuente corruptos restaurados | ✅ | 18 archivos recuperados desde `HEAD`; migración frontend reaplicada sin bytes nulos ni duplicados |

---

#### Checklist detallado — qué FALTA ❌

| # | Ítem | Estado | Acción para cerrar |
|---|---|---|---|
| 1.18 | `npm run typecheck` verde | ✅ | Exit 0 (2026-07-13): `global.d.ts`, stubs tipados, RewardsContext restaurado |
| 1.19 | `npm run test:constitution` verde | ✅ | Exit 0: 10/10 tests (constitution + RewardsContext) |
| 1.20 | Expo web bundle sin error | ✅ | `npm.cmd start -- --web`; Metro en `localhost:8081`; `curl.exe -I` respondió `HTTP/1.1 200 OK` |
| 1.21 | `py -m graphify update .` post-fase | ✅ | Exit 0: 3354 nodos, 5596 edges, 420 communities (post-1b) |
| 1.22 | `internalCreateOnboardingLink` usa `args.actorId` | ⚠️ | Internal-only; bajo riesgo; opcional no ejecutado |
| 1.23 | Marcar Fase 1 ✅ en §15 y commit (cuando el usuario pida) | ✅ | §15 actualizado; commit pendiente por instrucción usuario |

---

#### Archivos tocados en Fase 1 (sesión 2026-07-13)

**Backend (convex/):**

| Archivo | Cambio principal |
|---|---|
| `authHelpers.ts` | `sessions`, `createSession`, `requireActor` estricto |
| `schema.ts` | Tabla `sessions` |
| `users.ts` | login/register/logout + `syncUser` protegido |
| `connect.ts` | Auth por `sessionToken` en todas las actions públicas |
| `stripe.ts` | Auth en payouts, PM, admin escrow, connect link |
| `subscriptions.ts` | Auth en checkout/cancel/query |
| `iapActions.ts` | Auth en validación recibos |
| `payments/actions.ts` | Identidad solo desde sesión |
| `notifications.ts` | `sendPushNotification` admin-only |
| `orders.ts` | `getOrderById` con sesión |
| `cart.ts`, `finance.ts`, `social.ts`, `bonos.ts`, `campaigns.ts`, `events.ts`, `reviews.ts`, `listings.ts`, `disputes.ts`, `economy.ts`, `favorites.ts`, `files.ts`, `identity.ts`, `developer.ts`, `userProfile.ts`, `iap.ts` | `requireActor` + `sessionToken` (sesión previa/partial) |

**Frontend (src/):**

| Archivo | Cambio |
|---|---|
| `contexts/AuthContext.tsx` | Persiste y expone `sessionToken` |
| `payments/components/PaymentForm.tsx` | Pasa `sessionToken` |
| `payments/components/PaymentForm.web.tsx` | Pasa `sessionToken` |
| `screens/PaymentScreen.tsx` | Pasa `sessionToken` |
| `screens/WithdrawalScreen.tsx` | Pasa `sessionToken` a Connect |
| `screens/AdminDashboardScreen.tsx` | Pasa `sessionToken` a admin actions |
| `screens/marketplace/DisputeScreen.tsx` | Pasa `sessionToken` a `getOrderById` |

---

#### Criterio de aceptación (actualizado)

- [x] Tabla `sessions` + tokens `ses_*` en login/register
- [x] `requireActor` falla sin token/sesión válida
- [x] IDOR críticos cerrados (connect, stripe payouts, payments sim, syncUser, IAP)
- [x] Frontend compatible con `sessionToken`
- [x] `typecheck` pasa
- [x] `test:constitution` pasa
- [ ] Web bundling completa sin error
- [ ] `graphify update .` post-fase
- [ ] Query grafo no muestra IDOR obvio en auth

---

#### Prompt IA — CIERRE Fase 1 (pegar en chat nuevo)

Ver también §17 y el prompt completo que el usuario guardó en su flujo de trabajo. Resumen:

```
Modelo: GPT 5.6 SOL · Effort: Medium · Modo: Agent
Objetivo ÚNICO: verificación final Fase 1 (NO rehacer auth).
Correr: typecheck → test:constitution → expo start + web → graphify update .
Actualizar §15, §16 y checklist Fase 1 en este archivo al terminar.
```

---

#### Explícitamente FUERA de Fase 1 (no mezclar)

- Fase 2: bcrypt, eliminar `password123`
- Fase 3: carrito unificado
- Fase 4: guest checkout (CART-03)
- Fase 5: pagos TEST un solo camino
- Commits git (solo cuando el usuario lo pida)

**Prompt IA (Fase 1 — referencia histórica):**

```
Leé graphify-out/GRAPH_REPORT.md y corré: py -m graphify query "auth userId requireActor"
Implementá SOLO Fase 1 del PLAN_ESTRATEGICO_MAESTRO.md.
Reglas: diff mínimo, leer nodos del grafo antes de editar, no tocar pagos ni carrito.
Al terminar: typecheck + constitution tests + lista de archivos tocados.
Actualizar §15, §16 y checklist de Fase 1 en PLAN_ESTRATEGICO_MAESTRO.md.
```

---

### Fase 1b — Sprint extra: depuración transversal e interconexión entre fases

**Estado:** ✅ **CERRADA** · **Duración:** 1 sprint · **Decisión:** 2026-07-13 · **Ejecutada:** 2026-07-13

**Propósito:** No es rehacer auth. Es **depurar errores transversales** (typecheck, tests, stubs, tipos) e **interconectar** lo ya implementado en cada fase para que backend, frontend, tests y grafo hablen el mismo idioma.

#### Qué conecta

| Capa | Hoy (desconectado) | Objetivo del sprint |
|---|---|---|
| **Fase 1 auth** | `requireActor` + `sessionToken` en Convex y parte del frontend | Verificar que **todos** los call sites del grafo pasan `sessionToken` y no confían en `userId` cliente |
| **Fase 6 (parcial)** | `MarketplaceContext`, `SocialContext`, `ReferralContext` son stubs | Exportar la API mínima que pantallas y tests ya consumen; cablear a Convex donde exista |
| **Fase 8c (parcial)** | `constitution.test` y `RewardsContext.test` esperan constantes/API vieja | Alinear tests con implementación real **o** reexportar contratos de negocio documentados |
| **Tooling** | `jest.setup.ts` rompe typecheck; faltan `@types` | Dejar `tsconfig.check.json` y Jest coherentes con el repo |

#### Errores objetivo (evidencia actual)

| ID | Síntoma | Causa | Fases tocadas |
|---|---|---|---|
| E-013 | `typecheck` exit 2 (~212 errores) | Stubs, tipos faltantes, `jest.setup.ts` en scope | 6, 8c, tooling |
| E-014 | `test:constitution` 9/10 fallan | Constantes/API Rewards no exportadas o desalineadas | 6, 8c |
| E-015 | `convex codegen` sin deployment | Entorno local; no bloquea web | ops |

#### Orden sugerido (1 sprint)

1. **Graphify primero:** `py -m graphify query "requireActor sessionToken stub context"` — mapear edges rotos backend ↔ frontend.
2. **Tooling (día 1–2):** excluir o tipar `jest.setup.ts`; instalar `@types` faltantes (`react-native-safe-area-context`, `expo-location`, etc.).
3. **Interconexión contextos (día 3–5):** stubs mínimos → Convex/hooks reales (subset Fase 6: Marketplace, Social, Referral, Rewards).
4. **Contratos de negocio (día 6–7):** constitution + Rewards tests alineados con código o constantes reexportadas.
5. **Cierre:** `npm.cmd run typecheck` + `npm.cmd run test:constitution` + `py -m graphify update .` → marcar Fase 1 ✅ y Fase 1b ✅ en §15.

#### Criterio de aceptación

- [x] `npm.cmd run typecheck` exit 0
- [x] `npm.cmd run test:constitution` exit 0
- [x] Grafo actualizado post-sprint (`3354` nodos, `5596` edges)
- [x] Contextos stub con API mínima tipada (Marketplace, Referral, Wallet, Notifications, Social)
- [x] `RewardsContext` restaurado + constantes constitution v2 exportadas
- [x] Fase 1 checklist 1.18–1.23 verde; §16 E-013/E-014 resueltos

#### Explícitamente FUERA de Fase 1b

- Reimplementar auth desde cero
- Fase 3–5 completas (carrito unificado, guest checkout, pagos live)
- Fase 6/8 completas (todos los contextos, suite Jest entera, admin)
- Commits (salvo que el usuario lo pida)

#### Relación con otras fases

- **Fase 2 (bcrypt):** puede iniciarse **en paralelo** — no depende de Fase 1b.
- **Fase 3–5:** conviene esperar Fase 1b si tocan contextos stub o pagos UI.
- **Fase 6 / 8c:** Fase 1b hace el **subset crítico**; el resto queda para esas fases completas.

**Prompt IA (Fase 1b):**

```
Leé PLAN_ESTRATEGICO_MAESTRO.md → Fase 1b.
Corré: py -m graphify query "requireActor sessionToken stub context constitution"
Objetivo: depurar E-013/E-014 e interconectar auth (Fase 1) con contextos y tests (Fase 6/8c parcial).
Reglas: diff mínimo, no reimplementar auth, no Fase 3–5.
Al terminar: typecheck + test:constitution verdes, graphify update, actualizar §15/§16.
```

---

### Fase 2 — Passwords reales

**Estado:** ✅ **CERRADA** · Implementada y verificada: 2026-07-13  
**Grafo:** `users.ts` (C53), `login`, `register`, `changePassword`

**Implementación:**

1. `passwordHelpers.ts` centraliza bcrypt con costo 10, verificación y detección legacy.
2. `register` y `changePassword` guardan hashes bcrypt con salt.
3. `login` verifica bcrypt y migra automáticamente un hash `hashed_*` válido.
4. Eliminado el master password del backend; las cuentas demo usan una credencial normal con hash bcrypt.
5. `SidebarMenu` usa la misma credencial solo en `__DEV__`; no existe bypass server-side.

**Archivos clave:**

- `convex/users.ts`
- `convex/passwordHelpers.ts`
- `convex/seedUsers.ts`
- `convex/developer.ts`
- `src/components/SidebarMenu.tsx`
- `package.json` / `package-lock.json`

**Criterio de aceptación:**

- [x] Hash no reversible y salt único (`bcrypt_prefix=true`, `salt_unique=true`).
- [x] Sin `password123`, `isMasterPass` ni hash demo legacy en código ejecutable.
- [x] `register` guarda bcrypt.
- [x] `login` verifica bcrypt y migra `hashed_*` solo tras password correcta.
- [x] `changePassword` verifica bcrypt/legacy y guarda bcrypt, sin master password.
- [x] Seeds/dev crean o actualizan usuarios con bcrypt real.
- [x] `npm.cmd run typecheck` exit 0.
- [x] `npm.cmd run test:constitution` exit 0 — 2 suites, 10 tests.
- [x] `py -m graphify update .` post-fase — 3360 nodos, 5611 edges, 415 communities.
- [x] Query post-fase conecta `users.ts`, `passwordHelpers.ts`, seeds y `bcryptjs`.

---

### Fase 3 — Carrito unificado

**Grafo:** `CartContext` (C45) vs `convex/cart.ts`, `useCheckout`, `CartItem`

**Qué hacer:**

1. `convex/cart.ts` = **única fuente de verdad**.
2. `CartContext` pasa a ser espejo reactivo (lee/escribe vía Convex mutations).
3. Eliminar estado local que no se sincroniza.
4. `useCheckout` y `CartScreen` usan datos del server.

**Archivos clave:**

- `convex/cart.ts`
- `src/contexts/CartContext.tsx`
- `src/screens/CartScreen.tsx`
- `src/screens/marketplace/CartScreen.tsx`
- `src/hooks/useCheckout.ts`
- `src/components/CartSidebar.tsx`

**Criterio de aceptación:**

- [x] Código: agregar/quitar/actualizar/vaciar persiste vía Convex (`CartContext` → `api.cart.*` con `sessionToken`).
- [x] Código: recarga usa `getMyCart` reactivo; sin copia en AsyncStorage para autenticados.
- [x] Código: una sola fuente de verdad server-side; guest aislado en memoria (checkout bloqueado en Fase 4).
- [ ] **Validación manual en runtime** → diferida al [§12.4 Checklist final](#124-checklist-final--validación-manual-en-runtime-post-desarrollo) (decisión 2026-07-13: ejecutar cuando todas las fases de desarrollo estén completas, antes de beta).

**Evidencia de implementación (2026-07-13):**

- `npm.cmd run typecheck` → exit 0.
- `npm.cmd run test:constitution` → exit 0 (2 suites, 10 tests).
- `py -m graphify update .` post-cambios → 3367 nodos, 5628 edges, 416 communities.
- Backend `convex/cart.ts`: identidad solo desde `requireActor(ctx, sessionToken)`; valida listing existente (`normalizeId`), cantidad entera > 0 y stock para productos; snapshot de precio SIEMPRE server-side (no se confía en el precio del cliente); queries acotadas con `.take(200)`.
- Frontend: `sessionToken` llega a `CartContext` vía `src/services/auth/sessionTokenStore.ts` (CartProvider envuelve a AuthProvider en App.tsx, que no se tocó).
- Sin cambios en `schema.ts` (índices `by_user` y `by_user_listing` ya existían).

---

### Fase 4 — Bloquear guest checkout (CART-03)

**Grafo:** `[CART-03]`, `gateCheckout`, `useActionGate`

**Qué hacer:**

1. UI: `gateCheckout()` en `handleCheckout` de `CartScreen`.
2. Server: `createOrder` y `createPaymentIntent` rechazan sin `requireActor`.
3. Tests manuales: guest → carrito → checkout → debe redirigir a login.

**Archivos clave:**

- `src/screens/marketplace/CartScreen.tsx` (o `CartScreen.tsx`)
- `src/utils/useActionGate.ts`
- `convex/orders.ts`
- `convex/stripe.ts`

**Criterio de aceptación:**

- [x] Código: `CartSidebar.handleCheckout` gatea con `gateCheckout()` igual que las dos `CartScreen` (2026-07-13).
- [x] Código: no existe otro camino de UI a `Payment`/`Checkout` sin gate — grep dirigido sobre `navigate/push/replace('Payment'|'Checkout')` solo devuelve los 3 puntos gateados (`CartSidebar`, `CartScreen`, `marketplace/CartScreen`).
- [x] Servidor: `createOrder` (`convex/orders.ts` L140) y `createPaymentIntent` (`convex/stripe.ts` L43, `convex/payments/actions.ts` L25) empiezan con `requireActor(ctx, sessionToken)` sin fallback anónimo (verificado, sin cambios).
- [x] `npm.cmd run typecheck` exit 0 · `npm.cmd run test:constitution` exit 0 (10/10) · `py -m graphify update .` OK (2026-07-13).
- [ ] **Validación manual en runtime** (guest bloqueado en los 3 puntos + checkout autenticado OK) → diferida al [§12.4 Checklist final](#124-checklist-final--validación-manual-en-runtime-post-desarrollo).

---

### Fase 5 — Pagos TEST — un solo camino

**Estado:** 🟡 **Código listo** · **Decisión:** Opción A — `convex/stripe.ts` (Stripe real TEST) · **Ejecutada (código):** 2026-07-13

**Grafo:** `stripe.ts` (C60), `http.ts`, C22 respaldo, hyperedge Stripe stack

**Qué hacer:**

1. Elegir **un** camino principal: `convex/stripe.ts` (real test) o `payments/actions.ts` (simulador). → **Elegido: `convex/stripe.ts`**
2. Documentar el camino en comentario/README interno.
3. Aislar o eliminar referencias a módulo `respaldo/`.
4. Verificar webhook test apunta a `convex/http.ts`.
5. Idempotencia en `finance.recordPaymentEvent` intacta.

**Archivos clave:**

- `convex/stripe.ts`
- `convex/http.ts`
- `convex/finance.ts`
- `convex/payments/actions.ts`
- `src/screens/PaymentScreen.tsx`
- `src/payments/*`
- `src/contexts/PaymentModeContext.tsx`

**Criterio de aceptación:**

- [x] Un solo camino documentado y activo — comentario cabecera en `convex/stripe.ts`; simulador marcado descartado en `convex/payments/actions.ts` (2026-07-13).
- [x] Frontend cableado a `api.stripe.createPaymentIntent` — `PaymentForm.tsx`, `PaymentForm.web.tsx`, `PaymentScreen.tsx` (sin call sites a `payments.actions`) (2026-07-13).
- [x] `PaymentMode` default `test` — `PaymentModeContext.tsx` (live bloqueado hasta Bloque D) (2026-07-13).
- [x] Camino descartado aislado — `payments.actions.createPaymentIntent` lanza error; webhook sin rama `metadata.mode === "test"` del simulador (2026-07-13).
- [x] Webhook test en `convex/http.ts` — ruta `/stripe-webhook` + rama `cartId`+`userId` → `internalProcessMultiVendorCart` + `internalMarkPaymentSucceeded` (código verificado, sin deploy).
- [x] Idempotencia `finance.recordPaymentEvent` intacta — sin cambios en `convex/finance.ts` (2026-07-13).
- [x] Auth: `requireActor(ctx, sessionToken)` en `stripe.createPaymentIntent` — sin `userId` del cliente (2026-07-13).
- [x] `npm.cmd run typecheck` → exit 0 (2026-07-13).
- [x] `npm.cmd run test:constitution` → exit 0 · 10/10 (2026-07-13).
- [x] `py -m graphify update .` post-cambios (2026-07-13).
- [ ] **Tarea final — Push Convex + secrets TEST** *(usuario, post-desarrollo)* — ver [Tarea final Fase 5](#tarea-final-fase-5--push-convex-y-secrets-test) más abajo en esta fase.
- [ ] **Flujo test E2E en runtime** — carrito → pago `4242…` → webhook → orden (`payment_received`, escrow `held`) → [§12.4](#124-checklist-final--validación-manual-en-runtime-post-desarrollo).

#### Tarea final Fase 5 — Push Convex y secrets TEST

> **No ejecutar durante el desarrollo de fases.** El usuario lo hará cuando decida desplegar. Sin esto, el E2E real con Stripe test no puede validarse en runtime.

1. `npx.cmd convex dev` (o `npx.cmd convex deploy`) — configurar `CONVEX_DEPLOYMENT` local.
2. En **Convex dashboard** → Environment Variables:
   - `STRIPE_SECRET_KEY` = `sk_test_…` (nunca `sk_live_`)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_…` (endpoint test)
3. En **Stripe dashboard** (modo test) → Webhooks → endpoint:
   - URL: `https://<tu-deployment>.convex.site/stripe-webhook`
   - Eventos mínimos: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. En **`.env.local`** (Expo):
   - `EXPO_PUBLIC_CONVEX_URL` = URL del deployment
   - `EXPO_PUBLIC_STRIPE_KEY_TEST` = `pk_test_…`
5. Reiniciar Expo + Convex dev; ejecutar checklist manual [§12.4 Fase 5](#124-checklist-final--validación-manual-en-runtime-post-desarrollo).
6. Al cerrar E2E manual ✅ → marcar Fase 5 **✅ Cerrada** en §15.

---

### Fase 6 — Contextos stub → Convex real

**Grafo:** `WalletProvider`, `FintechProvider`, `MarketplaceProvider`, `STUB_PATTERNS`

**Qué hacer:**

Por cada stub, elegir **una** opción:
- **A)** Conectar a Convex (`useQuery`/`useMutation` reales), o
- **B)** Borrar contexto y usar hooks directos en pantallas.

| Contexto | Conectar a |
|---|---|
| `WalletContext` | `convex/finance.ts` |
| `MarketplaceContext` | `convex/listings.ts` + hooks existentes |
| `FintechContext` | `convex/finance.ts` + `convex/stripe.ts` |
| `BusinessContext` | `convex/dashboard.ts` |
| `ReferralContext` | `convex/users.ts` (referidos) |

**Criterio de aceptación:**

- [x] Ningún contexto devuelve datos hardcodeados fake (usuario autenticado).
- [x] Wallet muestra balance real del server (`getWalletAccount` + `getPaymentsByUser`).
- [x] `npm.cmd run typecheck` → exit 0
- [x] `npm.cmd run test:constitution` → exit 0 (10/10)
- [x] `py -m graphify update .` post-cambios

**Diferidos ponytail (documentados en código):** shipping local estimate, challenges estáticos, branches local-only, withdraw/deposit no-op (Stripe Connect), simulateReferral/simulateTimePass dev-only.

---

### Fase 7 — Limpieza App.tsx y providers

**Grafo:** `App.tsx` (C143, cohesión baja), providers anidados

**Qué hacer:**

1. Sacar `console.log` de debug (StripeKeyGate, App).
2. Ordenar providers: solo los que se usan.
3. (Opcional) Extraer `AppNavigator` + providers a `src/app/RootProviders.tsx`.
4. No montar providers de contextos eliminados en Fase 6.

**Archivos clave:**

- `App.tsx`

**Criterio de aceptación:**

- [x] Sin logs de debug en prod path.
- [x] Árbol de providers coherente y documentado.

---

## 7. BLOQUE B — Ops y deuda (Fase 8)

**Duración estimada:** 1–2 semanas  
**Después de:** Bloque A completo + `py -m graphify update .`

---

### Fase 8a — Admin: resolver disputas (ADSP-02)

**Qué hacer:**

1. Verificar/implementar `resolveDispute` en `convex/disputes.ts`.
2. UI en `AdminDashboardScreen` para resolver disputas.
3. Conectar con `finance` para mover fondos escrow.

**Criterio:** Admin puede resolver disputa y liberar/refundear escrow.

---

### Fase 8b — Admin: banear usuarios (AUSR-03)

**Qué hacer:**

1. Mutación `banUser` en `convex/users.ts`.
2. UI en admin para banear.
3. Login rechaza usuarios `banned` → `BannedUserScreen`.

**Criterio:** Admin banea usuario; usuario no puede loguearse.

---

### Fase 8c — Tests Jest (JEST-01)

**Qué hacer:**

1. Mocks globales: `@react-native-async-storage/async-storage`.
2. Wrapper de test con `ConvexProvider` + `AuthContext` fake.
3. Objetivo: `npm run test` pasa (al menos constitution + críticos).
4. Limpiar el script `test:constitution` en `package.json`: referencia 4 archivos pero `marketplace-escrow.test.tsx` y `endtoend-logic.test.tsx` no existen en disco (detectado en Fase 4, 2026-07-13). Quitarlos del script o recrear las suites.

**Criterio:** `test:constitution` verde; suite principal no falla por mocks.

---

### Fase 8d — Limpiar código respaldo

**Qué hacer:**

1. Inventariar archivos `*respaldo*`, `MÓDULO_PAGOS_RESPALDO`, `StripeWrapper` legacy.
2. Mover a `_archive/` o borrar si no se importan.
3. Actualizar grafo y verificar que no queden edges a respaldo.

**Criterio:** Un solo stack de pagos activo en el grafo.

---

## 8. BLOQUE C — Ciberseguridad y pentest

**Duración estimada:** 2–3 semanas  
**Prerequisito:** Bloques A + B completos

---

### C1 — Scan automático

```powershell
npm audit
npm run typecheck
npm run test:constitution
# secrets: verificar que .env no está en git
git log --all -- "*.env" ".env*"
```

**Criterio:** 0 secrets en repo · 0 CVEs críticos sin parche.

---

### C2 — Review IA del diff

- Ejecutar **security-review** en Cursor sobre todo el diff acumulado.
- Ejecutar **Bugbot** sobre el diff.

---

### C3 — Pruebas manuales OWASP

#### Auth / sesión

| # | Prueba | Esperado |
|---|---|---|
| 1 | Cambiar `userId` en request | Rechazado |
| 2 | Guest → checkout | Bloqueado |
| 3 | Consumer → admin panel | 403 |
| 4 | Token expirado | Logout forzado |
| 5 | Brute force login | Rate limit |

#### Pagos (test)

| # | Prueba | Esperado |
|---|---|---|
| 1 | Cambiar monto en cliente | Server ignora, usa DB |
| 2 | Webhook sin firma Stripe | 400 |
| 3 | Webhook duplicado | Idempotente, 1 orden |
| 4 | Orden sin pago confirmado | No se crea |

#### Datos

| # | Prueba | Esperado |
|---|---|---|
| 1 | User A pide órdenes de User B | Vacío o 403 |
| 2 | Logs/Sentry | Sin tokens ni PAN |

---

### C4 — Pentest

**Opción DIY:**

```powershell
py -m graphify query "security attack vectors auth payments admin"
```

Prompt Fable 5 como red team → ejecutar vectores → documentar.

**Opción profesional (recomendada para NY + dinero real):**

- Alcance: app móvil + API Convex + webhooks
- Entregable: reporte Critical/High/Medium/Low
- Arreglar **todos Critical + High** antes de launch

---

### C5 — Fix hallazgos

- Solo parches de seguridad.
- Sin features nuevas.
- Re-test cada fix.

---

### C6 — Sign-off

Crear `SECURITY_SIGNOFF.md` con:

- [ ] 0 Critical abiertos
- [ ] 0 High abiertos
- [ ] CART-03 verificado cerrado
- [ ] IDOR verificado cerrado
- [ ] Webhooks idempotentes verificados
- [ ] Passwords bcrypt/argon2
- [ ] Fecha + responsable

---

## 9. BLOQUE D — Beta, live y launch NY

**Duración estimada:** 3–4 semanas  
**Prerequisito:** Bloque C sign-off

---

### D1 — Beta cerrada

1. Build TestFlight (iOS) + Play Internal Testing (Android).
2. 10–30 testers reales.
3. Pagos con tarjetas test Stripe (`4242 4242 4242 4242`).
4. Recolectar feedback; solo fix P0/P1.

---

### D2 — Legal / compliance

- [ ] Términos y condiciones publicados
- [ ] Política de privacidad
- [ ] Política de reembolsos y disputas
- [ ] KYC sellers operativo (Stripe Identity)
- [ ] Evaluar Stripe Tax para NY (marketplace facilitator)

---

### D3 — Stripe live

- [ ] Cuenta Stripe business verificada
- [ ] `sk_live_` y `pk_live_` en env (Convex + build)
- [ ] Webhook producción registrado

---

### D4 — Compra real de validación

1. `PaymentMode` → `live`
2. Una compra de **$1** con tarjeta real
3. Verificar: webhook → orden → escrow en dashboard
4. Revertir/reembolsar si es prueba

---

### D5 — Soft launch NY

- [ ] App Store + Google Play (o una plataforma primero)
- [ ] Geo/marketing acotado a NY
- [ ] Soporte activo (`SupportScreen`, email)
- [ ] Admin operativo (KYC, disputas, stats)

---

### D6 — Monitoreo 30 días post-launch

| Semana | Foco |
|---|---|
| 1 | Pagos fallidos, webhooks, crashes (Sentry) |
| 2 | `reconciliationFlags` — drift Stripe vs ledger |
| 3 | Performance Convex (queries lentas) |
| 4 | Priorizar features según datos reales |

---

## 10. Protocolo de IA (Fable 5 + GPT 5.6 SOL)

### Roles

| IA | Rol |
|---|---|
| **Fable 5** | Planificar fases, refactors grandes, red team, pentest checklist |
| **GPT 5.6 SOL** | Ejecutar fixes puntuales dentro de una fase |
| **security-review** | Review OWASP del diff |
| **Bugbot** | Review lógico del diff |

### Plantilla de prompt por fase

```
Contexto: Proyecto Ramgos Mobile (Expo + Convex).
Leé: PLAN_ESTRATEGICO_MAESTRO.md, graphify-out/GRAPH_REPORT.md
Corré: py -m graphify query "[query de la fase]"

Implementá SOLO [Fase N] — [nombre].
Reglas:
- Diff mínimo. Sin refactors extra.
- Pagos: solo sk_test_ hasta Bloque D.
- Leer archivos que el grafo indique; no escanear a ciegas.
- Al terminar: npm run typecheck && npm run test:constitution
- Listar archivos tocados + pasos de prueba manual.
```

### Qué NO pedirle a la IA

- ❌ "Arreglá toda la app de una"
- ❌ Conectar microservicios directo al frontend
- ❌ Poner `sk_live_` antes del sign-off
- ❌ Agregar features durante pentest

---

## 11. Mapa visual del plan completo

```
┌─────────────────────────────────────────────────────────────┐
│  GRAPHIFY: update + query + GRAPH_REPORT.md  (SIEMPRE)      │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  BLOQUE A — Fases 1-7: Código seguro (2-4 sem)              │
│  Auth → Passwords → Carrito → Guest block → Pagos TEST →    │
│  Contextos → App.tsx cleanup                                │
└────────────────────────────┬────────────────────────────────┘
                             ▼
                    graphify update .
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  BLOQUE B — Fase 8: Ops (1-2 sem)                           │
│  Admin disputas → ban → Jest → limpiar respaldo             │
└────────────────────────────┬────────────────────────────────┘
                             ▼
                    graphify update .
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  BLOQUE C — Ciberseguridad (2-3 sem)                        │
│  Scan → Review IA → OWASP manual → Pentest → Fix → Sign-off │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  BLOQUE D — Launch (3-4 sem)                                │
│  Beta → Legal → Stripe live → $1 test → NY launch → Monitor │
└─────────────────────────────────────────────────────────────┘
```

**Timeline total estimado: 6–8 semanas**

---

## 12. Checklists de validación

### Entre cada fase

- [ ] `py -m graphify update .`
- [ ] `npm run typecheck`
- [ ] `npm run test:constitution`
- [ ] Prueba manual descrita en la fase *(puede diferirse al §12.4 si el usuario decide validar en bloque al terminar todas las fases de desarrollo)*
- [ ] Commit con mensaje claro (solo cuando vos lo pidas)

### Pre-beta (fin Bloque C)

- [ ] 0 Critical / 0 High en pentest
- [ ] CART-03 cerrado
- [ ] Carrito unificado (código + §12.4 manual Fase 3)
- [ ] Auth server-side
- [ ] Pagos test E2E
- [ ] `SECURITY_SIGNOFF.md` firmado
- [ ] **§12.4 Checklist final de validación manual** ejecutado y verde

### Pre-launch NY (fin Bloque D)

- [ ] Beta sin P0 abiertos
- [ ] Legal publicado
- [ ] Stripe live verificado
- [ ] 1 compra real OK
- [ ] Sentry activo
- [ ] Admin operativo

### 12.4 Checklist final — validación manual en runtime (post-desarrollo)

> **Política (2026-07-13):** Las pruebas manuales de fases ya implementadas **no bloquean** el avance de desarrollo. Se acumulan acá y se ejecutan **una sola vez**, cuando la app esté desarrollada en **todas las fases del Bloque A + Bloque B** (Fases 1–8), **antes de beta / pentest**.
>
> Al completar cada bloque de este checklist: marcar ✅ en la fase correspondiente (§6) y actualizar §15.

#### Fase 3 — Carrito unificado

**Precondiciones:** Convex dev corriendo; usuario de prueba con `sessionToken` válido (cerrar sesión y volver a entrar si la sesión es pre-Fase 1).

**Criterios a validar:**

- [ ] Agregar / quitar / cambiar cantidad / vaciar persiste en Convex.
- [ ] Recargar la app mantiene el carrito (usuario autenticado).
- [ ] `CartScreen`, `marketplace/CartScreen` y `CartSidebar` muestran los mismos datos.

**Pasos (en orden):**

1. Iniciar sesión.
2. Agregar un producto **real** del marketplace al carrito.
3. Cambiar su cantidad con +/−.
4. Cerrar la app por completo y volver a abrirla.
5. Confirmar que el producto sigue con la cantidad correcta.
6. Abrir cada vista del carrito (`CartScreen`, marketplace `CartScreen`, `CartSidebar`) y comparar datos.
7. Eliminar el producto y confirmar que desaparece en las tres vistas.
8. Agregar otro producto, vaciar el carrito, recargar la app y confirmar que sigue vacío.

**Riesgos a vigilar durante la prueba:**

- Sesión guardada sin `sessionToken` → el carrito se comporta como guest; solución: logout + login.
- IDs mock / no-Convex en pantallas de demo → backend rechaza con "Producto no encontrado" (esperado).
- Precio del listing cambió después de agregar → el carrito muestra el precio **actual** del listing, no el del momento de agregar.

**Al cerrar Fase 3 manualmente:** marcar los 3 criterios de arriba ✅, pasar Fase 3 a **✅ Cerrada 100%** en §15.

#### Fases futuras (plantilla)

> A medida que se implementen Fases 4–8, añadir aquí sus pasos manuales antes de beta. No duplicar en cada fase si ya están centralizados en §12.4.

- [ ] Fase 4 — Guest checkout (CART-03): 1) sin sesión, agregar producto al carrito; 2) `CartSidebar` → "Proceder al Pago" debe pedir login (y cerrar el sheet); 3) repetir desde `CartScreen` y `marketplace/CartScreen` → mismo resultado; 4) con sesión, completar checkout de prueba → debe funcionar; 5) (opcional) llamar `createOrder` sin `sessionToken` desde consola → debe rechazar con error de sesión.
- [ ] Fase 5 — Pagos TEST E2E:
  1. **Prerequisito:** completar [Tarea final Fase 5 — Push Convex](#tarea-final-fase-5--push-convex-y-secrets-test) (`sk_test_`, `pk_test_`, `whsec_`, webhook → `/stripe-webhook`).
  2. Usuario autenticado con `sessionToken` válido (logout + login si el carrito se comporta como guest).
  3. Agregar producto al carrito → checkout desde `CartScreen` (o `CartSidebar`) → llegar a `PaymentScreen`.
  4. Ingresar tarjeta test Stripe `4242 4242 4242 4242` (cualquier CVC/fecha futura) → confirmar pago.
  5. Verificar en Convex dashboard: registro en `payments` (`succeeded_in_escrow`), evento en `paymentEvents` (idempotencia), sub-órdenes en `orders` (`paid_escrow` / `escrowState: held`), carrito vacío.
  6. (Opcional) Reenviar el mismo evento webhook → debe ignorarse (`alreadyProcessed`).
- [ ] Fase 6 — Contextos stub: 1) login → Wallet/Fintech muestran balance real (no hardcode); 2) Marketplace lista productos del feed Convex; 3) Referrals muestra código/link del dashboard; 4) Points reflejan `economy.getEconomyState`; 5) BusinessProfile agregar/pausar producto persiste vía listings.
- [ ] Fase 7 — App.tsx cleanup: *(pendiente)*
- [ ] Fase 8 — Admin ops: *(pendiente)*
- [ ] **RS-1 — Red social y social commerce** *(ver §15.1)*

  **Precondición dura:** `npx convex dev` corriendo con el código nuevo
  deployado. Verificar con
  `npx convex function-spec | grep commerce` — si no aparece, nada de esto
  funciona todavía.

  1. **Publicar** — Creator Studio → subir foto/video, escribir texto,
     adjuntar un producto con el botón de etiqueta → publicar.
     Esperado: aparece en el feed con su `CommerceTag`.
  2. **Video** — un post de tipo video debe **reproducirse** en el feed
     (regresión E-052: antes salía el gradiente de fallback).
  3. **Contadores** — dar like: el corazón queda marcado y el número sube;
     recargar la app y confirmar que persiste (regresión E-053/E-059).
  4. **Paginación** — scrollear más de 10 posts: debe cargar la página
     siguiente, no cortarse (regresión E-058).
  5. **Perfil** — abrir el perfil de otro usuario: el tab Feed debe mostrar
     **solo sus posts**, no el feed global (regresión E-057).
  6. **Comprar desde el feed** — tocar el `CommerceTag` → hoja de checkout:
     precio, creador y puntos vienen del servidor. Activar el switch de
     puntos y ver el descuento recalculado.
  7. **Pagar** (modo test) → verificar en el dashboard de Convex:
     fila en `payments`, fila en `socialPostSales` con `status: "paid"`,
     orden en `orders` con `escrowState: "held"`, y `stock` del listing
     decrementado.
  8. **Comisión** — si el post lo publicó un influencer con campaña activa
     (o listing con `openPromotion`), `socialPostSales.creatorCommissionCents`
     debe ser > 0 y el creador recibe notificación.
  9. **Ingresos** — en el perfil propio, tab **Ingresos**: la venta aparece
     con views, ventas y ganancia.
  10. **Idempotencia** — reenviar el mismo evento webhook: no debe crear una
      segunda orden (`internalFulfillSocialSale` corta en `already_settled`).
  11. **Composers** — `CreatePost` y `CreateInstagramPost`: subir imagen debe
      funcionar (regresión E-056) y el post debe aparecer (regresión E-054).
  12. **Contactar vendedor** — en el detalle de una orden, el botón de
      contacto debe abrir el chat de verdad (regresión E-054).

- [ ] **RS-2 — Ban efectivo también vía OAuth** *(ver §15.2)*

  **Precondición dura:** migración `pointsUnification` aplicada (ver §15.3);
  usuario de prueba logueable tanto por sesión (`email`/`password`) como por
  Google OAuth (`oauthGoogle.ts`).

  1. Loguearse con el usuario de prueba por sesión normal.
  2. Como admin, correr `moderation.adminSuspendUser` sobre ese usuario.
  3. Confirmar que la sesión activa pierde acceso (queries protegidas
     rechazan).
  4. Cerrar sesión, volver a loguearse con el **mismo** usuario pero por el
     flujo OAuth de Google (`oauthGoogle.ts`).
  5. Confirmar que el ban también aplica por ese camino — no solo por el de
     sesión server-side (el gap que motivó este flujo).
  6. Como admin, `moderation.adminUnsuspendUser` y confirmar que ambos
     caminos de login vuelven a funcionar.

- [ ] **RS-3 — Reclamo de recompensa** *(ver §15.2)*

  1. Ejecutar una acción que otorgue reward social (`gamification.ts` →
     `awardSocialAction`, p. ej. publicar un post que califica).
  2. Ir a la pantalla de recompensas/economía y reclamarla vía
     `economy.claimReward` (línea `economy.ts:510`).
  3. Confirmar que `rewardsState.points` (canónico) sube y que la UI lo
     refleja sin recargar.
  4. Intentar reclamar la misma recompensa dos veces → debe rechazar
     (idempotencia).

- [ ] **RS-4 — Reporte → resolución admin** *(ver §15.2)*

  1. Como usuario A, reportar un post de usuario B (`moderation.reportContent`).
  2. Como admin, ver el reporte en `moderation.adminListReports` /
     `adminGetReportDetail`.
  3. Resolverlo con `moderation.adminResolveReport` (acción: remover post o
     desestimar).
  4. Si se removió: confirmar que el post desaparece del feed de todos
     (`adminRemovePost`) y que queda registrado en
     `adminListModerationActions`.

- [ ] **RS-5 — Hilo + hashtag + mención** *(ver §15.2)*

  1. Crear un post con un `#hashtag` y una `@mención` de otro usuario en el
     texto.
  2. Confirmar que `hashtags.attachHashtags` lo indexa: buscar el tag vía
     `hashtags.getPostsByTag` y verlo en `hashtags.getTrendingTags`.
  3. Confirmar que `mentions.attachMentions` generó notificación al usuario
     mencionado (`activity.listActivity` de ese usuario).
  4. Responder al post (hilo) y confirmar que la respuesta queda anidada
     correctamente bajo el post original.

- [ ] **RS-6 — Watch-time mueve el ranking (`forYou` vs `recent`)** *(ver §15.2)*

  **Nota:** desde el 2026-08-18 el feed por defecto es **cronológico**
  (`getFeed` con `mode: 'recent'`, ver `social.ts:943-956`); `forYou` (el
  ranker `scorePost` con watch-time/conversión/afinidad/geo) solo se activa
  si el cliente lo pide explícito. Este flujo prueba `forYou`, no el default.

  1. Ver varios posts de video completos (watch-time alto) de un mismo
     autor/categoría vía `social.addView`.
  2. Pedir el feed con `mode: 'forYou'` y confirmar que ese contenido similar
     sube de posición respecto a pedir `mode: 'recent'` con los mismos posts.
  3. Confirmar que `mode: 'recent'` (el default real de la app) sigue
     estrictamente cronológico sin importar el watch-time.

- [ ] **RS-7 — Comunidad pública/privada (crear/unirse/aprobar/rechazar)** *(ver §15.2)*

  1. Crear una comunidad pública (`communities.createCommunity`,
     `isPrivate: false`) y otra privada.
  2. Con otro usuario, unirse a la pública (`joinCommunity`) → acceso
     inmediato.
  3. Con otro usuario, pedir unirse a la privada → queda en
     `listPendingRequests`, no tiene acceso todavía.
  4. Como admin/dueño de la comunidad, `approveMember` a uno y `rejectMember`
     a otro → confirmar accesos resultantes.
  5. `leaveCommunity` y `removeMember` → confirmar que se pierde el acceso.

- [ ] **RS-8 — Chat de comunidad** *(ver §15.2)*

  1. Desde una comunidad (pública o privada) con miembros aprobados, abrir su
     chat vía `communities.getOrCreateCommunityChat`.
  2. Enviar un mensaje y confirmar que todos los miembros aprobados lo ven.
  3. Confirmar que un usuario **no** miembro (o con solicitud pendiente) no
     puede acceder al chat.

- [ ] **RS-9 — Borradores, programados, guardados, mejores amigos** *(ver §15.3)*

  1. **Borrador → publicar ahora:** `drafts.saveDraft` → `drafts.listMyDrafts`
     → `drafts.publishDraftNow` → confirmar que aparece en el feed y el
     borrador desaparece de la lista.
  2. **Programado → cron lo publica solo:** `drafts.saveDraft` con fecha
     futura cercana → esperar al cron `internalPublishDueScheduled`
     (`drafts.ts:135`, ver `crons.ts` para el intervalo) → confirmar que se
     publica solo sin intervención manual.
  3. **Colección de guardados:** `social.toggleSavePost` sobre un post →
     `social.createSavedCollection` → `social.movePostToCollection` →
     `social.listMySavedCollections` / `getSavedPosts` reflejan el cambio.
  4. **Mejores amigos ocultan una historia:** `social.addCloseFriend` sobre
     un usuario → crear una story marcada solo-mejores-amigos → confirmar que
     el usuario agregado la ve y uno **no** agregado no la ve
     (`getStoriesForFollowing`).

- [ ] **RS-10 — Matching de eventos (swipe)** *(ver §15.3)*

  **Nota:** el deck de swipe usa `Gesture.Pan`/`GestureDetector` (primera vez
  en el repo) + haptics — **no se puede validar en web**, queda a cargo del
  usuario en dispositivo real (ver Fase 4 de este plan).

  1. **Opt-in:** `eventMatching.setMatchOptIn` para un evento con dos
     usuarios de prueba.
  2. **Swipe mutuo → match → chat automático:** ambos usuarios
     `eventMatching.swipe` con like mutuo sobre el otro → confirmar que
     aparece en `getMyMatches` y que se creó un chat automáticamente (ver si
     `swipe` dispara `getOrCreateDirectChat` internamente).
  3. **Opt-in rechazado sin entrada confirmada:** un tercer usuario sin
     entrada confirmada al evento intenta `setMatchOptIn` → debe rechazar.
  4. **Unmatch:** `eventMatching.unmatch` → confirmar que desaparece de
     `getMyMatches` de ambos usuarios.

- [ ] **RS-RANK — Ranking dual Feed/Loops** *(ver §15.4, E-085/E-086)*

  **Precondición dura:** `npx convex dev` corriendo con el schema/funciones
  nuevas deployadas (tablas `socialAuthorAffinity`/`socialTagAffinity`,
  campos `socialPosts.shareCount`/`quickSkipCount`/`totalLoopCount`/
  `loopsTier`).

  1. **"Para ti" es el default y mezcla, no es cronológico:** entrar al tab
     Social sin tocar nada → el sub-tab activo es "Para ti"; los posts NO
     deben salir estrictamente por fecha de subida.
  2. **"Siguiendo" es estrictamente cronológico** (guardia de regresión de
     E-080): tocar el sub-tab "Siguiendo" → orden = fecha de subida, sin
     excepciones.
  3. **Cold-start de Feed:** con una cuenta nueva/sin afinidad, publicar un
     post → debe aparecer en "Para ti" de otra cuenta en pocos scrolls (el
     caso exacto que E-080 había arreglado originalmente).
  4. **Completion/skip real en Loops:** mirar un video de Loops entero vs.
     salir a los 2 segundos → `social:debugScoreLoops` (`npx convex run
     social:debugScoreLoops '{"viewerUserId":"..."}'`) debe reflejar
     `avgCompletionPct`/`quickSkipCount` moviéndose acorde.
  5. **Compartir un Loop sube `shareCount`:** compartir un video por DM
     (`sharePostInChat`/`shareToUser`) → `shareCount` del post sube 1 y
     aparece en el desglose de `debugScoreLoops`.
  6. **Exploración de contenido nuevo:** publicar un video nuevo
     (`viewCount≈0`) → debe seguir apareciendo en Loops (vía slot de
     exploración) aunque no compita todavía por score. Correr a mano
     `npx convex run social:loopsTiering:internalGradeLoopsTier '{}'` tras
     juntar ≥200 vistas simuladas → el post debe recibir `loopsTier`.
  7. **"No me interesa" baja el score de ese autor:** en el tab Feed, marcar
     "No me interesa" sobre un post → `social:debugScoreFeed` debe mostrar
     ese autor con score visiblemente más bajo en la próxima corrida.

---

## 13. Riesgos conocidos (confirmados por grafo)

| Riesgo | Severidad | Fase que lo cierra |
|---|---|---|
| Guest checkout (CART-03) | CRÍTICO | Fase 4 |
| IDOR por `userId` del cliente | CRÍTICO | Fase 1 |
| Password hash reversible | CRÍTICO | Fase 2 |
| Carrito doble fuente de verdad | ALTO | Fase 3 |
| Pagos duplicados (respaldo) | ALTO | Fase 5 + 8d |
| Contextos con datos fake | ALTO | Fase 6 |
| Admin sin disputas/ban | ALTO | Fase 8a/8b |
| Tests rotos (JEST-01) | MEDIO | Fase 8c |
| App.tsx monolítico | MEDIO | Fase 7 |
| 201 comunidades finas en grafo | INFO | Pentest manual |

---

## 14. Estado final del proyecto (después de todo)

### 14.1 Qué vas a tener

Cuando completes los Bloques A → B → C → D, el proyecto **no será perfecto**, pero sí será un **producto production-ready** listo para operar en NY con dinero real.

| Dimensión | Estado final |
|---|---|
| **Seguridad** | 8/10 — auth server-side, sin IDOR conocido, pentest sign-off |
| **Arquitectura** | 8/10 — un solo camino por dominio, sin stubs, sin respaldo activo |
| **Pagos** | LIVE en producción — Stripe test validado → switch a `sk_live_` |
| **Operaciones** | Admin puede KYC, disputas, ban, stats |
| **Tests** | Constitution verde; suite principal con mocks |
| **Observabilidad** | Sentry + reconciliation cron + audit trail |
| **Legal** | Términos, privacidad, reembolsos publicados |
| **Grafo** | Actualizado y consultable para futuras features |

### 14.2 Qué podrás hacer

1. **Cobrar dinero real** en NY con tarjetas reales (post D4).
2. **Invitar usuarios** sin miedo a brechas obvias de auth o pagos.
3. **Operar el marketplace** — órdenes, escrow, disputas, retiros.
4. **Mostrar a inversores/partners** con arquitectura defendible y pentest.
5. **Escalar el equipo** — código modular, grafo para onboarding de devs.
6. **Agregar features** basadas en feedback de beta, no en suposiciones.

### 14.3 Qué NO habrá (y está bien)

- Microservicios (a menos que el tráfico lo exija después).
- “Cero bugs” (imposible; pero críticos cerrados).
- Escala nacional día 1 (soft launch NY primero).
- Casino/ruleta/tragamonedas (eliminado — solo arcade + puntos).

### 14.4 Arquitectura final

```
USUARIOS (NY, soft launch)
        │
        ▼
   EXPO APP (stores)
        │  queries/mutations/actions individuales
        ▼
   CONVEX (puerta única, auth estricta)
        │
        ├── marketplace (listings, cart, map, reviews)
        ├── orders (escrow, disputes, history)
        ├── payments LIVE (stripe, finance, connect)
        ├── social (feed, stories, DMs)
        ├── gamification (economy, games, points)
        └── admin (KYC, ban, disputas, stats)
        │
        ▼
   STRIPE LIVE · RESEND · IAP · SENTRY
```

### 14.5 Flujo de negocio final (compra real)

```
Registro/Login (auth server-side)
  → Browse marketplace / mapa
  → Agregar al carrito (Convex cart)
  → Checkout (solo autenticados)
  → Stripe PaymentIntent (LIVE)
  → Webhook confirma pago
  → Orden creada (escrow: held)
  → Vendedor envía → entregado
  → Escrow released (cron o confirmReceipt)
  → Fondos en wallet vendedor
  → Retiro (KYC + balance)
```

### 14.6 Métricas de éxito del plan

| Métrica | Target |
|---|---|
| Vulnerabilidades Critical/High abiertas | 0 |
| CART-03 reproducible | No |
| Flujo pago E2E (live $1) | OK |
| Beta testers sin incidentes P0 | 2+ semanas |
| `graphify update` post-release | Rutina establecida |
| Tiempo onboarding dev nuevo | < 1 día con grafo |

### 14.7 Después del launch (mes 2+)

Solo cuando tengas **usuarios y métricas reales**:

1. Convex Components (partir `schema.ts`).
2. Microservicio de pagos/compliance (detrás de `actions`, si compliance lo exige).
3. Optimización performance (Convex performance audit).
4. Expansión geo (fuera de NY).
5. Features nuevas priorizadas por datos.

---

## 15. Tablero de progreso por fase

> **Regla:** actualizar esta tabla al **cerrar cada fase**, al **encontrar un bloqueante**, o cuando el usuario pida *"actualizar el plan"*.

| Fase | Nombre | Estado | % | Bloqueante actual | Última actualización |
|---|---|---|---|---|---|
| **1** | Auth server-side estricto | ✅ Cerrada | 100% | — | 2026-07-13 |
| **1b** | Depuración + interconexión (sprint extra) | ✅ Cerrada | 100% | — | 2026-07-13 |
| **2** | Passwords reales (bcrypt) | ✅ Cerrada | 100% | — | 2026-07-13 |
| **3** | Carrito unificado | 🟡 Código listo | 95% | QA manual diferida a §12.4 (no bloquea Fase 4+) | 2026-07-13 |
| **4** | Guest checkout (CART-03) | 🟡 Código listo | 95% | QA manual diferida a §12.4 (no bloquea Fase 5+) | 2026-07-13 |
| **5** | Pagos TEST un camino | 🟡 Código listo | 95% | Push Convex + secrets TEST (usuario) + QA manual §12.4 | 2026-07-13 |
| **6** | Contextos stub → Convex | ✅ Cerrada | 100% | — | 2026-07-13 |
| **7** | Limpieza App.tsx | ✅ Cerrada | 100% | — | 2026-07-14 |
| **8a** | Admin disputas (ADSP-02) | ✅ Cerrada | 100% | — | 2026-07-14 |
| **8b** | Admin ban (AUSR-03) | ✅ Cerrada | 100% | — | 2026-07-14 |
| **8c** | Tests Jest (JEST-01) | ✅ Cerrada | 100% | — | 2026-07-14 |
| **8d** | Limpiar respaldo pagos | ✅ Cerrada | 100% | — | 2026-07-14 |
| **S1** | Sprint 1 (Roles y KYC Front-end) | ✅ Cerrada | 100% | — | 2026-07-21 |
| **S2** | Sprint 2 (Módulo de Negocios) | ✅ Cerrada | 100% | — | 2026-07-23 |
| **S3** | Sprint 3 (Módulo de Influencers) | ✅ Cerrada | 100% | — | 2026-07-23 |
| **S4** | Sprint 4 (Gamificación y Dashboard) | ✅ Cerrada | 100% | — | 2026-07-23 |
| **S5** | Sprint 5 (Correcciones UI/Lógica) | ✅ Cerrada | 100% | — | 2026-08-12 |
| **SEC-1** | Hardening: funciones dev/seed públicas → internal + IDOR dashboard | ✅ Cerrada | 100% | — | 2026-08-15 |
| **RS-1** | Red social + social commerce (integración completa) | 🟡 Código listo | 90% | Deploy Convex (`commerce.js` no está en el deployment) + QA runtime §12.4 | 2026-08-15 |
| **RS-2** | Fase 0 — Fundaciones de seguridad social (ban efectivo, puntos server-authoritative, unificación de saldo, rate limit) | ✅ Cerrada | 100% | — | 2026-08-18 |
| **RS-3** | Fase 1 — Consolidación feed + performance (`useSocialFeed`, FlashList, media resolver memoizado) | 🟡 Código listo | 90% | Falta deploy + QA runtime; sin medición real de FPS/lecturas (no se corrió la app) | 2026-08-18 |
| **RS-4** | Fase 2 — Moderación base (reportes, mute, ocultar, filtro de palabras, shadowban/suspensión, cola admin) | 🟡 Código listo | 90% | Falta deploy + QA runtime | 2026-08-18 |
| **RS-5** | Fase 3 — Gamificación social (`sp_post`/`sp_cmt`/`sp_story`/`sp_community_join`/hito de 10 likes, clawback al borrar) | 🟡 Código listo | 90% | Falta deploy + QA runtime | 2026-08-18 |
| **RS-6** | Fase 4 (MUST) — Hilos, quote-repost, hashtags+trending, menciones, bandeja de Actividad, watch-time signal | 🟡 Código listo | 80% | Falta deploy + QA runtime; SHOULD/COULD del tier (colecciones, close friends, drafts, sonidos, analytics extendido) **no implementados** | 2026-08-18 |
| **RS-7** | Fase 5 — Ranker v2 (watch-time, conversión comercial, "no me interesa", anti-repetición, cap de diversidad por autor) | 🟡 Código listo | 90% | Falta deploy + QA runtime | 2026-08-18 |
| **RS-8** | Fase 6 — Comunidades Comerciales (crear/unirse/aprobar, feed y catálogo de comunidad, chat vía `social/dm.ts`) | 🟡 Código listo | 80% | Falta deploy + QA runtime. `communityAgreements`/convenios de comisión cruzada **eliminados del alcance del producto** (no es un pendiente, ver E-087) | 2026-08-20 |
| **RS-9** | Fase 7 — Extras SHOULD (pinned, poll UI, alt-text, colecciones, close friends, borradores/programación) | 🟡 Código listo | 85% | Falta deploy + QA runtime; sonidos reutilizables y link preview cards **no implementados** (ver §15.3) | 2026-08-18 |
| **RS-10** | Fase 8 — Eventos + Matching ("Tinder interno") | 🟡 Código listo | 85% | Falta deploy + QA runtime; requiere datos reales de `eventReservations` para probar el gateo por entrada confirmada | 2026-08-18 |
| **RS-RANK** | Ranking dual Feed (X/Instagram-style)/Loops (TikTok-style): afinidad graduada, `scoreLoop` por tasas, exploración/graduación por etapas, instrumentación real de watch-time | ✅ Código listo (deployado a dev) | 95% | QA runtime §12.4 sin ejecutar (mismo bloqueante de herramientas de navegador que E-083); prod pendiente de deploy | 2026-08-20 |
| **UX-FEED** | Refactor UX/UI del feed + afordancia de compra nativa (Fase B del plan "Feed + Comunidades estilo X") | 🟡 Código listo | 90% | QA runtime en dispositivo pendiente (perf Android gama media). **No bloqueado por E-093**: es cliente puro | 2026-08-24 |
| **COM-BACK** | Comunidades — schema + backend (3 estados de privacidad, invitaciones, cuestionario, solicitudes, timeline unificado) | 🟡 Código listo | 90% | Desplegado a **dev**; falta prod + QA runtime. Migraciones `recountCommunityMembers` / `backfillCommunitySlugs` sin correr | 2026-08-24 |
| **COM-FEED** | Comunidades en el feed — `FeedTabBar` data-driven, tab "Comunidades", tabs por comunidad fijada | 🟡 Código listo | 90% | QA runtime del timeline con fan-out (cap 15 comunidades/página) | 2026-08-24 |
| **COM-DIR** | Directorio y buscador de comunidades (rediseño de `CommunitiesScreen`, filtro por tema, cards) | 🟡 Código listo | 90% | QA runtime; verificar que una comunidad `secret` no aparezca en ninguna rama | 2026-08-24 |
| **COM-ADMIN** | Panel de admin — visibilidad, política de ingreso, editor de cuestionario, links de invitación, cola de solicitudes con respuestas | 🟡 Código listo | 90% | QA runtime de la matriz 3×4 (visibilidad × estado de invitación) | 2026-08-24 |
| **COM-LINKS** | Deep linking de comunidades — resolver extraído y testeado, handler, modal de ingreso con wizard | 🟡 Código listo | 75% | 🔴 **Faltan el Apple Team ID y el SHA-256 de release** en `public/.well-known/`: hasta reemplazarlos los universal links NO se verifican y `https://` abre el navegador. Ver `docs/DEEPLINKS.md` | 2026-08-24 |

| **CLI-UI** | Requerimientos del cliente — marca (ícono, splash, componente `Logo`) y navegación (R Coins → Home, back de Android, X del menú, visor de foto de perfil) | 🟡 Código listo | 90% | QA en dispositivo: ícono/splash en launcher redondo, back desde R Coins, cierre del menú con el pulgar. El ícono es un upscale 2.5× del isotipo 413×399 (decisión del usuario): reemplazar el fuente y recorrer el script si aparece uno en alta | 2026-08-24 |
| **CLI-ECO** | Requerimientos del cliente — reglas de R Coins unificadas en fuente única, ruleta visual, arcade alcanzable, R Coins de la mascota visibles | 🟡 Código listo | 90% | QA runtime: que la rueda frene en el gajo del premio del servidor y que el segundo giro del día diga "vuelve mañana". Los montos ya coincidían entre servidor y términos; lo que estaba mal era el frontend (ver E-102) | 2026-08-24 |
| **CLI-KYC** | Requerimientos del cliente — verificación por email, seguridad de OTP, unificación de gates de KYC, validación de teléfono | 🟡 Código listo | 90% | Desplegado a **dev**; falta **prod** (el borrado de `/kyc-webhook` sólo cierra el agujero al desplegar). QA manual: registro sin verificar + reinicio de app, y 4 pedidos de código seguidos. SMS fuera de alcance por decisión del usuario | 2026-08-25 |
| **CLI-CAT** | Requerimientos del cliente — categorías Barbería y Gimnasio | ✅ Cerrada | 100% | — | 2026-08-24 |
| **CLI-PUB** | Requerimientos del cliente — flujo de **publicar**: doble publicación, fotos al editar, fecha de eventos, validaciones de precio/stock, formulario huérfano | 🟡 Código listo | 90% | Desplegado a dev; falta prod + QA en dispositivo (doble tap, editar sin perder fotos, precio vacío y stock -5 rechazados) | 2026-08-25 |
| **CLI-COMP** | Requerimientos del cliente — flujo de **comprar**: descuento de stock, dirección de envío, máquina de estados, carrito de invitado, back-link de pago, idempotencia del webhook, reconciliación | 🟡 Código listo | 90% | Rama `integrate/stripe-connect-rewrite` trae la ruta `/stripe-webhook-test` (modo test real de Stripe, no simulado) — el gap "el webhook no se ejercita nunca" queda resuelto en código, pero **todavía no se corrió el circuito end-to-end** (falta cargar env vars nuevas y hacer el QA runtime real, ver E-136). No mergeado a `main` todavía | 2026-09-02 |
| **CLI-LEGAL** | Requerimientos del cliente — términos completados (tabla íntegra de R Coins, comisión 10%, cargo de gestión, plazo de devolución) | 🟡 Código listo | 95% | Falta revisión legal. Plazo alineado a 10 días hábiles con la cláusula de congelamiento del conteo al abrir un reclamo; **la lógica que implementa ese congelamiento es de la Parte 2** y todavía no existe | 2026-08-25 |
| **CLI-STRIPE** | Requerimientos del cliente — Parte 2 completa (comisión 10%, escrow, devoluciones, liquidaciones, Connect, panel financiero, QA en Test Mode) | 🟡 Desplegado, en QA runtime | 75% | Mergeado a `main` y desplegado (E-136): Stripe Connect bi-modal completo — escrow sin fallback mock, payout a influencers, refunds automáticos, tests. Resuelve 6 de los 8 gaps de `docs/ARQUITECTURA_STRIPE_CONNECT_SPLIT.md`. El primer QA runtime encontró y cerró E-137 (el onboarding de Connect estaba **bloqueado**: se pedía una capability no solicitable). Claves live y `STRIPE_SECRET_KEY_TEST` ya cargadas en Convex. Pendiente: destinos de webhook de **test** en el Dashboard de Stripe (`STRIPE_WEBHOOK_SECRET_TEST` hoy tiene el valor del de live, `STRIPE_WEBHOOK_SECRET_THIN_TEST` no existe), migración del cursor de reconciliación, y el E2E completo (onboarding → checkout → webhook → escrow release → payout) | 2026-09-02 |

**Leyenda:** ✅ Cerrada · 🟡 En curso · 🔴 Bloqueada · ⚪ Pendiente

### 15.1 Fase RS-1 — Red social y social commerce (2026-08-15)

Implementa `docs/DISEÑO_RED_SOCIAL_COMMERCE.md`. El backend social ya existía
(41 funciones en `convex/social.ts`: feed rankeado con cursor, stories, DMs,
follows, likes); lo que faltaba era **el commerce real** y **el cableado del
frontend**.

**Backend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.1 | `convex/commerce.ts` nuevo: `claimFromPost`, `getPostCommerceOffer`, `getPostAnalytics`, `getCreatorCommerceDashboard`, `getMySocialPurchases` + internals | Archivo creado, typecheck 0 errores |
| RS.2 | Tabla `socialPostSales` (atribución/analytics por post) + 5 índices | `convex/schema.ts` |
| RS.3 | `socialPosts.commercialProduct.discountPercent` para el "% OFF" del CommerceTag | `convex/schema.ts`, `social.createPost` |
| RS.4 | Webhook Stripe enruta `metadata.socialPostId` → `internalFulfillSocialSale` (orden + escrow `held`); `payment_failed` devuelve puntos | `convex/http.ts` |
| RS.5 | `social.simulateSocialCommercePayment` desactivado (lanza error) — movía plata parcheando `users.balance`, sin Stripe/orden/escrow, y leía el campo de puntos equivocado | `convex/social.ts` |
| RS.6 | Comisión del creador **no se inventa**: se resuelve con el motor existente `campaigns.internalResolveCartAttribution` vía `referralCode` (campaña activa → openPromotion → whitelist) | `commerce.claimFromPost` |
| RS.7 | Un solo camino de pago (regla Fase 5): `claimFromPost` reusa `stripe.createPaymentIntent` | `convex/commerce.ts` |

**Frontend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.8 | `OneClickCheckoutSheet` paga de verdad (`claimFromPost` + confirm Stripe). Antes decía literal "Simular Pago" | `src/components/social/OneClickCheckoutSheet.tsx` |
| RS.9 | `CommerceTag` extraído (variantes `full`/`compact`, lidera con "% OFF") — el diseño lo pedía y no existía | `src/components/social/CommerceTag.tsx` |
| RS.10 | Bug: `PostCard` construía el `<VideoView>` sin `return` → **los videos nunca renderizaban** | `PostCard.tsx` |
| RS.11 | Bug: `PostCard` leía `commercialProduct.imageUrl`, el backend guarda `image` | `PostCard.tsx` |
| RS.12 | Bug: `UnifiedFeed` leía `likesCount`/`commentsCount`, el backend devuelve `likeCount`/`commentCount` → contadores siempre en 0 | `UnifiedFeed.tsx` |
| RS.13 | `UnifiedFeed` reescrito: paginación por cursor real, refresh real, prop `authorUserId`, modal de comentarios, impresiones (`addView`) | `UnifiedFeed.tsx` |
| RS.14 | `HybridProfileScreen` pasaba `<UnifiedFeed />` sin props → todo perfil mostraba el feed global | `HybridProfileScreen.tsx` |
| RS.15 | `LoopItem`: like era `useState` local (llamada comentada), "Seguir" no tenía `onPress`. Ahora `toggleLike` optimista + `SocialFollowButton` + `addView` | `LoopItem.tsx` |
| RS.16 | `SocialContext` **eliminado**: era 100% no-op y `SocialProvider` nunca se montó en `App.tsx`. Sus 5 consumidores rewireados a Convex | `CreatePost`, `CreateInstagramPost`, `InstagramPost`, `UserProfile`, `OrderDetailScreen` |
| RS.17 | `UserProfile`: siempre renderizaba "Usuario no encontrado" y violaba Rules of Hooks (`useQuery` tras un `return` condicional) | `UserProfile.tsx` |
| RS.18 | `generateUploadUrl({})` sin `sessionToken` en `CreatePost`/`CreateInstagramPost` → subida de imagen rota antes incluso del stub | ambos archivos |
| RS.19 | `CreatorEarningsPanel` — "cuánta plata me dio cada post" (§4.3 del diseño), montado como tab **Ingresos** del perfil propio | `CreatorEarningsPanel.tsx`, `HybridProfileScreen.tsx` |
| RS.20 | `types.ts` con las formas reales del feed (antes `Post = any`, por eso los renames fallaban en silencio) | `src/components/social/types.ts` |

**Verificación corrida ✅**

- `npx.cmd tsc --noEmit -p tsconfig.check.json` → **0 errores**
- `npm.cmd run test:constitution` → **5 suites, 33 tests, todos verdes**
- `npx.cmd convex codegen` → OK (`commerce` registrado en `api.d.ts`)
- `py -3.11 -m graphify update .` → 4374 nodos, 8298 edges, 438 comunidades

**Pendiente ❌ (bloquea el cierre de RS-1)**

- [ ] **Deploy a Convex.** `npx convex function-spec` confirma que el deployment
      `academic-lapwing-311` **no tiene `commerce.js`** (y todavía tiene los
      archivos borrados en SEC-1: `clearDatabase`, `debug`, `temp`, `testMock*`,
      `testQuery`). `convex codegen` genera tipos locales, **no deploya**.
      → Correr `npx convex dev` (o `deploy`) para publicar `commerce.ts`, la
      tabla `socialPostSales` y el nuevo `http.ts`.
- [ ] **QA runtime** — ver [§12.4 RS-1](#124-checklist-final--validación-manual-en-runtime-post-desarrollo).
- [ ] **E2E de pago real** — depende además de la
      [Tarea final Fase 5](#tarea-final-fase-5--push-convex-y-secrets-test)
      (`sk_test_`, `whsec_`, webhook → `/stripe-webhook`). Sin eso
      `claimFromPost` solo corre en modo mock.

### 15.2 Fases RS-2 a RS-9 — Cierre del módulo social (Fases 0–6, 2026-08-18)

Continuación de RS-1. Cubre desde la fundación de seguridad hasta comunidades
comerciales, en el orden `F0 → F1 → F2 → F3 → F4(MUST) → F5 → F6`. **F7
(extras SHOULD) y F8 (Eventos+Matching) quedan fuera de este corte**, F8 por
decisión explícita del usuario (matching se hace al final).

**Backend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.21 | Motor único de puntos `convex/economy/pointsEngine.ts`: idempotencia + tope diario por `eventKey` (`kind:día:entidad`), sin índices nuevos (range query sobre `by_user_event`) | Archivo nuevo |
| RS.22 | `economy.addPoints` (pública, monto del cliente) **eliminada** → `economy.claimReward({kind, refId})` contra `REWARD_CATALOG` server-side | `convex/economy.ts` |
| RS.23 | `points.syncPointsState` / `points.addLedgerEntry` / `points.saveGameScore` **eliminadas** (sin callers, mismo agujero) | `convex/points.ts` |
| RS.24 | Ban efectivo en los dos caminos de auth: `getActorOrNull` chequea `isBanned` tanto en sesión servidor como en `ctx.auth` (OAuth); `revokeAllSessions` centralizado en `writeUserIdentity` | `convex/authHelpers.ts`, `convex/users/identity.ts` |
| RS.25 | `assertSocialActor` real: bloquea `suspended`, deja pasar `shadowbanned` (invisible para terceros vía `decoratePosts`, visible para sí mismo) | `convex/social/_helpers.ts` |
| RS.26 | Rate limiting social por acción (`createPost`, `addComment`, `toggleLike`, `follow`, `createStory`, `report`, `createCommunity`, `joinCommunity`) | `convex/social/_helpers.ts` |
| RS.27 | Migración `pointsUnification`: canónico = `rewardsState.points`; `pointsState` retirado a lápida (`dryRun` reporta divergencias antes de aplicar) | `convex/migrations/pointsUnification.ts` |
| RS.28 | Moderación completa: `socialReports`, `socialMutes`, `socialHiddenPosts`, `moderationTerms`, `moderationActions` + filtro de texto (`moderationText.ts`) + auto-escalada a 3+ reportes | `convex/social/moderation.ts`, schema |
| RS.29 | Gamificación social: `sp_post`/`sp_cmt`/`sp_story`/`sp_community_join`/hito de 10 likes, con clawback si se borra dentro de 24h o si un admin remueve el contenido | `convex/social/gamification.ts` |
| RS.30 | Hilos (`parentPostId`/`rootPostId`/`replyCount`) + quote-repost (`quotedPostId`) + respuestas de comentario a 1 nivel (aplanado del 2°) | `convex/schema.ts`, `convex/social.ts` |
| RS.31 | Hashtags (`socialPostTags`/`socialTagStats`, trending por cron horario) + menciones (`socialMentions`, resueltas contra `users.by_username`) | `convex/social/hashtags.ts`, `convex/social/mentions.ts` |
| RS.32 | Bandeja de Actividad real (`socialActivity`, agrupada por `groupKey` para no explotar en posts virales) — reemplaza el hueco de `pushDeliveries` (que no sirve como feed) | `convex/social/activity.ts` |
| RS.33 | Ranker v2: watch-time (`avgCompletionPct` incremental en `addView`), conversión comercial (`salesCount`), penalización "no me interesa" y "ya visto", cap de diversidad (máx. 2 posts/autor por página) | `convex/social.ts` (`scorePost`, `getFeed`) |
| RS.34 | `decoratePosts`: resolver de media memoizado por request (`createMediaResolver`) + filtro de moderación (mute/oculto/shadowban) antes de decorar | `convex/mediaUrl.ts`, `convex/social.ts` |
| RS.35 | Comunidades Comerciales: crear/actualizar/unirse (pública directa, privada `pending`)/aprobar/rechazar/salir/roles, feed de comunidad (nunca en el feed global), catálogo compartido (`communityListings`), chat vía `socialChats.communityId` reusando `social/dm.ts` | `convex/social/communities.ts` |
| RS.36 | 2 crons nuevos: `expire-social-suspensions` (diario), `recompute-tag-stats` (horario) | `convex/crons.ts` |

**Frontend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.37 | `useSocialFeed` — paginación por cursor unificada (antes duplicada en `UnifiedFeed`/`SocialScreen`/`LoopFeed`) | `src/hooks/useSocialFeed.ts` |
| RS.38 | `UnifiedFeed` migrado de `FlatList` a `FlashList` (instalada, sin usar); watch-time enviado al SALIR de cada post | `src/components/social/UnifiedFeed.tsx` |
| RS.39 | `PostActionsSheet` + `ReportModal`: reportar / silenciar / "no me interesa", enganchados al botón "⋯" de `PostCard` | `src/components/social/PostActionsSheet.tsx`, `ReportModal.tsx`, `PostCard.tsx` |
| RS.40 | `ActivityScreen` (tabs Todo/Menciones/Ventas, marca leído al entrar) | `src/screens/social/ActivityScreen.tsx` |
| RS.41 | `CommunitiesScreen` / `CreateCommunityScreen` / `CommunityDetailScreen` (feed/catálogo/miembros/solicitudes, entrada al chat) | `src/screens/social/*.tsx` |
| RS.42 | `AdminModerationScreen` (cola de reportes + resolución + filtro de palabras), enlazada desde `AdminDashboardScreen` (tab Seguridad) | `src/screens/admin/AdminModerationScreen.tsx` |
| RS.43 | Entradas de Comunidades/Actividad (con badge de no-leídos) en el header de `SocialScreen` | `src/screens/SocialScreen.tsx` |
| RS.44 | 6 pantallas nuevas registradas en `App.tsx` | `App.tsx` |

**Verificación corrida ✅**

- `npx.cmd convex codegen` → **exit 0**, sin errores de schema/funciones (typecheck de Convex incluido)
- `npx.cmd tsc --noEmit` → **0 errores nuevos** (baseline preexistente `HomeScreen.tsx` `Haptics` sin importar **resuelto el 2026-08-18** en reanálisis del plan, ver E-073; `testID` en tipos web sigue sin tocar en este corte)
- `npx.cmd jest` → **10 suites, 45 tests, todos verdes** (incluye `constitution.test.tsx`)
- 2 bugs propios detectados y corregidos en revisión antes de cerrar (ver E-071, E-072 en §16): paginación truncada por filtrar después de `.take()`, y `eventKey` de clawback con la fecha equivocada.

**Pendiente ❌ (bloquea el cierre de RS-2…RS-8)**

- [ ] **Deploy a Convex** (`npx convex dev`/`deploy`) — sigue abierto desde RS-1 (E-061).
- [ ] **Correr la migración** `migrations/pointsUnification:unifyPoints` (`dryRun` primero, revisar `divergences`, después `chain: true`) y confirmar `unifyPointsStatus.pendingRows === 0`.
- [ ] **QA runtime** de los 7 flujos: ban por OAuth, reclamo de recompensa, reporte→resolución admin, hilo+hashtag+mención, watch-time moviendo el ranking, comunidad pública/privada, chat de comunidad.
- [ ] **No se corrió la app** — el rendimiento real de FlashList y el comportamiento del ranker en producción quedan sin medir hasta la QA runtime.
- [x] ~~`communityAgreements` (convenios de comisión cruzada entre miembros de una comunidad)~~ — **eliminado por completo del alcance del producto** (2026-08-20, ver §15.4/E-087): las comunidades no reparten comisiones entre miembros, sólo compiten por vender más dentro de un nicho compartido.

### 15.3 Fases RS-9 y RS-10 — Extras SHOULD + Eventos y Matching (2026-08-18)

Cierra el resto del roadmap social: lo que había quedado explícitamente diferido en §15.2 (extras SHOULD y Fase 8) se completó en la misma sesión a pedido del usuario ("no frenes, desarrollar por completo").

**Backend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.45 | `createPost` refactorizado: `createPostArgsValidator` (validador compartido) + `createPostImpl` (función plana) — necesario para que borradores/programados publiquen por el MISMO camino que una publicación en vivo, con sus mismos hashtags/menciones/gamificación/filtro de texto | `convex/social.ts` |
| RS.46 | Borradores y programación: `socialPostDrafts` (tabla aparte de `socialPosts` a propósito — ver comentario de cabecera del archivo), `saveDraft`/`updateDraft`/`listMyDrafts`/`deleteDraft`/`publishDraftNow`, cron cada 5 min `internalPublishDueScheduled` | `convex/social/drafts.ts` |
| RS.47 | Posts fijados: `socialUsers.pinnedPostId` + `pinPost`/`unpinPost`, `getPostsByUser` los ordena primero | `convex/social.ts` |
| RS.48 | Alt-text: `socialPosts.imageAlts` + arg en `createPost` — sin UI de carga todavía (ver pendientes) | `convex/schema.ts`, `convex/social.ts` |
| RS.49 | Colecciones de guardados: `socialSavedCollections` + `socialSavedPosts.collectionId`, `createSavedCollection`/`listMySavedCollections`/`deleteSavedCollection`/`movePostToCollection`; `getSavedPosts` extendido con filtro por colección **usando el índice correcto según el caso** para no repetir el bug de paginación de RS.71 | `convex/social.ts` |
| RS.50 | Close friends: `socialCloseFriends` + `socialStories.audience` ('everyone'/'close_friends'), `addCloseFriend`/`removeCloseFriend`/`listCloseFriends`; `getStoriesForFollowing` esconde las historias `close_friends` de quien no está en la lista | `convex/schema.ts`, `convex/social.ts` |
| RS.51 | Respuesta a historias con adjunto real: `'story'` sumado al union de attachments de DM + `shareStoryInChat`/`buildStoryAttachment` (el flujo existente en `StoryViewer.tsx` seguía funcionando con un prefijo de texto; se dejó sin migrar — ver pendientes) | `convex/social/dm.ts` |
| RS.52 | Encuestas: NINGUNA UI existía para `post.type === 'poll'` pese a que `votePoll` estaba completo y probado — sólo se guardaba el voto | `src/components/social/PostCard.tsx` (`PollCard`) |
| RS.53 | `commerce.getPostAnalytics` extendido con `avgCompletionPct`/`watchSampleCount`/`replyCount` (lectura directa, sin recalcular nada) | `convex/commerce.ts` |
| RS.54 | Matching de eventos completo: `convex/social/eventMatching.ts` — opt-in gateado por `eventReservations` confirmada/checked_in, candidatos con perfil espejo (nunca el perfil social real), swipe direccional sobre el `status` YA existente de `eventMatches` (sin agregar campo `direction`: `pending`/`matched`/`rejected` alcanza), match mutuo crea chat vía `dm.getOrCreateDirectChat`, ventana de 24h antes/después del evento, cron diario de limpieza | `convex/social/eventMatching.ts` |
| RS.55 | `socialActivity.type` y `ActivityType` suman el literal `'match'` | `convex/schema.ts`, `convex/social/activity.ts` |
| RS.56 | 2 crons nuevos: `publish-scheduled-posts` (cada 5 min), `cleanup-event-matching` (diario) | `convex/crons.ts` |

**Frontend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RS.57 | Botón "Borrador" junto a "Publicar" en el creador de posts | `src/components/social/CreatePost.tsx` |
| RS.58 | `MyDraftsScreen` (listar, publicar ahora, eliminar) | `src/screens/social/MyDraftsScreen.tsx` |
| RS.59 | `SavedPostsScreen` — **no existía NINGUNA pantalla** para ver posts guardados pese a que `toggleSavePost`/`getSavedPosts` ya se usaban en `Post.tsx`; suma tabs de colección | `src/screens/social/SavedPostsScreen.tsx` |
| RS.60 | `SocialPrivacyScreen` (silenciados / ocultos / mejores amigos en un solo lugar), enlazada desde `PrivacySecurityScreen` | `src/screens/social/SocialPrivacyScreen.tsx` |
| RS.61 | Toggle "Mejores amigos" al publicar una historia | `src/components/social/CreateStory.tsx` |
| RS.62 | "Fijar en mi perfil" en el menú "⋯" del post (propio) | `src/components/social/PostActionsSheet.tsx` |
| RS.63 | `EventMatchingScreen` — deck de swipe con `react-native-gesture-handler`/`react-native-reanimated` (**primer uso de `Gesture.Pan`/`GestureDetector` en el repo** — no había precedente, quedó validado sólo por `tsc`, no ejecutado) | `src/screens/social/EventMatchingScreen.tsx` |
| RS.64 | Entrada "Conocé gente en este evento" en `ItemDetailScreen` para listings tipo `event` | `src/screens/ItemDetailScreen.tsx` |
| RS.65 | 5 pantallas nuevas registradas en `App.tsx`, 2 entradas nuevas en `SidebarMenu` | `App.tsx`, `src/components/SidebarMenu.tsx` |

**Verificación corrida ✅**

- `npx.cmd convex codegen` → **exit 0** tras cada tanda de cambios (se corrió varias veces durante la sesión, no sólo al final)
- `npx.cmd tsc --noEmit` → **0 errores nuevos** en cada corte; 2 errores propios detectados y corregidos en el camino (un `ctx.db.get` mal tipado en el cron de borradores por no normalizar el id, un `q` sin anotar en el `createPostImpl` extraído)
- `npx.cmd jest` → **10 suites, 45 tests, todos verdes**, sin cambios en la suite existente

**Pendiente ❌**

- [ ] **Deploy a Convex** y **correr la migración de puntos** — sigue siendo el mismo bloqueante de RS-1/RS-2.
- [ ] **QA runtime completo** de: borrador → publicar ahora, post programado → el cron lo publica solo, colección de guardados, mejores amigos ocultando una historia, swipe → match → chat creado, opt-in de matching rechazado sin entrada confirmada.
- [ ] **No se probó el deck de swipe en un dispositivo real** — es la primera vez que el repo usa la API de gestos de Reanimated 3/4; `tsc` no detecta problemas de runtime de gestos.
- [ ] **Sonidos reutilizables** (`socialSounds`) y **link preview cards** (`socialLinkPreviews`) — explícitamente NO implementados: pedían, respectivamente, una UI de edición de audio y una `action` con fetch externo + parseo de HTML, y el costo relativo a su valor no cerraba dentro de esta sesión.
- [ ] **UI de carga de alt-text** en el creador de posts — el campo y el render ya existen, falta el input para que el usuario lo escriba.
- [ ] **Migración de `StoryViewer.tsx`** al nuevo `shareStoryInChat` con adjunto real — el flujo viejo (prefijo de texto) sigue andando y no se tocó para no arriesgar una regresión.
- [x] ~~`communityAgreements`~~ — eliminado del alcance del producto, ver §15.2/§15.4/E-087.

### 15.4 Ranking dual — Feed (X/Instagram) y Loops (TikTok/Reels) (2026-08-20 — E-085/E-086)

Diseñado en sesión de Plan Mode dedicada (dos Explore agents + un Plan agent,
plan aprobado por el usuario) y ejecutado íntegro en la misma sesión.
Decisiones de producto del usuario: (1) el Feed se alinea con cómo funcionan
X/Instagram HOY — "Para ti" (algorítmico) es el default, revirtiendo E-080
a propósito; (2) Loops recibe "el modelo más completo... para aumentar la
viralización y la segmentación de contenido" — de ahí el mecanismo de
exploración/graduación por etapas, no sólo un score plano.

**Backend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RK.1 | `scorePost`/`scoreLoop`/`applyDiversityCap` extraídos a un módulo puro sin imports de Convex — testeables con Jest liso, sin runtime | `convex/social/scoring.ts` (nuevo) |
| RK.2 | `scorePost` v2: + término de velocidad de engagement normalizado por edad (usa `retweetCount`, sin usar hasta ahora), + afinidad graduada (reemplaza el `+25` plano de "¿le dio like alguna vez?") | `convex/social/scoring.ts` |
| RK.3 | `socialAuthorAffinity` — EMA persistida por (viewer, autor), media vida 14 días, cap 8.0, actualizada incrementalmente desde like/comentario/DM/watch-time≥80% (`bumpAuthorAffinity`) | `convex/schema.ts`, `convex/social.ts` |
| RK.4 | `getFeed` `mode:'forYou'` pasa a ser el DEFAULT (`args.mode ?? 'forYou'`, antes `'recent'`) — reversión explícita de E-080, documentada inline y en este plan | `convex/social.ts` |
| RK.5 | `scoreLoop` nuevo: scorer separado por TASAS (completion/like/comment/share/rewatch/quick-skip sobre `viewCount`), casi sin depender del grafo social a pedido explícito del usuario | `convex/social/scoring.ts` |
| RK.6 | `socialTagAffinity` — misma mecánica EMA, media vida 4 días, alimentada SOLO por eventos de Loops (nunca por likes del Feed) | `convex/schema.ts`, `convex/social.ts` |
| RK.7 | `getFeed` `mode:'videos'` ahora scorea in-place con `scoreLoop` + tags por post + diversity cap por hashtag de mayor afinidad (antes: orden cronológico puro) | `convex/social.ts` |
| RK.8 | Exploración/graduación por etapas ("bandit-lite"): `socialPosts.loopsTier`/`loopsTierDecidedAt`/`loopsTierCycles`, slots garantizados (20% de la página, menos-visto-primero) para posts sin tier, cron cada 2h que gradúa por percentil (top 30%/bottom 15% del lote) | `convex/social/loopsTiering.ts` (nuevo), `convex/crons.ts` |
| RK.9 | `addView` extendido: `watch[].quickSkip`/`loopCount`, contadores denormalizados `socialPosts.quickSkipCount`/`totalLoopCount`, dispara `bumpAuthorAffinity`/`bumpTagAffinityForPost` según el evento | `convex/social.ts` |
| RK.10 | `socialPosts.shareCount` real, incrementado en `buildPostAttachment` (cubre `sharePostInChat`/`shareToUser`, no `shareStoryInChat` — las historias no son posts) | `convex/social/dm.ts` |
| RK.11 | Afinidad de autor también sube al mandar un DM (2.5) — cubre `sendMessage`/`shareListingInChat`/`sharePostInChat`/`shareToUser`/`shareStoryInChat`, todos vía `deliverMessage` | `convex/social/dm.ts` |
| RK.12 | Migración `loopsTierBackfill`: videos existentes con `viewCount≥200` gradúan directo (no arrancan en 'exploring' el día del lanzamiento), mismo template dry-run/`chain:true` que `pointsUnification.ts` | `convex/migrations/loopsTierBackfill.ts` (nuevo) |
| RK.13 | Debug interno (NO público, lección de E-048): `social:debugScoreFeed`/`social:debugScoreLoops`, desglose término-por-término para un `viewerUserId` | `convex/social.ts` |

**Frontend — hecho ✅**

| # | Ítem | Evidencia |
|---|---|---|
| RK.14 | `SocialScreen` tab Feed migrado de query manual (sin ninguna señal de vista) a `<UnifiedFeed>` — ya trackea dwell/completion al salir de cada post y tiene el wiring de "No me interesa"/silenciar | `src/screens/SocialScreen.tsx` |
| RK.15 | Tab "Siguiendo" nuevo (antes no existía ningún cronológico visible), sub-tabs "Para ti"/"Siguiendo" | `src/screens/SocialScreen.tsx` |
| RK.16 | `UnifiedFeed`/`useSocialFeed` ganan `refreshKey`/`listHeaderComponent` — necesario para que `SocialScreen` le pase el header (StoriesBar + composer) y fuerce refresh al publicar | `src/components/social/UnifiedFeed.tsx`, `src/hooks/useSocialFeed.ts` |
| RK.17 | `UnifiedFeed` deja de tener fondo negro fijo (pensado sólo para video a pantalla completa) — ahora themeable, porque también sirve el tab Feed de texto/imagen en modo claro | `src/components/social/UnifiedFeed.tsx` |
| RK.18 | `LoopItem` manda completion/skip rápido/rewatch REALES del player (antes: una sola impresión al entrar, sin `watch`). Rewatch vía evento `playToEnd` del propio `expo-video` player (`loop:true`) — conteo exacto, no heurístico | `src/components/social/LoopItem.tsx` |

**Verificación corrida ✅**

- `convex/__tests__/socialScoring.test.ts` (nuevo, 15 tests) → **verde**: decay de recency, velocidad hot-vs-viejo, afinidad graduada y su cap, penalización "no me interesa"/ya-visto, completion/skip/shareRate>likeRate/afinidad-de-tag-negativa en Loops, diversity cap por clave y por autor, EMA con media vida.
- `npx convex dev --once` → **0 errores** (schema + 3 archivos nuevos + `social.ts`/`dm.ts` reescritos deployados a dev, tipos regenerados). Requirió excluir `convex/__tests__` del `convex/tsconfig.json` (usa globals de Jest que el typechecker de Convex no conoce).
- `npx tsc --noEmit -p tsconfig.check.json` → **0 errores** en todo el proyecto (backend + frontend).

**Pendiente ❌**

- [ ] **QA runtime** del checklist RS-RANK (§12.4, 7 pasos) — mismo bloqueante que E-083 (sin herramientas de navegador en esta sesión).
- [ ] **Deploy a prod** — sólo se deployó a dev en esta sesión.
- [ ] **Recalibración de constantes con datos reales**: los pesos de `scoreLoop` (`*1000` dentro de `log1p`, `EXPLORATION_SAMPLE_SIZE=200`, `EXPLORATION_SLOT_FRACTION=0.2`) son puntos de partida razonables, no derivados de datos — están documentados como tal en el código.
- [ ] **`salesCount` sin escritor real**: término de `scorePost` que hoy no puede ganar nada (siempre 0) — no bloquea, pero no se debe presentar como "ranking commerce-aware" completo hasta confirmar/ubicar el escritor real.
- [ ] Ver tabla de riesgos abiertos completa (cold-start, filter-bubble, shares/rewatch farming) en el plan de diseño original de esta fase.

---

## 16. Bitácora de ejecución (errores y soluciones)

> Cada agente **añade una fila** al terminar una sesión o al resolver un error. No borrar entradas; marcar como RESUELTO.

| ID | Fecha | Fase | Error / síntoma | Causa raíz | Solución aplicada | Estado | Referencia |
|---|---|---|---|---|---|---|---|
| E-001 | 2026-07-13 | 1 | Expo web: `Unable to resolve "fbjs/lib/invariant"` | `node_modules/fbjs` corrupto/vacío | `npm.cmd install fbjs@3.0.5` | ✅ Resuelto | `react-native-web` → AppRegistry |
| E-002 | 2026-08-12 | S5 | Errores de TypeScript: `absoluteFillObject`, tipos `any` implícitos | Código no compilaba tras reestructuraciones y migraciones parciales | Reemplazo `absoluteFillObject` por `absoluteFill`, refactor tipos en `ProductDetailScreen` y `PostCard` | ✅ Resuelto | Typecheck finalizado sin errores |
| E-002 | 2026-07-13 | 1 | Expo start: `lightningcss.win32-x64-msvc` not found | Binario nativo faltante en Windows | Instalación manual `lightningcss-win32-x64-msvc@1.27.0` | ✅ Resuelto | metro / nativewind |
| E-003 | 2026-07-13 | 1 | `typecheck`: miles de `TS1127 Invalid character` | Archivos con bytes nulos (corrupción disco/npm) | `git checkout` de `AddReviewModal.tsx`, `EscrowSheet.tsx`; reinstall `@react-native-async-storage` | ✅ Resuelto | src + node_modules |
| E-004 | 2026-07-13 | 1 | `test:constitution`: 2 suites fallan (Babel transform) | Jest/Babel no parseaba imports | Tras recuperar archivos, Jest parsea y ejecuta los tests; fallos semánticos separados en E-014 | ✅ Resuelto | `constitution.test.tsx` |
| E-005 | 2026-07-13 | 1 | `typecheck` interrumpido / sin reporte final | Sesión cortada; posible corrupción previa ya fixeada | Re-ejecutado; el comando terminó y reveló E-011 | ✅ Resuelto | `npm.cmd run typecheck` exit 2 |
| E-006 | 2026-07-13 | 1 | IDOR: `connect.ts` confiaba en `args.actorId` | Actions no usaban `requireActor` | Reescrito `assertSelfOrAdminAction` con `sessionToken` | ✅ Resuelto | `convex/connect.ts` |
| E-007 | 2026-07-13 | 1 | IDOR: `stripe.executePayout` sin auth | Action pública sin `requireActor` | Auth + `assertSelfOrAdmin` añadidos | ✅ Resuelto | `convex/stripe.ts` |
| E-008 | 2026-07-13 | 1 | IDOR: `payments/actions` aceptaba `userId` cliente | Fallback a `anonymous` | Identidad solo desde `requireActor` | ✅ Resuelto | `convex/payments/actions.ts` |
| E-009 | 2026-07-13 | 1 | Account takeover: `syncUser` emitía sesión por email | Sin verificar proveedor OAuth | Rechazar si `existing.password` existe | ✅ Resuelto | `convex/users.ts` |
| E-010 | 2026-07-13 | 1 | PowerShell bloquea `npm` | Execution policy en `npm.ps1` | Usar `npm.cmd` / `npx.cmd` en Windows | ✅ Workaround | Entorno Windows |
| E-011 | 2026-07-13 | 1 | Typecheck y constitution no pueden parsear contextos | 16 archivos de la migración frontend contenían bytes nulos | Restaurados desde `HEAD`; migración reaplicada y hecha idempotente; diffs vuelven a ser texto | ✅ Resuelto | `scripts/fase1-frontend-migrate.js` |
| E-012 | 2026-07-13 | 1 | Tres mutaciones públicas aún aceptaban `userId` sin auth | La migración inicial omitió `addPoints`, `claimDailyReward` y `updatePreferences` | Añadidos `sessionToken`, `requireActor` y `assertSelfOrAdmin`; frontend alineado | ✅ Resuelto | `convex/economy.ts`, `convex/userProfile.ts` |
| E-013 | 2026-07-13 | 1b | `npm.cmd run typecheck` termina con 212 errores | Deuda global: stubs, tipos Jest/deps, contratos frontend | `global.d.ts`, stubs tipados, RewardsContext restaurado, fixes puntuales | ✅ Resuelto | Fase 1b |
| E-014 | 2026-07-13 | 1b | `test:constitution`: 9 fallan, 1 pasa | RewardsContext sin constantes/API constitution v2 | Restaurado RewardsContext (git `7e89829`) + exports constitution + lógica arcade/wheel v2 | ✅ Resuelto | `RewardsContext.tsx` |
| E-015 | 2026-07-13 | 1 | `npx.cmd convex codegen` no puede ejecutarse | Falta `CONVEX_DEPLOYMENT` local | Configurar deployment con `npx.cmd convex dev` cuando corresponda; no bloquea web local | 🟡 Abierto | Entorno Convex |
| E-016 | 2026-07-13 | 1b | Cierre Fase 1 bloqueado por deuda transversal | Auth OK pero typecheck/constitution/stubs desconectados entre fases | Sprint **Fase 1b** ejecutado: typecheck + constitution verdes | ✅ Resuelto | §6 Fase 1b, §15 |
| E-017 | 2026-07-13 | 3 | `CartContext` no podía leer `sessionToken` con `useAuth()` | En App.tsx `CartProvider` envuelve a `AuthProvider` (orden de providers); regla de fase prohíbe tocar App.tsx | Puente `src/services/auth/sessionTokenStore.ts`: AuthContext publica el token y CartContext lo lee con `useSyncExternalStore` | ✅ Resuelto | `sessionTokenStore.ts` |
| E-018 | 2026-07-13 | 5 | Backend Convex sin deploy tras cambios Fase 5 | Usuario difiere push/deploy a tarea final | Código listo localmente; pendiente [Tarea final Fase 5](#tarea-final-fase-5--push-convex-y-secrets-test) + E2E §12.4 | 🟡 Abierto | §6 Fase 5, §15 |
| E-019 | 2026-07-13 | 6 | `typecheck`: `phoneNumber` no existe en retorno de `getUser` | `sanitizeUser` no expone `phoneNumber` | BusinessContext usa `''` (como `hooks/useBusiness.ts`); catálogo cableado a `createListing`/`updateListing` | ✅ Resuelto | `BusinessContext.tsx` |
| E-020 | 2026-07-21 | UI | `typecheck` falló tras reemplazo masivo de color branding (Violeta -> Azul) | `StyleSheet.absoluteFillObject` reportado faltante en types, y restos de comentarios ts-ignore | Script correctivo aplicó `absoluteFill`, removió ts-expects e id->label en PointsManager | ✅ Resuelto | `PointsManager.tsx`, `sheet.tsx`, `tokens.ts` |
| E-021 | 2026-07-21 | UI | RangeError en `tsc --noEmit` tras script de branding | `tsconfig.json` no excluía la carpeta `dist`, forzando a TS a analizar bundles minificados enormes. Errores sintácticos residuales (duplicated Radius, missing isDark). | Se añadió `dist` al exclude de `tsconfig.json`. Se corrigieron duplicados de Radius y variables en archivos de componentes. Todo compila. | ✅ Resuelto | `tsconfig.json`, `AnimatedCreditCard.tsx`, `PaymentSuccessBurst.tsx`, etc. |
| E-022 | 2026-07-21 | 5 | typecheck falló por colisiones de variables en EscrowSheet y typos en SidebarMenu | Script de migración reemplazó variables locales erróneamente y generó camelCase typos | Variable local renombrada a toneC; typos de backgroundColor corregidos | ✅ Resuelto | EscrowSheet.tsx, SidebarMenu.tsx |
| E-023 | 2026-07-21 | S1 | Deuda técnica mock emails | Reemplazar authEmailMocks con auth real vía Resend (Ponytail) | Integración de Resend en auth.ts, tabla users actualizada y borrado del mock | ✅ Resuelto | convex/auth.ts, AuthContext.tsx |
| E-024 | 2026-07-22 | UI | A navigator cannot contain multiple 'Screen' components with the same name ('BusinessForms') | Duplicado accidental del Screen `BusinessForms` en el `Stack.Navigator` | Eliminado el `<Stack.Screen name="BusinessForms">` sobrante | ✅ Resuelto | App.tsx |
| E-025 | 2026-07-22 | UI | La web abría directamente en Inicio como invitado en lugar de Bienvenida | `linking.config` en `App.tsx` mapeaba la ruta raíz `''` a la pantalla `Home` | Se cambió el mapeo de la ruta raíz `''` a `Welcome` y se asignó `home` a `Home` | ✅ Resuelto | App.tsx |
| E-026 | 2026-07-22 | API | Error confuso al cambiar contraseña si se repite la entrada | El backend comprobaba si la nueva contraseña era igual al *input* actual ANTES de verificar que la actual fuera correcta | Se movió la validación de la contraseña actual al inicio y se mejoró el mensaje de buenas prácticas de seguridad | ✅ Resuelto | convex/users.ts |
| E-027 | 2026-07-22 | UI | Faltan los botones de Google y Apple en WelcomeScreen | Los botones de autenticación social estaban omitidos en el renderizado | Se agregaron los botones de Google y Apple con sus estilos ya preparados | ✅ Resuelto | WelcomeScreen.tsx |
| E-028 | 2026-07-22 | UI | Título y logo de la pestaña de la web incorrectos en producción | El nombre `ramgos-mobile` era el predeterminado y el favicon usaba el logo rectangular gigante en lugar del icono cuadrado | Se configuró el nombre "Ramgos" y se cambió la ruta del favicon a `./assets/icon.png` en `app.json` | ✅ Resuelto | app.json |
| E-029 | 2026-07-22 | Flow | Redirección KYC obligatoria para negocios post-validación de email | Tras verificar el código por correo, las cuentas de negocio no eran enviadas obligatoriamente a subir documentación comercial y del dueño | Se configuró `VerificationScreen` y `resolveNextRoute` para redirigir directamente a `KYCScreen` en modo negocio | ✅ Resuelto | VerificationScreen.tsx, AuthContext.tsx |
| E-030 | 2026-07-22 | Flow | Redirección a Bienvenida tras borrar la cuenta | Tras eliminar la cuenta, se requería redirigir al usuario a la pantalla de Bienvenida (`Welcome`) | Se actualizó `navigation.reset` hacia `Welcome` tras completar `deleteMyAccount()` | ✅ Resuelto | SettingsScreen.tsx |
| E-031 | 2026-07-22 | API | Fallo silencioso al eliminar cuenta en el backend | `deleteMyAccount` no enviaba `sessionToken` a `deleteUserMutation`, causando error 401 en Convex que se capturaba en silencio sin borrar el usuario en la BD | Se pasó `sessionToken` a la mutación, se mejoró el manejo de errores y la limpieza de sesiones en la BD | ✅ Resuelto | AuthContext.tsx, convex/users.ts |
| E-032 | 2026-07-22 | Navigation | Renombrado de ruta Register a SignUp y actualización de botones Volver | La ruta de registro se llamaba `Register` y los botones de volver en Login/SignUp no reseteaban siempre a `Welcome` | Se renombró la ruta a `SignUp` (`signup`) en la navegación/linking y se configuraron los botones de volver para resetear a `Welcome` | ✅ Resuelto | App.tsx, LoginScreen.tsx, RegisterScreen.tsx, WelcomeScreen.tsx |
| E-033 | 2026-07-22 | UI | Título estricto de la pestaña a 'Ramgos App' y favicon a './logo.png' | El título de la pestaña cambiaba dinámicamente con las pantallas y el favicon apuntaba a assets | Se configuró el formateador de `documentTitle` para retornar estrictamente 'Ramgos App' y el favicon a `./logo.png` en `app.json` | ✅ Resuelto | App.tsx, app.json |
| E-034 | 2026-07-22 | Auth | Pedido redundante de contraseña anterior al recuperar cuenta | En el flujo de 'Recuperar contraseña' (con OTP), la UI y la mutación requerían la contraseña anterior, lo cual carece de sentido si el usuario la olvidó | Se eliminó el campo `oldPassword` de `ForgotPasswordScreen`, de los argumentos de `resetPasswordWithCode` y de su validación | ✅ Resuelto | convex/auth.ts, ForgotPasswordScreen.tsx |
| E-035 | 2026-07-22 | UI/UX | Diseño destructivo global en ConfirmContext ('Aprobar KYC' en rojo) | `confirmAction` renderizaba todo como destructivo (ícono de alerta rojo) por defecto. Falta de soporte para intenciones visuales y animaciones rígidas | Se reconstruyó `ConfirmContext` con `liquid-glass-design`, `Animated.spring`, e intenciones (`success`, `danger`, `warning`, `info`). Se aplicó `success` a 'Aprobar KYC' | ✅ Resuelto | ConfirmContext.tsx, confirm.ts, AdminDashboardScreen.tsx |
| E-036 | 2026-07-22 | Admin | Faltaba función para aprobar o rechazar todos los KYC filtrados | El admin debía hacer clic 1 por 1. | Aplicando filosofía `ponytail` (mínima complejidad, YAGNI), se agregaron botones que iteran la lista filtrada de UI y llaman al endpoint individual ignorando errores (para no spamear `show()`), dejando pendientes a los que fallen | ✅ Resuelto | AdminDashboardScreen.tsx |
| E-037 | 2026-07-22 | Feature | Faltaba formulario de consultas generales en perfil de negocio | El backend requería obligatoriamente un `formId` y no había botón público de contacto genérico | Se simplificó `FormFillScreen` y el backend aceptando leads sin `formId` (ponytail). Se agregó el botón a `BusinessProfileScreen` y un inbox general al admin | ✅ Resuelto | FormFillScreen.tsx, businessForms.ts |
| E-038 | 2026-07-22 | UI | Superposición en mapa y navegación a negocio rota | `MarketplaceScreen` no descontaba espacio para headers de filtros/búsqueda. El modal de settings quedaba detrás del `zIndex` del mapa. La navegación en mapa enviaba a ruta inexistente `BusinessDetail`. | Se incrementó `topInset` a 180. Se envolvió modal en `Modal` nativo de React Native. Se corrigió navegación para redirigir a `ItemDetail` y se integró botón de "Enviar Consulta" en `CommercialProfileScreen` | ✅ Resuelto | MarketplaceScreen.tsx, MapView.web.tsx, CommercialProfileScreen.tsx |
| E-039 | 2026-07-22 | Build | Error 500 al abrir `CommercialProfile` (MIME type 'application/json') | Error de compilación de Metro por error de sintaxis (llave de cierre faltante `}`) en `BusinessFormsScreen.tsx` | Se restauró la llave de cierre en `renderResponses` en `BusinessFormsScreen.tsx`. El bundle de Metro vuelve a compilar | ✅ Resuelto | BusinessFormsScreen.tsx |
| E-040 | 2026-07-23 | Social | Botones Seguir y Contactar en red social no persistían | `CommercialProfileScreen` y `DirectMessages` usaban un contexto mockeado (`SocialContext`) falso en vez de pegarle a Convex | Se refactorizaron los componentes para consumir directamente `useMutation(api.social.createChat)` y demás, integrando al backend universal. Se ajustó UI pública | ✅ Resuelto | CommercialProfileScreen.tsx, DirectMessages.tsx |
| E-041 | 2026-07-23 | Social | ReferenceError: createChat is not defined al abrir DMs | Se olvidó actualizar el dependency array del `useEffect` al renombrar `createChat` a `createChatMut` en `DirectMessages` | Se actualizó la dependencia a `createChatMut` y se removió la importación innecesaria de `useSocial` | ✅ Resuelto | DirectMessages.tsx |
| E-042 | 2026-07-23 | UI | Error de compilación TS17008: JSX element 'ScrollView' has no corresponding closing tag | Un reemplazo de código dejó etiquetas `</View>` desbalanceadas al inyectar la UI de Rewards | Se corrigió el balanceado de etiquetas JSX eliminando los `</View>` huérfanos | ✅ Resuelto | ProfileScreen.tsx |
| E-043 | 2026-07-29 | Auth | Falta Autenticación 2FA (Email OTP) en Login | Requerimiento de seguridad para envío de email con código al loguearse | Se interceptó la mutación `login` (no emite token), se envía OTP y se verifica en `verifyEmailCode` que ahora acepta email para emitir la sesión final. | ✅ Resuelto | AuthContext.tsx, users.ts, auth.ts |
| E-044 | 2026-07-29 | UI/UX | Solapamiento CSS en validadores de contraseñas en móvil | `col` tenía `flex: 1` forzando altura igual en cajas bajo flex column | Se quitó `flex: 1` en pantallas compactas y se añadió validación a 'confirmar contraseña' | ✅ Resuelto | RegisterScreen.tsx |
| E-045 | 2026-07-29 | Auth | Formulario KYC demasiado largo en móvil | Faltaba experiencia en wizard para consumidores e influencers | Refactor a wizard progresivo (2 o 3 pasos) idéntico a Business KYC | ✅ Resuelto | KYCScreen.tsx |
| E-046 | 2026-07-29 | Auth | Creación de cuenta exitosa con un 'username' ya existente | `signUpWithEmail` descartaba silenciosamente el `username` antes de enviarlo al backend, provocando que se auto-genere uno aleatorio único | Se corrigió el payload pasándole `username` a la mutación `register` de Convex | ✅ Resuelto | AuthContext.tsx |
| E-047 | 2026-08-12 | Config | Advertencias de esquema en `app.json` (`newArchEnabled`, `splash`, `edgeToEdgeEnabled` no permitidas) | Expo SDK 56 desestimó propiedades raíz como `newArchEnabled` y `edgeToEdgeEnabled` (activadas por defecto) y trasladó `splash` al plugin `expo-splash-screen` | Se removieron `newArchEnabled` y `edgeToEdgeEnabled`, y se eliminó el bloque raíz `splash` | ✅ Resuelto | app.json |
| E-050 | 2026-08-16 | Mensajería | La bandeja de DM existía a medias: backend con 3 bombas de escala y frontend en un bottom-sheet de 309 líneas sin pantalla propia | `getMyChats` hacía `.collect()` de TODA la tabla `socialChats` y filtraba en JS (cualquier mensaje del sistema re-disparaba la query de todos); `markChatAsRead` parcheaba `readBy` mensaje por mensaje (tormenta de escrituras); `sendDirectMessage` mandaba email Resend por cada mensaje. El front no tenía ruta, ni `FlatList`, ni adjuntos, ni paginación, ni manejo de teclado, ni badge | Modelo nuevo `socialChatMembers` (1 fila por chat×usuario) ⇒ bandeja O(log n) por índice `by_user_state_last`, unread server-side, `lastReadAt` como marca de agua del "visto" (1 escritura en vez de N). Módulo `convex/social/dm.ts` con 24 funciones (bandeja, solicitudes, grupos, reacciones, reply, unsend, typing, presencia, bloqueos) — queries degradan, mutations tiran `ConvexError`. Pantallas `InboxScreen`/`ChatScreen` con rutas y deep-link `chat/:chatId`, push que abre la conversación, y comercio por DM (`shareListingInChat` + `addDmProductToCart`) atribuido vía `cart.snapshot.sourceMessageId`. Las 6 funciones viejas quedan como shims para no romper el bundle desplegado (lección de E-049) | ✅ Resuelto — verificado 19/19 end-to-end | convex/{schema,crons,cart,commerce}.ts, convex/social/{dm,_helpers}.ts, src/screens/social/{InboxScreen,ChatScreen}.tsx, src/components/social/{MessageBubble,ShareListingModal}.tsx, src/hooks/useMessaging.ts |
| E-049 | 2026-08-16 | Auth/Deploy | Prod (`www.ramgos.app`) crasheaba entero con "Algo salió mal": `[CONVEX Q(dashboard:getBusinessMetrics)] Uncaught Error: Sesión no válida o expirada` | Desfasaje de contrato: `dashboard.ts` endurecido con `requireActor` + arg `sessionToken` y pusheado al deployment por `convex dev`, mientras el bundle web servido venía de HEAD (sin el arg) ⇒ `requireActor(ctx, undefined)` tiraba siempre. Agravante: `useQuery` re-lanza en render y `CrashHandler` (fuera de `AuthProvider`) tumbaba todo el árbol, ganándole al auto-logout de `AuthContext` | (1) Queries degradan con `getActorOrNull` + `return null/[]` en vez de tirar (dashboard×2, orders.getOrderById, businessForms×3); `assertSelfOrAdmin` sigue tirando ⇒ IDOR sigue cerrado. (2) `requireActor`/`assert*` pasan a `ConvexError {code: UNAUTHENTICATED\|FORBIDDEN}`. (3) `SessionGuard` (nuevo, dentro de `AuthProvider`) captura la sesión expirada → `logout()` + reset a Login; el resto de errores se re-lanza a `CrashHandler`. (4) 12 call sites arreglados con guard `sessionToken ? … : "skip"`. (5) `sessionToken` se publica solo con `status === 'authenticated'` (cierra la carrera del boot) | ✅ Resuelto — pendiente redeploy web | convex/{authHelpers,dashboard,orders,businessForms}.ts, src/components/{SessionGuard,CrashHandler}.tsx, src/utils/errors.ts, src/contexts/AuthContext.tsx, App.tsx |
| E-048 | 2026-08-15 | Seguridad | 18 funciones Convex de dev/seed/admin expuestas como `mutation`/`query`/`action` públicas: cualquier cliente podía invocar `clearDatabase.wipe`, `temp.makeAdmin`, `createAdmin`, seeds, `testQuery` (dump usuarios), `debug` (dump payments) | Scripts de dev deployados como funciones públicas, sin `requireActor` (detectado por auditoría graphify) | 6 borradas (backdoors/scratch huérfanos: temp, clearDatabase, debug, testMock, testMock2, testQuery); 12 convertidas a `internal*` (siguen corriéndose con `npx convex run`) | ✅ Resuelto | convex/{createAdmin,admin,approveAll,fixKyc,fixListings,cleanAvatars,migrateUsernames,seed*,connectV2}.ts + api.d.ts |
| E-049 | 2026-08-15 | Seguridad | IDOR en `dashboard.getBusinessMetrics`/`getInfluencerMetrics`: pasando cualquier `businessId`/`influencerId` se leía revenue/balance ajenos | Query pública sin auth; el id venía del cliente | `requireActor` + `assertSelfOrAdmin(actor, id)` en ambas; call sites ahora pasan `sessionToken` | ✅ Resuelto | convex/dashboard.ts, src/contexts/BusinessContext.tsx, src/hooks/useBusiness.ts |
| E-050 | 2026-08-15 | RS-1 | `simulateSocialCommercePayment` "cobraba" sin cobrar: parcheaba `users.balance` (80/10, el 10% de plataforma no se acreditaba a nadie), sin Stripe, sin `orders`, sin escrow y sin webhook | Prototipo de social commerce nunca conectado al camino de pagos de Fase 5 | `convex/commerce.ts` con `claimFromPost` → `stripe.createPaymentIntent` → webhook → orden con escrow `held`; el simulador queda lanzando error | ✅ Resuelto | convex/commerce.ts, convex/http.ts, convex/social.ts |
| E-051 | 2026-08-15 | RS-1 | El simulador descontaba puntos del campo equivocado (`pointsState.pointsBalance`); el balance canónico es `rewardsState.points` (`economy.redeemPoints`) | Dos representaciones de puntos conviviendo en `economyState` | `commerce` canjea vía `internal.economy.applyPointsEventInternal` (idempotente por `eventKey`, con devolución si el pago falla) | ✅ Resuelto | convex/commerce.ts |
| E-052 | 2026-08-15 | RS-1 | Los videos del feed nunca se renderizaban | `PostCard.renderMedia` construía el `<VideoView>` pero **faltaba el `return`**, así que caía al fallback de gradiente | Agregado el `return` | ✅ Resuelto | src/components/social/PostCard.tsx |
| E-053 | 2026-08-15 | RS-1 | Likes y comentarios del feed siempre mostraban 0; las fotos de posts comerciales no cargaban | Desalineación de nombres frontend↔backend: `likesCount`/`commentsCount` vs `likeCount`/`commentCount`, y `commercialProduct.imageUrl` vs `image`. `Post = any` en SocialContext ocultaba el error en compilación | Nombres alineados con `decoratePosts` + `src/components/social/types.ts` tipado | ✅ Resuelto | UnifiedFeed.tsx, PostCard.tsx, types.ts |
| E-054 | 2026-08-15 | RS-1 | `SocialContext` era un shim 100% no-op (todo `[]` / `() => {}`) y `SocialProvider` nunca se montó en `App.tsx`: `CreatePost`, `CreateInstagramPost`, `InstagramPost`, `UserProfile` y el botón "contactar vendedor" de `OrderDetailScreen` no hacían nada | Contexto mockeado sobreviviente de la migración a Convex (mismo patrón que E-040) | Los 5 consumidores rewireados a `useMutation`/`useQuery` directos; `SocialContext.tsx` **eliminado** | ✅ Resuelto | 5 componentes + archivo borrado |
| E-055 | 2026-08-15 | RS-1 | `UserProfile` siempre mostraba "Usuario no encontrado" y violaba las Rules of Hooks | `getUserById()` del stub devolvía `undefined` → `return` temprano, y había un `useQuery` **después** de ese return | Reescrito con `lookupUserSocial`/`getPostsByUser`/`getHighlights`/`getPublicListingsBySeller`; todos los hooks antes de cualquier return | ✅ Resuelto | src/components/social/UserProfile.tsx |
| E-056 | 2026-08-15 | RS-1 | Subida de imagen rota en los composers | `generateUploadUrl({})` sin `sessionToken`; `convex/files.ts` hace `requireActor` y tira "Sesión no válida" | Token pasado en ambos composers | ✅ Resuelto | CreatePost.tsx, CreateInstagramPost.tsx |
| E-057 | 2026-08-15 | RS-1 | El feed de un perfil mostraba el feed global de la app | `HybridProfileScreen` renderizaba `<UnifiedFeed />` sin props y el componente no aceptaba filtro de autor | `UnifiedFeed` acepta `authorUserId`/`mode`; el perfil pasa `profileId` | ✅ Resuelto | UnifiedFeed.tsx, HybridProfileScreen.tsx |
| E-058 | 2026-08-15 | RS-1 | Feed sin paginación (`handleEndReached` vacío) y pull-to-refresh cosmético (`setTimeout` que no refetcheaba) | Paginación diferida ("Ponytail: Pagination is deferred") | Paginación por cursor acumulando páginas + refresh que resetea el cursor | ✅ Resuelto | UnifiedFeed.tsx |
| E-059 | 2026-08-15 | RS-1 | En el feed vertical de videos el corazón no persistía y "Seguir" era decorativo | `LoopItem.handleLike` sólo movía `useState` (el `toggleLike` estaba comentado) y el botón de seguir no tenía `onPress` | `toggleLike` optimista con rollback + `SocialFollowButton` + `addView` para impresiones | ✅ Resuelto | LoopItem.tsx |
| E-060 | 2026-08-15 | Entorno | `py -m graphify update .` falla con "No module named graphify" | El `py` por defecto pasó a ser Python 3.13; graphify está instalado en 3.11 | Usar **`py -3.11 -m graphify update .`** (o el ejecutable `graphify` directo). Actualizar §3.1/Apéndice A si se reinstala | 🟡 Workaround | Entorno Windows |
| E-061 | 2026-08-15 | RS-1 | El deployment Convex no tiene el código nuevo | `npx convex codegen` **genera tipos locales, no deploya**; se asumió que sí | `npx convex function-spec` confirma que falta `commerce.js` y sobran los módulos borrados en SEC-1. Pendiente `npx convex dev`/`deploy` | 🟡 Abierto | §15.1 RS-1 |
| E-062 | 2026-08-17 | Mensajería | No se podía buscar usuarios por su @handle real; quien nunca posteó ni siguió a nadie era invisible y aparecía como "Usuario" sin @ en los chats | Dos namespaces de handle sin sincronizar: `users.username` (el del registro) y `socialUsers.username`, que `ensureSocialUser` derivaba del **prefijo del email**. Además `socialUsers` sólo se creaba de forma perezosa al postear/seguir | Directorio movido a `users` con `searchText` denormalizado + `search_directory`; búsqueda = unión de escaneo por prefijo (`by_username`) y texto completo; `writeUserIdentity` como única autoridad del handle; migración por lotes idempotente (16 usuarios, 0 renames) | ✅ Resuelto | convex/userDirectory.ts, convex/users/identity.ts, convex/userCard.ts, convex/migrations/userDirectory.ts, convex/social.ts |
| E-063 | 2026-08-17 | Seguridad | 5 fallas en el backend de DM: `getTyping` sin chequeo de membresía; `replyToId` sin acotar al chat (fuga del texto de mensajes ajenos); `attachments[].url` aceptaba cualquier `convex-storage:<id>`; adjuntos `listing` forjables (precio falso + desvío de la comisión de referido); miembros en `state:'left'` seguían leyendo el hilo | Queries gateadas por `chat.participantIds.includes()` en vez de por la fila de membresía; `metadata: v.any()` sin validar; sin registro de propiedad de los uploads | Chequeo de membresía real (`canRead`), `replyToId` validado en escritura y lectura, tabla `mediaAssets` + `files.registerUpload`, `sendMessage` rechaza adjuntos `listing`/`post` (única vía: `shareListingInChat`/`sharePostInChat`, que hidratan en servidor) | ✅ Resuelto | convex/social/dm.ts, convex/files.ts, convex/schema.ts |
| E-064 | 2026-08-17 | Mensajería | El historial del chat estaba tapado en los 30 mensajes más nuevos | `ChatScreen` seteaba `cursor` pero la query **nunca lo mandaba**, y `setOlderPages` no se llamaba nunca: `onEndReached` disparaba y no cargaba nada | Cursor en la query + acumulación real de páginas; ídem paginación en la bandeja | ✅ Resuelto | src/screens/social/ChatScreen.tsx, src/screens/social/InboxScreen.tsx |
| E-065 | 2026-08-17 | Mensajería | 8 mutations del backend sin un solo call site: un grupo creado no se podía renombrar, editar ni abandonar, y no había forma de silenciar, archivar ni bloquear | Backend construido sin la UI correspondiente | `GroupInfoScreen` nueva, hoja de opciones en el chat, long-press en la bandeja, carpeta Archivados, mensajes de sistema en grupos y sucesión de owner al irse el creador | ✅ Resuelto | src/screens/social/GroupInfoScreen.tsx, src/screens/social/ChatScreen.tsx, src/screens/social/InboxScreen.tsx, convex/social/dm.ts |
| E-066 | 2026-08-17 | Mensajería | Desde Inicio o Marketplace no había señal de mensajes nuevos ni forma de llegar a la bandeja | La bandeja sólo era alcanzable desde el ícono de avión del header de Social | Entrada "Mensajes" con badge de no leídos en la barra inferior y en la sidebar de escritorio; `HomeScreen.handleTabChange` la intercepta y navega a `Inbox` | ✅ Resuelto | src/components/MobileNav.tsx, src/components/DesktopSidebar.tsx, src/screens/HomeScreen.tsx |
| E-067 | 2026-08-17 | Escala | `backfillMembers` nunca escribía `participantsKey`, así que cada chat 1:1 viejo generaba un hilo DUPLICADO al reabrirlo, y los chats legacy no aparecían en la bandeja; además leía la tabla entera con `.collect()` | La migración parcheaba `kind` pero no la clave que usa `getOrCreateDirectChat` para deduplicar | Reescrito por lotes con cursor, setea `participantsKey`, idempotente; topes en `cleanupEphemeral` y `getUnreadTotal`; `listBusinessStores` y `listUsers` por índice en vez de `.collect()` | ✅ Resuelto | convex/social/dm.ts, convex/users.ts |
| E-068 | 2026-08-18 | RS-2 | Bypass de ban: un usuario baneado autenticado por OAuth (`ctx.auth.getUserIdentity()`) conservaba acceso a toda la app | `getActorFromAuth`/`getActorOrNull` nunca miraban `isBanned`; `banUser` sólo revocaba `sessions`, que un login OAuth no usa | `isBanned` propagado a `AuthActor`; `getActorOrNull`/`requireActor` lo chequean con default seguro (`allowBanned` explícito para los pocos endpoints que lo necesitan); `revokeAllSessions` centralizado en `writeUserIdentity` | ✅ Resuelto | convex/authHelpers.ts, convex/users/identity.ts |
| E-069 | 2026-08-18 | RS-2 | Puntos falsificables: `economy.addPoints` era mutation pública con `amount` en los args | Sólo validaba `assertSelfOrAdmin` + `amount > 0`, sin catálogo server-side | Eliminada; reemplazada por `economy.claimReward({kind, refId})` contra `REWARD_CATALOG` server-side, vía el motor único `economy/pointsEngine.ts` (idempotencia + tope diario por `eventKey`) | ✅ Resuelto | convex/economy.ts, convex/economy/pointsEngine.ts |
| E-070 | 2026-08-18 | RS-2 | Dos saldos divergentes: `rewardsState.points` vs `pointsState.balance`, con escritores y lectores cruzados sin reconciliar | `rewards.ts` escribía un campo que la UI principal no leía | Canónico = `rewardsState.points` (el único no-escribible por el cliente); `pointsState` retirado a lápida vía `migrations/pointsUnification.ts` (dry-run reporta divergencias antes de aplicar) | ✅ Resuelto | convex/migrations/pointsUnification.ts, convex/rewards.ts, convex/points.ts |
| E-071 | 2026-08-18 | RS-3 | Bug propio detectado en review: filtrar `isGlobalFeedEligible` DESPUÉS de `.take(cap)` podía truncar la paginación antes de tiempo (`nextCursor: null` aunque quedaran posts) | El corte "se acabó" se decidía sobre `candidates.length` (post-filtro) en vez del lote crudo | `getFeed` ahora decide `nextCursor` sobre el tamaño y el `createdAt` más viejo del lote CRUDO, no del filtrado | ✅ Resuelto | convex/social.ts (`getFeed`) |
| E-072 | 2026-08-18 | RS-3 | Bug propio detectado en review: el clawback de puntos (`revokePoints`) reconstruía el `eventKey` con la fecha de HOY en vez de la fecha de creación del contenido, apuntando a un evento que nunca existió | `buildEventKey(kind, entityId)` sin `day` explícito default a `todayKey()` | `internalRevokeContentReward`/`deletePost`/`deleteComment` pasan `day = createdAt.slice(0,10)` explícito | ✅ Resuelto | convex/social/gamification.ts, convex/social.ts |
| E-073 | 2026-08-18 | Reanálisis §17.2 | `npm.cmd run typecheck` fallaba: `Cannot find name 'Haptics'` en `HomeScreen.tsx` — baseline preexistente que §15.2 había dejado explícitamente sin tocar | Import de `expo-haptics` faltante (patrón usado en otras 3+ pantallas: `import * as Haptics from 'expo-haptics'`) | Se agregó el import; `npm.cmd run typecheck` vuelve a exit 0 | ✅ Resuelto | src/screens/HomeScreen.tsx |
| E-074 | 2026-08-18 | RS-9 | `internalPublishDueScheduled` (cron de posts programados) fallaba el typecheck: `ctx.db.get(draft.authorUserId as any)` infería la tabla `listings` en vez de `users` | `as any` sobre un string plano no le da a TS ninguna pista de a qué tabla apunta; toma la primera que calza por estructura | `ctx.db.normalizeId('users', draft.authorUserId)` antes del `.get()`, como en el resto del código | ✅ Resuelto | convex/social/drafts.ts |
| E-075 | 2026-08-18 | RS-9 | Al extraer `createPostImpl` de la mutation `createPost` a función plana, un `(q) => q.eq(...)` quedó con `q` implícito `any` y typecheck falló | Ese query builder no había necesitado anotación explícita mientras vivía dentro del `mutation({...})` tipado; al mover el código a una función con `ctx: any`, ese caso puntual perdió la inferencia (el resto del archivo ya usaba `(q: any)` en todos lados) | Anotado `(q: any)`, igual que el resto de `social.ts` | ✅ Resuelto | convex/social.ts |
| E-076 | 2026-08-18 | RS-4…RS-10 | **App tumbada por el `CrashHandler`** al entrar al tab Social con un token vencido/cuenta baneada | **Las 25 queries nuevas del módulo social violaban la convención documentada en `social/dm.ts:15`** ("las queries degradan, las mutations tiran"). `useQuery` re-lanza el error durante el render, así que una query que tira sube por el árbol hasta el error boundary. El disparador más probable: `getUnreadActivityCount`, agregada al header de `SocialScreen` (se ejecuta en cada montaje del tab). La Fase 0 amplió el problema al hacer que `requireActor` también tire para cuentas baneadas | Helper `socialViewer()` (+ `adminViewer()` para las de admin) que degrada a `null`; las 25 queries devuelven su valor vacío (`[]` / `{items:[],nextCursor:null}` / `null`). Se sumó `getSavedPosts` (preexistente) porque `SavedPostsScreen` la puso en un camino nuevo. `getCommunityFeed` dejó de lanzar `FORBIDDEN` a no-miembros de comunidades privadas: devuelve lista vacía | ✅ Resuelto | convex/social/_helpers.ts + activity/communities/drafts/eventMatching/hashtags/moderation, convex/social.ts, convex/economy.ts |
| E-077 | 2026-08-18 | Producto | El doc de arquitectura prometía un "One-Click In-App Checkout" (`<OneClickCheckoutSheet />` + `claimFromPost`) que **no existe en el repo**: el sheet fue borrado y la mutation nunca se escribió. Peor, §15.1 (RS.1/RS.7/RS.8) de este mismo plan afirmaba que ambos funcionaban | Entradas de bitácora nunca reconciliadas con el código tras una depuración posterior | **Decisión del usuario: el pago pasa OBLIGATORIAMENTE por el carrito** (atribución del creador → checkout normal con stock/envío/escrow). Se reescribieron §1, §3, §4, §7.1, §9 Módulo 2, §10 y los criterios de Sprint 2/3 del doc de arquitectura para reflejarlo. `claimFromPost` deja de figurar como brecha: es una decisión, no un pendiente | ✅ Resuelto | docs/ARQUITECTURA_SOCIAL_COMMERCE.md |
| E-078 | 2026-08-18 | Producto/UI | Un post con varias imágenes mostraba **sólo la primera, y recortada** (`images[0]` + `resizeMode="cover"`), en las DOS superficies que renderizan posts. No figuraba en ninguna lista de brechas | El doc §9 nombraba un `ImageSlider` que nunca se implementó; el recorte venía de `cover` | `PostImageCarousel` compartido: todas las imágenes deslizables + indicador de puntos, y la foto **completa en el encuadre** (`contain`) con copia desenfocada de fondo para rellenar. Cableado en `PostCard` (feed vertical) y en `Post` (tab Social) — este último es el que ve el usuario y se había pasado por alto en la primera pasada | ✅ Resuelto | src/components/social/PostImageCarousel.tsx, PostCard.tsx, Post.tsx, types.ts |
| E-079 | 2026-08-18 | Producto | `MercadoPago` figuraba como pasarela en §8 del doc y como proveedor en el código, pero era un **mock puro del cliente** (`simulateNetworkLatency`, ids y URL de recibo inventados) | Se documentó como integración real algo que nunca lo fue | Decisión del usuario: **Stripe es la única pasarela**. Eliminado `mercadoPagoProvider` y el literal del union `PaymentProviderKey`; actualizado §8 y el comentario de `payments.provider` en el schema. Verificado que nada importaba ese módulo | ✅ Resuelto | src/services/fintech/paymentProviders.ts, convex/schema.ts, docs/ARQUITECTURA_SOCIAL_COMMERCE.md |
| E-080 | 2026-08-18 | Producto | El feed salía **rankeado por algoritmo** (`forYou` por defecto), con lo que un post recién subido podía no aparecer arriba — o el cap de diversidad por autor lo sacaba de la página — y se leía como que la app lo perdió | §5 del doc definía el motor de recomendación como comportamiento por defecto | Decisión del usuario: **las publicaciones salen por orden de subida**. `getFeed` pasa a `mode: 'recent'` por defecto (cronológico, lo más nuevo primero). El ranker `scorePost` **no se borró**: sigue disponible pidiendo `mode: 'forYou'` explícitamente. §5 del doc actualizado con la aclaración | ✅ Resuelto | convex/social.ts (`getFeed`), docs/ARQUITECTURA_SOCIAL_COMMERCE.md |
| E-081 | 2026-08-19 | Documentación | Cabecera del plan (v1.7) decía "RS-9 (extras SHOULD + Eventos/Matching) sin iniciar por decisión del usuario", pero §15.3 (agregado en la misma sesión del 2026-08-18) ya documenta RS-9 y RS-10 como código listo (85%, RS.45–RS.65). Además existe un segundo archivo `PLAN_ESTRATEGICO_MAESTRO.md` suelto en la raíz del repo (fuera de `docs/`) que NO es este plan: es un log corto y desactualizado de una tanda distinta de trabajo (Reels/bugs/UX/perfiles, última fase "4. Unificación de Perfiles"), con sus propios §15/§16/§17 vacíos — puede confundirse con este archivo por tener el mismo nombre | La cabecera se escribió antes de que se cerrara la sesión que agregó §15.3, y nunca se refrescó. El archivo duplicado en la raíz nunca se consolidó con `docs/PLAN_ESTRATEGICO_MAESTRO.md` | Cabecera corregida (líneas 3–6): versión 1.8, RS-2 a RS-10 listadas como código listo. **Pendiente de decisión del usuario:** qué hacer con el `PLAN_ESTRATEGICO_MAESTRO.md` de la raíz (fusionar su bitácora dentro de `docs/` y borrarlo, o dejarlo como log aparte pero renombrado para no confundir) | 🟡 Parcial — falta resolver el archivo duplicado | docs/PLAN_ESTRATEGICO_MAESTRO.md (cabecera), PLAN_ESTRATEGICO_MAESTRO.md (raíz, sin resolver) |
| E-082 | 2026-08-20 | RS-2…RS-10 (Fase 2 de este plan) | Migración `pointsUnification` nunca había corrido en ningún deployment (bloqueante de cierre de RS-2…RS-10) | Bloqueante externo puro, no de código: la mutation estaba escrita e idempotente desde antes, solo faltaba ejecutarla | **Dev:** corrida con `chain:true` → `pendingRows: 0`, `legacyBalanceAhead: 0`, 125 filas procesadas. Los 28 "divergentes" del dry-run eran cuentas huérfanas (`userId` ya no existe en `users`) — cero riesgo real, se aplicó sin pedir más permiso. **Prod:** dry-run limpio (13 filas, 0 divergencias) pero la aplicación real (`chain:true --prod`) la bloqueó el clasificador de permisos del harness incluso con autorización explícita del usuario en el chat — requiere que el usuario la corra en su propia terminal (comando dejado en el chat) o agregue una regla de permiso Bash. **Hallazgo colateral, fuera de alcance de este plan:** `auditLedgerConsistency` en dev encontró 3 usuarios reales (no huérfanos) con `pointsLedger` desalineado del canónico `rewardsState.points` — `fclaibainfo@gmail.com` (529 vs 959), `andrescartcm@gmail.com` (0 vs 500), `agustinlory@gmail.com` (125 vs 261). Es un bug de contabilidad previo a esta sesión, no causado por la migración (que no toca el ledger) | 🟡 Parcial — dev cerrado, prod pendiente de que el usuario ejecute el comando, y el hallazgo del ledger sin investigar | convex/migrations/pointsUnification.ts |
| E-083 | 2026-08-20 | Fase 4 de este plan (QA runtime) | El plan aprobado asumía correr el checklist de §12.4 (13 flujos RS-2…RS-10) vía `claude-in-chrome` contra `localhost:8081` — las herramientas de navegador no aparecieron disponibles en esta sesión (`ToolSearch` sin resultados para ninguna variante) | Extensión de Chrome no conectada a esta sesión concreta (es una integración por sesión, no por proyecto) | Se levantó igual el server (`npm run web`, responde 200 en `localhost:8081`) para que el usuario lo recorra a mano con el checklist de §12.4, o para retomarlo en otra sesión con la extensión conectada | 🔴 Pendiente — Fase 4 no se pudo ejecutar | — |
| E-084 | 2026-08-20 | `docs/ARQUITECTURA_SOCIAL_COMMERCE.md` §10 "Aún abierto" | 8 features quedaban documentadas como pendientes, fuera del alcance del plan de cierre de RS-2…RS-10 | Estaban explícitamente pospuestas para "un plan posterior" — el usuario pidió desarrollarlas ahora | Se implementaron 6 de las 8 completas: (1) video en `contain` con blur de fondo igual que las imágenes (`PostCard.tsx`); (2) pool de 3 reproductores `expo-video` compartidos por feed (`useVideoPlayerPool.ts`) + de paso `LoopItem`/`LoopFeed` migraron de `expo-av` (deprecado) a `expo-video`; (3) `CommerceTag` reescrito sobre `GlassSurface`/`glass.ts` + borde iridiscente; (4) UI de alt-text en `InlineComposer` (botón "Aa" por miniatura); (5) `StoryViewer` migrado a `shareStoryInChat` (adjunto real, no texto con prefijo); (6) link preview cards nuevas de punta a punta (tabla `socialLinkPreviews`, `social/linkPreview.ts` con fetch+parseo OG en background vía scheduler, render en `Post.tsx`/`PostCard.tsx`). Las otras 2 se dejaron **deliberadamente sin cerrar del todo**, con la brecha real documentada en el propio código en vez de fingir que están resueltas: **discovery** (`convex/discovery.ts`, nuevo — unifica personas+productos en un buscador) es full-text sobre índices de Convex, **no semántico/vectorial** (no hay proveedor de embeddings elegido en el stack); **`communityAgreements`** (`communities.ts`, nuevo) tiene el CRUD completo del convenio (proponer/aceptar/rechazar/revocar) pero el split de pagos real —acreditar la comisión en una venta— se dejó sin cablear a propósito, por tocar plata de terceros sin una revisión de seguridad dedicada. **Sonidos reutilizables** no se tocó: necesita procesamiento de audio/video que este stack no tiene instalado, es una decisión de infraestructura aparte, no un gap chico. `tsc --noEmit` y `test:constitution` verdes después de cada tanda; deployado a dev (`npx convex dev --once`) para regenerar tipos | ✅ 6/8 completas · 🟡 2/8 con brecha real documentada (discovery semántico, split de pagos de convenios) | convex/discovery.ts, convex/social/linkPreview.ts, convex/social/communities.ts, convex/schema.ts, src/hooks/useVideoPlayerPool.ts, src/components/social/{PostCard,CommerceTag,InlineComposer,StoryViewer,LoopItem,LoopFeed,UserSearch,LinkPreviewCard}.tsx |
| E-085 | 2026-08-20 | Ranking dual (planificado en Plan Mode, ver §15.4) | El Feed salía **cronológico por defecto** (`mode:'recent'`, E-080) — decisión de producto de esta sesión: revertirlo a propósito para alinear con cómo funcionan X/Instagram HOY | El usuario pidió explícitamente "la lógica con que funcionen las redes sociales actuales" al elegir el default del Feed — en X/Instagram real, el tab algorítmico ("Para ti") ES el default, no una opción sobre un cronológico | `getFeed`: `mode = args.mode ?? 'forYou'` (antes `'recent'`). El riesgo que motivó E-080 (catálogo chico esconde posts nuevos) **no se da por resuelto**, se mitiga con oversample + diversity cap y queda como riesgo abierto documentado. Tab "Siguiendo" nuevo en `SocialScreen.tsx` para el cronológico explícito. `scorePost` también se mejoró en la misma pasada: + velocidad de engagement normalizada por edad, + afinidad graduada (`socialAuthorAffinity`, EMA) en vez del `+25` plano | ✅ Resuelto — reversión deliberada, documentada como tal (no como corrección de un error) | convex/social.ts (`getFeed`), convex/social/scoring.ts, docs/ARQUITECTURA_SOCIAL_COMMERCE.md §5 |
| E-086 | 2026-08-20 | Ranking dual — Loops (ver §15.4) | Loops (`mode:'videos'`) no tenía NINGÚN ranking: orden cronológico puro sobre `by_type_created`, y la instrumentación de watch-time real (`LoopItem`) sólo mandaba una impresión al entrar, sin `watch` — `avgCompletionPct`/`quickSkipCount` nunca se llenaban | El usuario pidió "el modelo más completo y funcional... para aumentar la viralización y la segmentación de contenido" — explícitamente el más sofisticado de las dos opciones planteadas, no un score heurístico plano | `scoreLoop` nuevo (scorer por TASAS, separado de `scorePost`, casi sin depender del grafo social) + `socialTagAffinity` (afinidad por interés, sólo alimentada por Loops) + mecanismo de exploración/graduación por etapas ("bandit-lite" sin ML real todavía: slots garantizados + cron de graduación por percentil cada 2h, `social/loopsTiering.ts`) + `LoopItem` instrumentado de verdad (completion/skip/rewatch reales vía el player, rewatch por evento `playToEnd` exacto) + `shareCount` real (`sharePostInChat`/`shareToUser`) | ✅ Resuelto — deployado a dev, QA runtime pendiente (mismo bloqueante que E-083) | convex/social/{scoring,loopsTiering}.ts, convex/social.ts, convex/social/dm.ts, convex/migrations/loopsTierBackfill.ts, src/components/social/LoopItem.tsx |
| E-087 | 2026-08-20 | Comunidades comerciales (`social/communities.ts`) | `communityAgreements` (convenios de comisión cruzada entre miembros de una comunidad: "si B vende algo promocionado por A, A cobra X%") existía en el schema y como CRUD completo (`proposeAgreement`/`respondToAgreement`/`revokeAgreement`/`listMyAgreements`), documentado como "split de pagos sin cablear a propósito" — pero el usuario **no quiere esta feature en el sistema en absoluto**, ni siquiera a medio implementar | Decisión de producto explícita: las Comunidades son un nicho compartido donde varios vendedores postean y **compiten** por vender más de ese rubro — no un vehículo para repartirse comisiones entre sí. La única figura que puede cobrar comisión de una venta en toda la app es un usuario `role:'influencer'` vía campaña (ya gateado — `campaigns.ts:650`, `if (influencer.role !== 'influencer') continue`, sin relación con comunidades) | **Eliminado por completo**, no descontinuado a medias: tabla `communityAgreements` borrada de `convex/schema.ts` (confirmado 0 documentos vía `npx convex data communityAgreements` antes de borrar, así que no hizo falta migración de baja); las 4 funciones + el bloque de comentario de "convenios" borrados de `convex/social/communities.ts`; sin frontend que las llamara (nunca se construyó UI). Docs actualizados: `ARQUITECTURA_SOCIAL_COMMERCE.md` §6.B/§10/§11 ya no mencionan convenios como pendiente, sino como decisión de exclusión | ✅ Resuelto — feature removida, no diferida | convex/schema.ts, convex/social/communities.ts, docs/ARQUITECTURA_SOCIAL_COMMERCE.md |

| E-088 | 2026-08-23 | Puntos / gamificación | La barra de progreso no se movía al cruzar un umbral y los desbloqueos nunca se activaban | Cuatro causas acumuladas: (a) `currentTier`/`nextTier` se calculaban sobre `points` (saldo gastable) mientras todas las barras miden `lifetimePoints`, así que canjear puntos hacía retroceder el tier y el progreso quedaba clavado en 100%; (b) `claimDailyReward` y la rama `daily_login` de `claimChallenge` patcheaban `points` a mano sin tocar `lifetimePoints`; (c) convivían dos tablas de tiers incompatibles (`DISCOUNT_TIERS` 0/100/500/1000 vs `MEMBERSHIP_TIERS` 0/1000/5000/15000) y el roadmap comparaba labels de tablas distintas, así que ningún nodo se marcaba como actual; (d) `ProfileScreen` renderizaba `user.expProgress`, campo inexistente | `MEMBERSHIP_TIERS` queda como tabla canónica (es la que fija `constitution.test.tsx`) y `DISCOUNT_TIERS` se elimina; `PURCHASE_TIERS` del backend se alinea a sus umbrales (⚠️ **cambia la economía en vivo**: el +5% por compra pasa de exigir 100 a 1000 lifetime); los dos caminos de racha diaria pasan por `awardPoints`, el motor único; `isCurrent` compara por `id`; ProfileScreen usa el progreso ya calculado. Se elimina el duplicado roto de `DailyChallenges` en `components/games` que leía `challenge.completed` (campo inexistente) y dejaba el botón de reclamar siempre deshabilitado | ✅ Resuelto | `convex/economy.ts`, `src/contexts/PointsContext.tsx`, `src/components/PointsManager.tsx`, `src/screens/ProfileScreen.tsx` |
| E-089 | 2026-08-23 | Social commerce / referidos | Cualquier usuario podía etiquetar el producto de un tercero en un post, y el enlace de compartir de un producto nunca atribuía la venta | `CommerceLinker` listaba el catálogo entero vía `searchListings` y `createPostImpl` etiquetaba sin validar. En paralelo, la atribución estaba rota de punta a punta: `CartContext` mandaba el `referralCode` dentro de `snapshot`, pero para listings reales el servidor descarta el snapshot y lo reconstruye desde la DB leyendo el código sólo de `attribution`; y el motor de comisiones resolvía únicamente el índice legacy `by_referral_code`, mientras el botón compartir emite handle o alias (`preferredShareCode`) | Nuevo `convex/promotionEligibility.ts` con la regla única (propios siempre; ajenos sólo para `role:'influencer'` con campaña activa, whitelist o `openPromotion`, y espejando las condiciones de tasa del checkout), aplicada server-side en `createPostImpl` por los dos caminos (`attachedListingId` y `commercialProduct.listingId`). Nuevas queries `listings.getTaggableListings` y `campaigns.getMyShareEligibility`. La atribución viaja en `attribution`, `getStateFromPath` deja de descartar el `?ref=`, y la resolución de las tres formas de código (handle/alias/legacy) se unifica en `referralHelpers.findUserByReferralInput`, compartida por registro y checkout | ✅ Resuelto | `convex/promotionEligibility.ts`, `convex/social.ts`, `convex/listings.ts`, `convex/campaigns.ts`, `convex/referralHelpers.ts`, `src/contexts/CartContext.tsx`, `App.tsx` |
| E-090 | 2026-08-23 | Mi Mascota | El huevo eclosionaba con la primera moneda ganada y la mascota no tenía noción del tiempo | Convivían tres modelos contradictorios: (a) la eclosión estaba atada a "≥100 monedas" dentro de `addCoins`, y como `DEFAULT_PET_STATE` arranca justo con 100 monedas se rompía al instante; (b) el modal de guía prometía evolución por racha diaria y `loginStreak` no se leía en ninguna parte (los números 3/8/30 eran niveles, no días); (c) el desgaste era un `setInterval` en memoria del cliente que se perdía al cerrar la pantalla | Nuevo `convex/economy/petLifecycle.ts` con funciones puras que derivan todo de timestamps, **sin cron** (un cron por mascota costaría escrituras por usuario inactivo; el cómputo lazy cuesta cero mientras nadie mire): incubación de 48 h reales acelerable con cuidado (+5%) y login diario (+10%), stat nuevo `hygiene` que al estar bajo duplica la caída de felicidad, desgaste por hora acotado a 72 h para que el abandono no sea irreversible. Campos nuevos con defaults en `hydrateRewardsState`, sin migrar la tabla (`rewardsState` es `v.any()`). 16 tests cubren incubación, desgaste, idempotencia y la regresión de las 100 monedas | ✅ Resuelto | `convex/economy/petLifecycle.ts`, `convex/economy.ts`, `convex/economy/pointsState.ts`, `src/components/pet/MiMascotaView.tsx` |
| E-091 | 2026-08-23 | Avatar / media | La foto de perfil se veía a 40 px sin importar el tamaño pedido, no persistía en web, y faltaba en muchas pantallas | Tres problemas distintos: (a) `Avatar` aplicaba el `style` al contenedor externo pero dimensionaba la imagen con `SIZE_MAP[size]`, y 77 de los 95 usos dimensionan por `style`; (b) `ProfileScreen.handleSave` sólo subía si la URI empezaba con `file:/`, y en web el picker devuelve `blob:`/`data:`, así que se guardaba la URI local literal (de ahí `convex/cleanAvatars.ts`); (c) doce queries devolvían el documento crudo con `convex-storage:<id>`, que el cliente no puede cargar | El diámetro sale de `size` numérico, del `style` o del tamaño nominal, y anillo, punto de estado y letra del fallback escalan con él; la subida usa `uploadLocalImageToConvex` (maneja los tres esquemas y registra el upload) y `avatar` sólo viaja al backend si se eligió foto nueva, para no pisar la referencia de storage con una URL firmada que caduca; las doce queries pasan por `resolveMediaUrl`/`createMediaResolver`. De paso se cierra una fuga: `getUser` sin token devolvía email, teléfono, balance y KYC de terceros — ahora devuelve sólo la proyección pública con un `isVerified` derivado | ✅ Resuelto | `src/components/ui/avatar.tsx`, `src/screens/ProfileScreen.tsx`, `convex/users.ts`, `convex/social.ts`, `convex/listings.ts` |
| E-092 | 2026-08-23 | Loops | "Subí unos loops y cuando subí otros se borraban los anteriores" | Los loops nunca se borraban (`createPost` es un INSERT puro, ningún cron los toca, `getPostsByUser` los devuelve todos): la pestaña sólo podía mostrar 2–4 a la vez. Tres causas sumadas en la rama `mode:'videos'` de `getFeed`: los slots de exploración se trataban como techo (`round(cap*0.2)`=4) y el resto lo tenía que llenar contenido graduado que no existe nunca (el cron exige 200 vistas); el orden menos-visto-primero hacía que cada loop nuevo desplazara a los de ayer; y el diversity cap `perKey=2` sobre una clave que sin hashtags cae al autor dejaba 2 por persona. Sin paginación cableada, además, el scroll terminaba en el post 20 | La fracción de exploración pasa a ser piso y no techo; sin población graduada el orden es por recencia; el cap sube a 4 y se saltea cuando el pool no llena la página. Paginación cableada con el cursor apuntando al último post devuelto (no al final del lote sobremuestreado, que salteaba ~60 loops por página) | ✅ Resuelto | `convex/social.ts`, `convex/social/scoring.ts`, `src/screens/SocialScreen.tsx` |
| E-093 | 2026-08-23 | Entorno | No se pudo desplegar a Convex ni pushear la rama | `CONVEX_DEPLOYMENT` no está configurado en el contenedor (mismo bloqueante que E-015), y la GitHub App de Claude no tiene acceso de escritura al repo para la organización | Verificación alternativa: `tsc --noEmit` limpio, 76/76 tests (16 nuevos de `petLifecycle`) y **bundle web completo con Metro (3864 módulos, sin errores)**. Los 9 commits quedan en local sobre `claude/citas-perfil-comercial-2a3t23` y se entregó un `git bundle` como respaldo. Pendiente del usuario: `npx convex dev` para desplegar el backend y habilitar la GitHub App para pushear | 🟡 Abierto | Entorno Convex + GitHub |
| E-094 | 2026-08-24 | UX-FEED | Scroll del feed con jank en gama media (Redmi 9), y el tracking de vistas del feed principal no se emitía nunca | Cuatro causas: (a) `onViewableItemsChanged` se construía con `useRef(...).current`, así que quedaba clavado al primer render y capturaba el `Set` de foco vacío inicial más un `flushExit` cerrado sobre `sessionToken === null` → `addView` NUNCA salía del feed principal y el ranker RS-RANK no recibía dwell ni completion; (b) cada post de video montaba 2 `VideoView` + 1 `BlurView` (blur por frame) sobre el mismo player, con `useVideoPlayer` propio y sin pool; (c) `getStyles` tenía el `StyleSheet.create` dentro de la función y se recreaba por tarjeta en cada render; (d) `renderItem` dependía de `focusedIds`, así que cada cambio de viewport invalidaba toda la lista montada | Store de foco externo por id (`useFeedFocus`, `useSyncExternalStore`); pool de 3 players con desalojo LRU por clave (`useVideoPool`) — el pool existente asignaba `index % 3`, que colisiona en feed mixto; `createThemedStyles` con caché de 2 entradas a nivel de módulo; `getItemType` por tipo de post; una sola `VideoView` en `cover` sin blur; media 4:5 a sangre (`PostMediaBox`); `CommerceTag variant="compact"` flotando sobre la media + píldora "Comprar" en la barra de acciones; háptico Success/Error al agregar al carrito; safe-area real en lugar de `Platform.OS` fijo en `LoopItem`/`LoopFeed`/`SocialScreen`; borrada la 4.ª copia de la paginación por cursor en `SocialScreen` (~65 líneas) a favor de `useSocialFeed` | 🟡 Código listo — tsc + convex typecheck + 83 tests en verde; QA runtime pendiente | `useFeedFocus.tsx`, `useVideoPool.tsx`, `makeThemedStyles.ts`, `PostVideo.tsx`, `PostMediaBox.tsx`, `PostCard.tsx`, `UnifiedFeed.tsx` |
| E-095 | 2026-08-24 | Entorno | El paso 1 del protocolo §17.2 (`py -m graphify update .`) y las consultas `graphify query "..."` que exige CLAUDE.md **no se pueden ejecutar** | Dos problemas superpuestos: el launcher `py` resuelve Python 3.13 y graphify está instalado en 3.11; y, aun con `py -3.11`, el CLI instalado sólo expone `install`, `uninstall`, `path`, `explain`, `diagnose multigraph`, `clone`, `merge-driver` y `merge-graphs` — **`update` y `query` no son comandos de este CLI**. Regenerar el grafo es tarea de la skill `/graphify`, no del binario | Para consultar el grafo: `py -3.11 -m graphify explain "<nodo>"` o `path "A" "B"`, o leer `graphify-out/GRAPH_REPORT.md`. Para regenerarlo, invocar la skill. **Pendiente: corregir el texto de §17.2, que documenta comandos inexistentes** | 🟡 Abierto — es un defecto de este propio documento | `graphify-out/` (último grafo generado: 2026-08-18) |
| E-096 | 2026-08-24 | COM-BACK | Las comunidades existían pero eran inalcanzables, y les faltaba la mitad del modelo: sólo 2 niveles de privacidad, cero invitaciones, cero cuestionario | Única puerta de entrada: un ícono `Users2` en el header de Social que ni siquiera se renderizaba en la pestaña Loops. El status `'invited'` estaba declarado en el schema pero **ningún código lo escribía ni lo leía**. `rejectMember` BORRABA la fila, así que no se distinguía "nunca solicitó" de "lo rechacé". `memberCount` se parcheaba a mano en 5 lugares distintos. El tipo de actividad `'community_invite'` se emitía para SOLICITUDES, que es lo contrario de lo que significa | Schema widen-only (sin backfill): `visibility` + `'secret'`, `communityMembers.status` + `'rejected'`/`'banned'`, 9 campos opcionales en `commercialCommunities`, 4 tablas nuevas (`communityInvites`, `communityInviteRedemptions`, `communityQuestions`, `communityJoinRequests`), 5 índices nuevos. `joinPolicy` se deriva en runtime con `resolveJoinPolicy` para las filas viejas. Nuevo módulo `convex/social/communityAccess.ts` (13 funciones); `adjustMemberCount` centraliza el contador; `rejectMember` pasa a `patch`; `getFeed` suma `mode:'communities'` con fan-out capado a 15; `getCommunity` devuelve ficha reducida para privadas y `null` para secretas | 🟡 Código listo, desplegado a dev. tsc + convex typecheck + 160 tests en verde | `communityAccess.ts`, `_communityPolicy.ts`, `communityMigrations.ts`, `schema.ts` |
| E-097 | 2026-08-24 | COM-LINKS | `getStateFromPath` decidía a qué pantalla entra cada link compartido y **no tenía un solo test**, pese a haber causado ya una pérdida de comisiones (E-089) | Vivía inline dentro del `linking` de `App.tsx`, así que no era importable ni testeable. Además, agregarle la rama de comunidades sin tocar `reservedPaths` habría hecho que `/c/{id}` se resolviera como `ProductDetail{handle:'c', slug:'{id}'}` y `/comunidades` como el perfil del usuario "comunidades" | Extraído a `src/navigation/getStateFromPath.ts` con 20 tests, cuatro de ellos dedicados a que el `?ref=` sobreviva (path relativo, URL absoluta, valor escapado, y con otros parámetros delante). `RESERVED_PATHS` suma `'c'` y `'comunidades'`. Rama nueva insertada DESPUÉS de la de bono y ANTES de la de handles. `communityDeepLink.ts` con 25 tests propios, incluido rechazo de hosts ajenos | 🟡 Código listo; **bloqueado para universal links** por los dos valores faltantes de `.well-known/` | `getStateFromPath.ts`, `communityDeepLink.ts`, `docs/DEEPLINKS.md` |
| E-098 | 2026-08-24 | Entorno | **E-093 quedó desactualizado**: daba por hecho que `CONVEX_DEPLOYMENT` no estaba configurado y que eso bloqueaba todo el §15 | El deployment SÍ está configurado localmente (`dev:academic…`). Además `npx convex codegen` no es sólo codegen: descarga el estado del deployment y **sube las funciones**, así que al regenerar la API se desplegó el schema nuevo a **dev** | El cambio es widen-only, sin backfill ni pérdida de datos, y fue a dev y no a prod. Queda pendiente revisar si E-093 sigue aplicando a **prod** (el bloqueante original mencionaba también que la GitHub App no tenía write al repo, cosa que no se verificó en esta sesión) | 🟡 Abierto — requiere que el usuario confirme el estado de prod | `.env.local`, `convex/_generated/api.d.ts` |

| E-099 | 2026-08-24 | CLI-UI | El ícono de la app salía deformado y el splash era el del template de Expo | `app.json` apuntaba `icon`, `adaptiveIcon.foregroundImage` y `favicon` al **wordmark** `logo.png` (1632×584, 2.79:1); un ícono debe ser cuadrado. No existía bloque `splash` | `scripts/generate-app-icons.js` (pngjs, remuestreo bilineal con alpha premultiplicado) genera los 4 assets desde el isotipo `public/logo.png`; `app.json` reapuntado + bloque `splash`. Nuevo `src/components/ui/Logo.tsx` deriva el ancho del aspecto real y reemplaza 3 `require()` inline con cajas de aspecto equivocado | ✅ Resuelto | `app.json`, `scripts/generate-app-icons.js`, `src/components/ui/Logo.tsx` |
| E-100 | 2026-08-24 | CLI-NAV | Desde "R Coins": el botón Home no volvía al inicio y el back de Android cerraba la app | "R Coins" no es una ruta sino `view` (estado local de `HomeScreen`), independiente de `activeTab`. `handleTabChange` no reseteaba `view`, y como login/KYC/logout hacen `navigation.reset` dejando `Home` como única entrada del stack, el back nativo no tenía nada que deshacer. No existía **ningún** `BackHandler` en `src/` | `handleTabChange` resetea `view` al tocar Home; `BackHandler` bajo `useFocusEffect` deshace de a un nivel (sub-vista → pestaña → salir) | ✅ Resuelto | `src/screens/HomeScreen.tsx` |
| E-101 | 2026-08-24 | CLI-UI | La X del menú lateral fallaba al cerrar | Área táctil de ~32px (ícono 24 + `padding: 4`) sin `hitSlop`, bajo el mínimo de 44dp; el resto de la nav sí usa `hitSlop` | Botón a `Touch.min` (44) + `hitSlop` de 12 + `accessibilityLabel` | ✅ Resuelto | `src/components/SidebarMenu.tsx` |
| E-102 | 2026-08-24 | CLI-ECO | **Cuatro tablas de reglas de R Coins contradictorias**; el frontend mostraba 5 pts por referido mientras el servidor acreditaba 500, y decía que el punto valía $0,01 cuando el canje lo paga a $0,001 | Los montos estaban duplicados como literales en `RewardsContext`, `ReferralContext`, `PointsContext` y `convex/economy.ts`. `constitution.test.tsx` comparaba los valores del frontend **contra sí mismos**, así que pasaba en verde con la divergencia puesta | Fuente única `convex/economy/_rewardRules.ts` (módulo puro, prefijo `_` = fuera del registro de Convex, mismo patrón que `_communityPolicy.ts`), importada por backend y contextos. Test reescrito para comparar frontend **contra la tabla del servidor**; verificado que falla ante una regresión simulada | ✅ Resuelto | `convex/economy/_rewardRules.ts`, `convex/economy.ts`, `convex/users.ts`, `convex/reviews.ts`, contextos, `constitution.test.tsx` |
| E-103 | 2026-08-24 | CLI-ECO | "La ruleta dice ruleta de la suerte pero no hace nada" | El backend `spinLuckyWheel` funcionaba (5–50, 1/día, idempotente). La UI era un `GlassActionCard` plano que resolvía al instante: no había rueda, ni giro, ni segmentos | `src/components/rewards/LuckyWheel.tsx` con `react-native-svg` + Reanimated. Arranca a girar antes de la respuesta (cubre latencia) y **frena en el gajo del premio que devolvió el servidor**; el cliente nunca sortea. 8 tests de la geometría | ✅ Resuelto | `src/components/rewards/LuckyWheel.tsx`, `src/components/PointsManager.tsx` |
| E-104 | 2026-08-24 | CLI-ECO | El arcade (`GamesScreen`) era inalcanzable | La pantalla estaba registrada en `App.tsx:328` pero **ninguna** pantalla navegaba a ella (`grep "navigate('Games')"` sin resultados) | Ítem "Juegos" en el menú lateral + quick action en Home | ✅ Resuelto | `src/components/SidebarMenu.tsx`, `src/screens/HomeScreen.tsx` |
| E-105 | 2026-08-24 | CLI-KYC | La verificación por email decía "código enviado" aunque no se enviara nada | `notifications.sendOTP` cae a un mock de consola si falta `RESEND_API_KEY`, pero `auth.sendVerificationEmail` descartaba ese resultado y respondía siempre "Código enviado correctamente"; encima `AuthContext` hacía `.catch(console.error)`. Un envío roto era indistinguible de uno exitoso | Flag `delivered` propagado de `sendOTP` → `sendVerificationEmail` → `AuthContext` → toast de error. `RESEND_API_KEY` agregada a `check-readiness.js` (hoy **falta** en `.env.local`, o sea el envío está mockeado) | ⚠️ **Parcialmente incorrecta — ver E-117**: la clave SÍ estaba configurada (en Convex, no en `.env.local`). El arreglo del flag `delivered` es válido; el diagnóstico de la env var era falso | `convex/notifications.ts`, `convex/auth.ts`, `src/contexts/AuthContext.tsx`, `scripts/check-readiness.js` |
| E-106 | 2026-08-24 | CLI-KYC | `phoneVerified` parecía un campo de verificación funcional | Declarado en `schema.ts` pero **ninguna mutation lo escribe** y no hay proveedor de SMS en `package.json`. Decisión del usuario: sólo email por ahora | Documentado como NO IMPLEMENTADO en el schema para que nadie lo lea como "teléfono verificado" | ✅ Resuelto (documentado) | `convex/schema.ts` |
| E-107 | 2026-08-24 | CLI-LIMP | Dos caminos de creación de órdenes y archivos huérfanos | `src/hooks/useCheckout.ts` (→ `orders.createOrder`) sin un solo import; `CreateListingScreen.tsx_append` resto de un paste; `BUSINESS_CATEGORIES` duplicada y sin uso en `CreateListingScreen`. El camino activo es webhook Stripe → `internalProcessMultiVendorCart` | Los tres borrados tras verificar por `grep` que no tenían consumidores. Queda en git | ✅ Resuelto | `src/hooks/useCheckout.ts`, `src/screens/CreateListingScreen.tsx` |
| E-108 | 2026-08-24 | CLI-LEGAL | Los términos publicaban las reglas de juegos pero no las de referidos, compras, login ni reseñas — que es justo lo que el cliente pidió "confirmar y aplicar". La comisión figuraba sin número | Redacción incompleta respecto del modelo de negocio vigente | §5 completada con la tabla íntegra (valores de `_rewardRules.ts`); §4.4 nueva con el 10%, tarifas de procesamiento aparte y el cargo de gestión explícitamente **no** etiquetado como tarifa de Stripe | ✅ Resuelto | `src/screens/TermsScreen.tsx` |

| E-109 | 2026-08-25 | CLI-KYC | 🔴 **Escalada de privilegios remota**: `/kyc-webhook` aprobaba KYC con un POST sin firma, sin secreto y sin allowlist. KYC habilita retirar fondos (`finance.ts`) | Endpoint huérfano —ningún código lo invocaba— que quedó vivo en el deployment. Stripe Identity ya tenía su propia ruta con firma verificada en el mismo archivo | Ruta eliminada. Verificado contra el deployment: `/kyc-webhook` → **404**, `/stripe-webhook` → 400 (sigue en pie rechazando sin firma) | ✅ Resuelto (dev desplegado; **prod pendiente**) | `convex/http.ts` |
| E-110 | 2026-08-25 | CLI-KYC | La verificación de email era evitable: registrarse, cerrar la app y reabrirla te dejaba adentro sin verificar | `AuthContext` hardcodeaba `emailVerified: true` y `requiresKyc: true` en 14 construcciones, descartando lo que devolvía el servidor. La sesión ya se emite en `register` (`users.ts:321`), antes del OTP | Ambos campos se leen de `userData`. `sanitizeUser` ahora expone `requiresKyc` desde el setting global — el cliente no podía deducirlo y `useActionGate` decidía sobre un dato inventado | ✅ Resuelto | `src/contexts/AuthContext.tsx`, `convex/users.ts` |
| E-111 | 2026-08-25 | CLI-KYC | Al 4º pedido de código, el usuario quedaba sin **ningún** OTP utilizable durante 10 minutos | `sendVerificationEmail` hacía `saveOtp` **antes** de que `sendOTP` chequeara el rate limit: el intento bloqueado ya había pisado en la base el código válido que el usuario quizás sí había recibido | El límite se chequea antes de generar el código. Presupuestos separados para verificación y recuperación (compartían 3 intentos, y cada login con 2FA gastaba uno), key normalizada a minúsculas (antes se evadía cambiando mayúsculas) | ✅ Resuelto | `convex/auth.ts`, `convex/notifications.ts` |
| E-112 | 2026-08-25 | CLI-KYC | 🔴 Fuerza bruta sobre el OTP: `verifyEmailCode` no limitaba intentos fallidos, y acertar sin `sessionToken` **devuelve una sesión** | El rate limit sólo cubría el ENVÍO del código, no la verificación. Con 6 dígitos y sin tope, era toma de cuenta sabiendo únicamente el email | Tope de 5 intentos por ventana vía `checkRateLimit`. De paso la expiración se comprueba antes que el valor: un código vencido decía "inválido" y mandaba al usuario a revisar dígitos correctos | ✅ Resuelto | `convex/auth.ts` |
| E-113 | 2026-08-25 | CLI-KYC | `notifications.sendOTP` era una **action pública**: cualquiera con la URL del deployment podía disparar envíos de email | Declarada `action` en vez de `internalAction` pese a que sus únicos llamadores están en `convex/auth.ts` | Pasó a `internalAction` | ✅ Resuelto | `convex/notifications.ts` |
| E-114 | 2026-08-25 | CLI-KYC | La UI mostraba "verificado" a usuarios a los que el retiro les fallaba | `sanitizeUser` devolvía el estado **efectivo** mientras `finance.requestWithdrawal` y `businessForms.createForm` leían `user.kycStatus` **crudo**. Además `listings` aceptaba `'completed'`, un valor que ninguna mutation escribe y que `fixKyc.ts` no migra, y `'skipped'` — habilitando a emitir bonos a quien no podía retirar | Fuente única `convex/_kyc.ts` (`resolveKycStatus`, `canWithdrawFunds`, `canCreateBusinessForms`, `canIssueBono`) + 10 tests. Los cuatro consumidores la usan | ✅ Resuelto | `convex/_kyc.ts`, `finance.ts`, `businessForms.ts`, `listings.ts`, `users.ts` |
| E-115 | 2026-08-25 | CLI-KYC | Usuarios encallados sin ruta de aprobación de KYC | La cola filtraba por `kycStatus === "pending" \|\| "unverified"`, dejando afuera a los `"skipped"` y a los que no tienen el campo. Además hacía `.collect()` de la tabla `users` entera | Filtro ampliado + índice nuevo `by_kyc_status` (aditivo, sin backfill) y `.take()` por estado en vez del full scan | ✅ Resuelto | `convex/adminQueries.ts`, `convex/schema.ts` |
| E-116 | 2026-08-25 | CLI-KYC | El teléfono llegaba sin validar a la cola de revisión — un solo dígito pasaba hasta la base | `RegisterScreen` sólo formateaba (cosmético, no bloquea el submit), `KYCScreen` sólo comprobaba no-vacío, y el backend aceptaba `v.string()` sin mirar. Como no hay verificación por SMS, el número es el único medio de contacto del revisor | `convex/_phone.ts` (formato, longitud E.164, rechazo de rellenos tipo `0000000`, normalización idempotente) + 16 tests. Aplicado en `users.submitKyc` y `businessForms.submitLead` | ✅ Resuelto | `convex/_phone.ts`, `convex/users.ts`, `convex/businessForms.ts` |
| E-117 | 2026-08-25 | CLI-KYC | **Corrección a E-105**: reporté que `RESEND_API_KEY` faltaba y que el email no se enviaba. Era **falso** | `check-readiness.js` la buscaba en `.env.local`, pero es un secreto de **Convex** (`.env.example` lo documenta: "Configure with `npx convex env set`"). Está configurada en dev y en prod. Causa de fondo: el parser de `.env.local` no recortaba comentarios de línea, así que metía un `CONVEX_DEPLOYMENT` corrupto en su propio entorno — invisible hasta que algo lanzó un subproceso | Los secretos de backend se verifican contra `npx convex env list`. Parser corregido. También `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` → los nombres que el código lee de verdad (`_KEY_TEST`/`_LIVE`): validaba una variable que ningún archivo consume | ✅ Resuelto | `scripts/check-readiness.js` |
| E-118 | 2026-08-25 | CLI-PUB | Doble tap = dos publicaciones idénticas y dos subidas de las mismas imágenes | `isPublishing` estaba declarado y **nunca llegaba a la UI**; los 4 botones no tenían `disabled` pese a que `button.tsx` ya lo soporta. `handlePublish` es async con `Promise.all` de uploads de por medio | `disabled`/`isLoading` en los 4 botones + guard temprano en el handler | ✅ Resuelto | `src/screens/CreateListingScreen.tsx` |
| E-119 | 2026-08-25 | CLI-PUB | Editar una publicación borraba las fotos y volvía "nuevo" un artículo usado | `initialFormState` no hidrataba `photos` ni `condition` desde `initialData`, y el update mandaba `image`/`gallery` en `undefined`, que en un `patch` de Convex **borra el campo**. Corregir un precio costaba el material visual | Hidratación desde `gallery`/`image`/`condition`; las claves de imagen se omiten en vez de mandarse `undefined`; `updateListing` descarta las claves `undefined` del patch como guard server-side | ✅ Resuelto | `src/screens/CreateListingScreen.tsx`, `convex/listings.ts` |
| E-120 | 2026-08-25 | CLI-PUB | El escrow de **toda** orden de evento no se liberaba nunca solo | `eventDate`/`eventTime` se escribían dentro del TEXTO de la descripción y nunca se mandaban estructurados, pese a que `createListing` ya los aceptaba. El cron `events-auto-release` hace `if (!res.eventDate) continue` | Se mandan estructurados en alta y en edición (`updateListing` no los aceptaba); validación de formato y de fecha futura — se podía publicar un evento para 1999 | ✅ Resuelto | `src/screens/CreateListingScreen.tsx`, `convex/listings.ts` |
| E-121 | 2026-08-25 | CLI-PUB | Se podía publicar con precio $0 y con stock negativo | `validatePrice` usaba `/^\d*\.?\d{0,2}$/`, que **matchea la cadena vacía** → `parseFloat('') \|\| 0`. El stock usaba `parseInt(x \|\| '1') \|\| 1`: `"0"` es falsy y se publicaba 1; `"-5"` es truthy y se persistía. Un producto en $0 después rompe el checkout ENTERO del comprador, porque `createPaymentIntent` rechaza montos ≤ 0 | Lógica extraída a `src/screens/createListing/_validation.ts` (puro, 36 tests) + asserts server-side en `createListing` y `updateListing` | ✅ Resuelto | `src/screens/createListing/_validation.ts`, `convex/listings.ts` |
| E-122 | 2026-08-25 | CLI-PUB | Tercer formulario de publicación huérfano y divergente | `AddEditProductScreen` estaba registrada en `App.tsx` pero **ningún `navigate` llegaba a ella**. Guardaba las imágenes con prefijo `convex-storage:`, formato que `resolveListingUrls` rechaza — si alguna vez se ruteaba, las fotos salían rotas. Aun así validaba mejor que la pantalla activa | Sus tres validaciones más estrictas (≥1 foto, descripción, estado del usado) portadas a `_validation.ts` **antes** de borrarla. Pantalla y ruta eliminadas | ✅ Resuelto | `App.tsx`, `src/screens/marketplace/AddEditProductScreen.tsx` |

| E-123 | 2026-08-25 | CLI-COMP | 🔴 **El stock NUNCA se descontaba en una compra real.** Un producto con stock 1 se podía vender indefinidamente | Existían dos implementaciones correctas (`listings.purchaseItem`, `orders.createOrder`) y **ninguna tenía call sites**. El camino vivo —webhook → `internalProcessMultiVendorCart` → `internalCreateSubOrder`— no tocaba `listings.stock` en ninguna línea. Los guards de `cart.ts` nunca disparaban porque el stock jamás bajaba | `convex/_inventory.ts` (puro, 13 tests) + descuento transaccional en `internalCreateSubOrder`. **Además** revalidación en `createPaymentIntent`: rechazar antes de cobrar es la única defensa real; después del cobro se descuenta igual, se acota en 0 y el faltante queda en `orders.stockShortfall` — fallar ahí dejaría dinero tomado sin orden | ✅ Resuelto | `convex/_inventory.ts`, `convex/stripe.ts`, `convex/schema.ts` |
| E-124 | 2026-08-25 | CLI-COMP | 🔴 **El vendedor no podía marcar una orden como enviada. Nunca** | Las órdenes del checkout nacen en `paid_escrow` y `markAsShipped` exigía `payment_received`. `markAsDelivered` exigía `in_transit`, inalcanzable en consecuencia. `confirmReceipt` ya había sido parchado para aceptar `paid_escrow` — alguien arregló un eslabón y no el resto de la cadena | `convex/orders/_orderStates.ts` (puro, 13 tests) con la tabla completa de transiciones. Los estados desconocidos fallan cerrado | ✅ Resuelto | `convex/orders/_orderStates.ts`, `convex/orders.ts` |
| E-125 | 2026-08-25 | CLI-COMP | 🔴 **La dirección de envío se recolectaba y se tiraba.** El vendedor no sabía adónde despachar | `CartScreen` armaba el formulario completo y lo mandaba en `route.params`, pero `PaymentScreen` **nunca leía** `shippingDestination`, y `internalCreateSubOrder` no tenía campo de envío | Cadena completa: `CartScreen` → `PaymentScreen` → `PaymentForm` → `createPaymentIntent` → registro de `payments` → webhook → orden. Viaja por el registro de pago y no por la metadata del PI, donde los valores son strings de 500 caracteres. `orders.shipping.address` ensanchado con `addressLine2`/`state`/`phone` (el formulario ya los pedía y no tenían dónde guardarse) | ✅ Resuelto | `PaymentScreen.tsx`, `PaymentForm.tsx`, `convex/stripe.ts`, `convex/schema.ts` |
| E-126 | 2026-08-25 | CLI-COMP | Órdenes con un vendedor que no existe, escrow trabado para siempre | El fallback `sellerId: item.snapshot?.sellerId \|\| "ramgos"` inserta un string que no es el `_id` de ningún usuario: `normalizeId("users","ramgos")` devuelve `null` y todos los caminos de liberación fallan | Los items sin vendedor identificable se saltan y se registran, en vez de inventar uno. El resto del carrito se procesa igual porque el cobro ya ocurrió | ✅ Resuelto | `convex/stripe.ts`, `src/screens/PaymentScreen.tsx` |
| E-127 | 2026-08-25 | CLI-COMP | El carrito de invitado se perdía entero al iniciar sesión — justo en el paso de pagar | `guestItems` vivía sólo en memoria y `gateCheckout` manda a `Login`; al volver autenticado `items` pasaba a `serverItems`, vacío. Documentado como "alcance de la Fase 4" desde hacía tiempo | Persistencia en AsyncStorage (sobrevive al login social, que abre el navegador) + volcado al servidor vía la mutation normal, así el snapshot se reconstruye desde la base. El storage se limpia siempre, incluso con items fallidos: si no, un listing borrado reintentaría en cada login | ✅ Resuelto | `src/contexts/CartContext.tsx` |
| E-128 | 2026-08-25 | CLI-COMP | `gateCheckout` dejaba pagar sin verificar el email y con el usuario sin cargar | `pending_verification` caía al `return null` final, cuando `gateSellPublishWithdraw` sí lo bloquea. Y `authenticated && !user` pasaba, dejando `userId` undefined → `PaymentForm` cortaba la carga de tarjetas **en silencio** | Ambas ramas cubiertas, reusando el patrón de la otra compuerta en vez de inventar un `GateReason` nuevo | ✅ Resuelto | `src/utils/useActionGate.ts` |
| E-129 | 2026-08-25 | CLI-COMP | 🔴 **`confirmReceipt` marcaba la orden como liberada sin mover un peso** | `createPaymentIntent` crea el registro de pago SIN `orderId` (la orden aún no existe) y `internalCreateSubOrder` nunca hacía el back-link. `internalGetPaymentAndAccounts` devolvía `null` siempre en el flujo de carrito y `internalReleasePaymentAction` **retornaba en silencio** — pero `confirmReceipt` ya había puesto `completed`/`released` | Back-link `payments.orderId` + `sellerId` al crear la sub-orden, con fallback por `stripePaymentIntentId` para las órdenes viejas. Y el fallo dejó de ser mudo: `internalFlagEscrowReleaseFailed` devuelve la orden a `held` y registra `escrowReleaseError` — mejor una orden que se ve pendiente que una que miente | ✅ Resuelto | `convex/stripe.ts`, `convex/schema.ts` |
| E-130 | 2026-08-25 | CLI-COMP | Un fallo a mitad del webhook descartaba el reintento de Stripe: cobro sin orden, para siempre | `recordPaymentEvent` inserta la fila con `processed: false` **antes** de procesar, pero cualquier fila existente se consideraba "ya procesado". Encima `markPaymentEventProcessed` marcaba `processed: true` aun con error, y el webhook devolvía **200**, con lo cual Stripe dejaba de reintentar | Sólo se considera procesado lo que se completó; un evento incompleto se reintenta. `processed: !error`. El webhook devuelve **500** ante fallo para que Stripe reintente | ✅ Resuelto | `convex/finance.ts`, `convex/http.ts` |
| E-131 | 2026-08-25 | CLI-COMP | La reconciliación no detectaba el caso que deja un webhook perdido | Con el registro de pago existente y el monto correcto, "cobrado sin orden" se colaba entre `no_local_payment` y `amount_mismatch` | Regla nueva `paid_without_order`. Además el `throw` del **nivel superior** de `reconciliation.ts` pasó adentro del handler: sin `STRIPE_SECRET_KEY` el módulo entero no cargaba, y con él todas sus funciones | ✅ Resuelto | `convex/reconciliation.ts` |
| E-132 | 2026-08-25 | CLI-COMP | El envío se cobraba y no quedaba registrado en ninguna orden | `buildLineItems` agrega una línea sintética de envío para que el total del PI cuadre, pero `internalProcessMultiVendorCart` calculaba el subtotal sólo de los items: `Σ(sub-órdenes) ≠ pi.amount` siempre que hubiera envío | El costo se adjunta a la PRIMERA sub-orden (repetirlo en todas lo contaría de más); la dirección va en todas, porque cada vendedor despacha por separado | ✅ Resuelto | `convex/stripe.ts` |
| E-133 | 2026-08-25 | CLI-COMP | `buildLineItems` etiquetaba como `'product'` a bonos, eventos y servicios | `type: 'product'` hardcodeado, y `PaymentScreen` tampoco propagaba `item.type` pese a existir en `CartItem`. Viajaba así hasta la atribución de campañas | Se propaga el tipo real | ✅ Resuelto | `PaymentForm.tsx`, `PaymentScreen.tsx` |
| E-134 | 2026-08-25 | CLI-LEGAL | Plazo de devolución desalineado con el documento del cliente | Los términos daban 7 días; el documento dice 10 días hábiles | Actualizado a 10 días hábiles. Se agregó explícito que abrir un reclamo **congela** el conteo de la retención: con 10 y 10, una devolución pedida el último día correría carrera con la liberación automática | ✅ Resuelto (texto) / 🟡 la lógica de congelamiento se implementa en la Parte 2 | `src/screens/TermsScreen.tsx` |
| E-135 | 2026-08-25 | Parte 2 (Stripe) — Bloques 0/1 | Sesión con trabajo en paralelo de otras IAs (commits "pagos"/"comisiones"/"fix tipos") que rompió el build de Vercel y dejó comisiones a 3 tasas distintas; más un bug propio encontrado en revisión, más severo que lo documentado en el plan original | (a) 3 pantallas admin nuevas usaban una API de colores inexistente y `<Button title=…>` (el componente real sólo acepta `children`) → build de Vercel roto; (b) sólo 1 de 3 sitios de comisión pasó a 10%, los otros 2 seguían en 12%; (c) 🔴 **hallazgo propio**: en un carrito multi-vendedor, el back-link pago↔orden sólo se hacía para la 1ª sub-orden — desde la 2ª, `internalReleasePaymentAction` transfería el `sellerNet` del CARRITO ENTERO a CADA vendedor (2 vendedores = se pagaba el doble de lo cobrado); (d) el onboarding de Connect reportado roto por el usuario en vivo ("missing required field userId") — el código de negocio ya pasaba `userId` correctamente, pero **los influencers no tenían ningún botón de onboarding** (pantalla sin ese flujo); (e) `EXPO_PUBLIC_STRIPE_KEY` sin sufijo, con una clave `pk_live_` real cargada en `.env.local`, servía de fallback tanto a modo test como live | `_roles.ts`/`_audit.ts`/`_fees.ts` nuevos (módulos puros); 3 escaladas a admin cerradas (dominio de email, `register` público, `syncUser`); `developer` restringido a soporte técnico, sin acciones de dinero; auditoría cableada a las 7 acciones que mueven plata o privilegios; toggle test/live restringido a admin/`isTest` en los 3 sitios (antes accesible a cualquier usuario logueado, incluido en pleno checkout); fallback peligroso de clave eliminado; `Button`/colores corregidos; `_fees.ts` como fuente única (10% marketplace, 30% bonos) consumida por los 3 sitios; **el fix real del bug de multi-vendedor**: `internalReleasePaymentAction` ahora transfiere `order.netAmountCents` (prorrateado por sub-orden desde el `sellerNet` real del pago) en vez de `payment.sellerNet` (el del carrito completo); botón de onboarding de Connect agregado a `InfluencerDashboardScreen` (no existía); código muerto con tasas conflictivas borrado (`CommissionUtils.ts`, `paymentSplitter.ts`); cámara del scanner de QR de negocio pasada de un cálculo de ancho fijo en el import del módulo a `useWindowDimensions` + `aspectRatio:1` reactivo (1:1 real, no un rectángulo vertical) | ✅ Bloque 0 completo (0.1–0.7) · ✅ Bloque 1.1/1.2/1.2b/1.3 · 🔴 Bloque 1 resto (captura de fee real de Stripe, campos de schema, `.take(5000)`, desglose en `SellerWalletScreen`/admin, `ledgerAdjustments`), Bloques 2–5 completos (días hábiles, reembolsos/contracargos reales, liquidaciones, documento de Connect, QA) **pendientes** — ver `C:\Users\franc\.claude\plans\rol-eres-un-ingeniero-resilient-bear.md` [✅ **actualización 2026-09-02**: ese plan quedó resuelto — el fix `losses_collector: "application"` que documentaba ya está en `main` desde `c836550`, y los Bloques 2–5 ahora los cubre el trabajo de E-136] | `convex/_roles.ts`, `convex/_audit.ts`, `convex/_fees.ts`, `convex/stripe.ts`, `convex/finance.ts`, `convex/users.ts`, `convex/settings.ts`, `convex/adminQueries.ts`, `convex/commerce.ts`, `src/contexts/PaymentModeContext.tsx`, `src/payments/components/PaymentModeToggle.tsx`, `src/screens/{CartScreen,SettingsScreen,BusinessDashboardScreen,InfluencerDashboardScreen,BusinessScannerScreen}.tsx`, `src/screens/admin/AdminOrderDetailsScreen.tsx` |
| E-136 | 2026-09-02 | Parte 2 (Stripe) — Bloques 2-5 | El branch remoto `origin/claude/citas-perfil-comercial-2a3t23` (3 commits de otra sesión, "Stripe Connect completo") traía una reescritura bi-modal completa de Connect que nunca se había integrado a `main`, resolviendo 6 de los 8 gaps documentados en `docs/ARQUITECTURA_STRIPE_CONNECT_SPLIT.md` | `git merge-tree` confirmó cero conflictos con `main` (el branch parte de `c836550`, que ya incluye el fix de doble-cobro multi-vendedor y `losses_collector: "application"`). Mergeado en `integrate/stripe-connect-rewrite` (no en `main` todavía). Al correr `npx convex typecheck` (que usa `convex/tsconfig.json`, `strict: false`) aparecieron 11 errores en `convex/stripe.ts:internalReleaseOrderEscrow` — un discriminated union (`ReleaseBegin`) que TS no narrowea tras el early-return de `alreadyReleased` bajo ese tsconfig, aunque sí narrowea bajo `tsconfig.check.json` (root, `strict: true`) — el branch nunca se verificó con `npx convex typecheck`, sólo con el tsc del proyecto. También se confirmó un riesgo operacional real no cubierto por tipos: `reconciliationCursor.scope` pasa de `"stripe-bt"` a `"stripe-bt:live"/"stripe-bt:test"`, lo que resetearía el cursor del cron de reconciliación a null sin migrar | Merge a rama de integración (sin tocar `main`); cast explícito (`as Extract<ReleaseBegin, {alreadyReleased:false}>`) en vez de depender del narrowing implícito en `internalReleaseOrderEscrow`; gap #5 (webhook V1 `account.updated`, antes un `console.log` silencioso) cerrado con `console.warn` explícito; migración de un solo uso `convex/migrations/reconciliationCursorScopeSplit.ts` creada y lista, pendiente de ejecución manual del usuario contra prod (no se corrió en esta sesión — requiere acceso a datos reales). Verificado: `npm run lint`, `npm test -- --passWithNoTests` (340/340), `npx convex typecheck`, `npm run typecheck`, `node scripts/check-readiness.js`, todos limpios | 🟡 Rama lista y verificada, **no mergeada a `main`, sin push**. Pendiente: usuario carga env vars nuevas (Convex + Stripe Dashboard), corre la migración del cursor, decide cuándo mergear/pushear, y hace QA con Stripe test mode real | `convex/http.ts`, `convex/stripe.ts`, `convex/migrations/reconciliationCursorScopeSplit.ts`, `docs/PLAN_ESTRATEGICO_MAESTRO.md` |
| E-137 | 2026-09-02 | Parte 2 (Stripe) — Connect | 🔴 **El onboarding de Connect estaba bloqueado en runtime**: al tocar "vincular cuenta de pagos", Stripe rechazaba `v2.core.accounts.create` con `Unknown field: capabilities.stripe_balance.payouts`. Ningún vendedor ni influencer podía vincular su cuenta. Encontrado en el primer QA runtime tras el merge de E-136 | En la API V2 (`2026-06-24.dahlia`), `configuration.recipient.capabilities.stripe_balance` es **asimétrica**: en los params de **create** y **update** sólo existe `stripe_transfers`, mientras que en el objeto de **respuesta** existen `stripe_transfers` **y** `payouts`. O sea `payouts` se **lee** pero no se **solicita**. Verificado en los tipos del SDK instalado (`node_modules/stripe/cjs/resources/V2/Core/Accounts.d.ts`: create 4327-4331, update 6206-6210, respuesta 2065-2073) y corroborado por las **dos** implementaciones de referencia del propio repo (`samples/stripe-connect-v2/server.js:224-230` y `ref_tools/app/api/create-connect-account/route.js:26-32`), que piden únicamente `stripe_transfers`. El rewrite de E-136 había agregado `payouts: { requested: true }` asumiendo simetría | (a) Sacada la capability no solicitable del payload de `ensureConnectAccount`; (b) efecto colateral resuelto: `canPayout` se derivaba de `payoutsStatus === 'active'` y gatea `WithdrawalScreen.tsx:125` — si Stripe nunca reporta esa capability (su `Status` admite `'unsupported'`), la pantalla de retiros quedaba muerta para vendedores correctamente onboardeados. Pasó a un OR **monótono** (`payoutsStatus === 'active' \|\| (transfersStatus === 'active' && onboardingComplete)`): superconjunto estricto de la regla vieja, así que no puede romper una cuenta que ya funcionaba, y la 2ª rama reusa la definición de "cuenta activa" que ya usaba `internalSaveConnectFlags`; (c) lógica extraída a `convex/_connectCaps.ts` (módulo puro, misma convención que `_split.ts`/`_stripeEnv.ts`) con 8 tests nuevos, incluida una property que verifica la monotonía — antes era intesteable porque vivía dentro de un archivo que importa el runtime de Convex; (d) corregida la doc que afirmaba lo contrario (cabecera de `connect.ts` y `PAYMENTS_SETUP.md`). **Sin cuentas huérfanas que limpiar**: el 400 fue de validación de parámetros, antes de crear el recurso, y `internalSaveConnectAccount` sólo corre tras un create exitoso. De yapa el punto (b) revive las cuentas creadas *antes* de que se agregara la capability, que también verían `canPayout: false` para siempre | 🟡 Fix desplegado (348/348 tests, ambos typecheck limpios), **pendiente QA runtime del usuario**: rehacer "vincular cuenta de pagos" en test y reportar qué trae `users.stripeConnectCapsTest.payoutsStatus` — eso confirma si Stripe auto-provisiona la capability o si el fallback es lo único que sostiene la pantalla de retiros | `convex/_connectCaps.ts`, `convex/connect.ts`, `convex/__tests__/connectCaps.test.ts`, `docs/PAYMENTS_SETUP.md` |
| E-138 | 2026-09-02 | Parte 2 (Stripe) — Connect | 🔴 **El link de onboarding fallaba siempre**, con la cuenta ya creada: `v2.core.accountLinks.create` devolvía `return_url must be a valid URL and start with https:// or, during testing, http://`. Apareció apenas se destrabó E-137 — es el paso inmediatamente siguiente del mismo flujo | El default era `CONNECT_RETURN_URL_BASE = 'ramgos://connect'` (esquema custom de la app). Stripe **no acepta esquemas custom** en `return_url`/`refresh_url`: exige https, y sólo tolera `http://localhost` en modo test. O sea el default no podía funcionar en ningún escenario. `docs/PAYMENTS_SETUP.md` ya insinuaba el problema ("si Stripe rechaza el esquema, usar https://ramgos.app/connect") pero el código nunca lo aplicó. Segundo problema, específico de web: aun con una URL https fija, al dev que prueba en `http://localhost:8081` Stripe lo devolvía a producción, con otra sesión | `convex/_connectReturnUrl.ts` (módulo puro, 15 tests): resuelve la base del retorno con prioridad (1) origen que propone el cliente si pasa una **allowlist** —`window.location.origin` en web, y localhost sólo en modo test, que es la propia regla de Stripe—, (2) `STRIPE_CONNECT_RETURN_URL_BASE` si es http(s), (3) default `https://ramgos.app/connect`. Un valor con esquema custom se **ignora** aunque esté en la env var, porque Stripe lo rechazaría igual. La allowlist es un requisito de seguridad, no cosmético: el origen viaja a un tercero y sin validar sería un redirect abierto. El retorno a la app nativa no se pierde: `ramgos.app` ya está configurado como universal link / app link (`app.json` + `public/.well-known/`), y `App.tsx` ya declara la ruta `connect/:result` | 🟡 Fix desplegado a dev (359/359 tests, ambos typecheck limpios), **pendiente QA runtime del usuario**: rehacer el onboarding y confirmar que Stripe abre el formulario y devuelve a la app | `convex/_connectReturnUrl.ts`, `convex/connect.ts`, `convex/__tests__/connectReturnUrl.test.ts`, `src/hooks/useConnectOnboarding.ts`, `docs/PAYMENTS_SETUP.md` |
| E-139 | 2026-09-02 | Parte 2 (Stripe) — Checkout | 🔴 **El checkout no podía completarse**: `createPaymentIntent` fallaba con `ArgumentValidationError: Object contains extra field 'grossCents' that is not in the validator. Path: .checkoutSnapshot.lineItems[0]`. Encontrado en el primer intento de compra del E2E, con el PaymentIntent **ya creado en Stripe** (`phase: success`) — la escritura del pago se caía después | Desajuste entre el cálculo y el schema: `SplitLine` (`_split.ts:34-40`) incluye `grossCents` (= `unitCents * quantity`, la base sobre la que se calculan `commissionCents` e `influencerCents` de la línea) y `stripe.ts` lo persiste en el snapshot, pero `checkoutLineValidator` (`schema.ts:34-49`) nunca lo declaró. Convex rechaza el objeto entero por un campo de más, así que se caía el snapshot completo. Comparados los tres validadores contra lo que produce el split: `checkoutSellerSplitValidator` y `checkoutSnapshotValidator` coincidían exactos, el único faltante era éste | `grossCents: v.number()` agregado a `checkoutLineValidator`. Además `convex/__tests__/checkoutSnapshotShape.test.ts` (5 tests): compara **en las dos direcciones** los campos que produce `computeCheckoutSplit` contra los que declaran los validadores (campos de más, obligatorios faltantes, en línea / seller / snapshot). Nada ataba el cálculo al schema, que es por lo que el desajuste llegó a runtime pese a que ambos módulos ya tenían tests propios | 🟡 Fix desplegado a dev (364/364 tests, ambos typecheck limpios), pendiente que el usuario reintente la compra | `convex/schema.ts`, `convex/__tests__/checkoutSnapshotShape.test.ts` |
| E-140 | 2026-09-02 | Parte 2 (Stripe) — Webhook | 🔴 **El pago se cobra y del lado del servidor no pasa NADA.** Síntoma reportado: "pasa el pago pero queda en el carrito lo que puse para comprar". El carrito era sólo lo visible | El secreto de firma del webhook de test (`STRIPE_WEBHOOK_SECRET_TEST`, deployment dev) tenía **el mismo valor que el de live** — verificado comparando hashes sin exponer valores. En Stripe, test y live firman con secretos distintos, así que `verifyStripeEvent` fallaba siempre. `convex/http.ts:84-88` devuelve 400 y **retorna ahí mismo**: la línea 99 (`recordPaymentEvent`) nunca se alcanza, así que el rechazo **no deja rastro en la base** — sólo en los logs de Convex y en el dashboard de Stripe. Diagnóstico confirmado con 4/4 indicadores: cero filas en `paymentEvents` para la fecha, `payments.status = "pending"`, `internalGetOrdersForPaymentIntent` → `[]`, y `cart` intacto | Es un fallo de **configuración**, no de código: se corrige cargando el `whsec_` real del destino de test y reenviando el evento desde el Dashboard de Stripe (el backend lo procesa como si recién llegara y recupera la compra huérfana). Lo que el incidente **sí** dejó al descubierto, y queda como deuda: (a) **el vaciado del carrito y TODO el post-pago dependen exclusivamente del webhook** — `internalClearCart` vive en `stripe.ts:767`, dentro de `internalProcessPaidCheckout`, y el cliente nunca lo llama (grep sin resultados de `clearCart`/`useCart` en `src/payments/` y `PaymentScreen.tsx`); sin webhook no se crea la orden, no se descuenta stock, no se debitan los puntos canjeados (el usuario se lleva el descuento **y** los puntos), el pago queda `pending` y el vendedor nunca cobra; (b) **`PaymentScreen` canta éxito con el confirm de Stripe**, sin esperar a que la orden exista: el comprador ve "listo" y se queda sin nada, en silencio; (c) 🔴 **punto ciego de la reconciliación**: la regla `paid_without_order` (`reconciliation.ts:259-311`) filtra por `status === "succeeded" \|\| "succeeded_in_escrow"`, pero un webhook que **nunca llegó** deja el pago en `pending` (`stripe.ts:427`), así que se cuela entre las tres reglas. La red de seguridad cubre "llegó y falló procesando", no "nunca llegó" | 🟡 Diagnóstico cerrado y config pendiente del usuario (cargar `STRIPE_WEBHOOK_SECRET_TEST` + `STRIPE_WEBHOOK_SECRET_THIN_TEST`, que tampoco existe, y reenviar el evento). Las tres deudas (a)(b)(c) quedan **abiertas** para retomar después del E2E; (c) es la más seria porque hoy nada detecta un cobro sin orden por webhook ausente | `convex/http.ts`, `convex/stripe.ts`, `convex/reconciliation.ts`, `src/screens/PaymentScreen.tsx` (ninguno modificado todavía — diagnóstico) |

**Plantilla para nuevas entradas:**

```markdown
| E-0XX | YYYY-MM-DD | N | [síntoma] | [causa] | [fix] | 🟡/✅ | [archivo] |
```

---

## 17. Protocolo de mantenimiento y reanálisis del plan

Este documento es la **fuente de verdad viva** del proyecto. Los agentes deben mantenerlo actualizado.

### 17.1 Cuándo actualizar el plan (obligatorio)

| Trigger | Qué actualizar |
|---|---|
| **Al cerrar una fase** | §15 (tablero), checklist de la fase, §16 si hubo errores, versión en cabecera |
| **Al encontrar un bloqueante** | §16 (nueva fila), §15 estado 🔴, checklist de la fase |
| **El usuario dice** *"actualizá el plan"* / *"actualizar PLAN_ESTRATEGICO"* | Reanálisis completo (§17.2) |
| **Después de un PR grande** | §15, `py -m graphify update .`, comparar commit vs cabecera |
| **Cambio de arquitectura importante** | Reanálisis + posible reestructuración (§17.3) |

### 17.2 Reanálisis interno estándar (cada actualización)

Ejecutar en orden — **no saltar pasos:**

```
1. py -m graphify update .
2. py -m graphify query "<tema de la fase o bloqueante>"
3. Leer graphify-out/GRAPH_REPORT.md (solo hubs relevantes)
4. git status + git diff --stat (estado real vs plan)
5. npm.cmd run typecheck (si aplica)
6. npm.cmd run test:constitution (si aplica)
7. Actualizar §15, §16 y checklist de la fase afectada
8. Incrementar versión del plan si cambió estructura (1.0 → 1.1)
```

### 17.3 Reanálisis intensivo para reestructuración

**Activar cuando:**

- Una fase lleva **>2 sesiones** sin cerrar el mismo checklist item
- Surge un **bug crítico** no previsto en §13 (riesgos)
- El grafo muestra **dependencias nuevas** que invalidan el orden de fases
- El usuario pide **replanificar** o cambiar prioridades

**Procedimiento:**

1. **Congelar scope** — no implementar features nuevas durante el reanálisis.
2. **Inventario diff** — `git diff [base]...HEAD` + tabla archivos vs plan.
3. **Queries graphify dirigidas:**
   ```powershell
   py -m graphify query "security risks IDOR auth payments"
   py -m graphify path "AuthContext" "orders.ts"
   py -m graphify explain "requireActor"
   ```
4. **Matriz impacto** — para cada ítem del plan: ¿sigue válido? ¿obsoleto? ¿nueva dependencia?
5. **Propuesta de cambio** — escribir en §16 como entrada `E-RESTRUCT-XXX` con:
   - Qué sección del plan cambia
   - Por qué
   - Qué fases se reordenan o dividen
6. **Aplicar cambios al plan** — solo tras el reanálisis; diff mínimo en el markdown.
7. **Notificar al usuario** — resumen de 5 bullets: qué cambió en el plan y por qué.

### 17.4 Qué NO hacer al actualizar el plan

- ❌ Marcar una fase ✅ sin checklist verde
- ❌ Borrar entradas de §16 (bitácora es histórica)
- ❌ Mezclar tareas de fases distintas en una misma sesión sin anotarlo
- ❌ Actualizar el plan sin correr graphify si hubo cambios de código

### 17.5 Responsabilidad de los agentes (AGENTS.md / CLAUDE.md)

Al **final de cada fase** o cuando el usuario lo pida, el agente debe:

1. Actualizar `PLAN_ESTRATEGICO_MAESTRO.md` (§15, §16, checklist de fase).
2. Reportar al usuario: tabla ✅/❌ + comandos para probar manualmente.
3. **No crear commits** salvo que el usuario lo pida explícitamente.

---

## Apéndice A — Comandos rápidos

```powershell
# Graphify  (py -3.11: el py por defecto es 3.13 y no lo tiene — E-060)
py -3.11 -m graphify update .
py -3.11 -m graphify query "tu pregunta"
start graphify-out\GRAPH_REPORT.md
start graphify-out\graph.html

# Validación
npm run typecheck
npm run test:constitution
npm audit

# Convex
npx convex codegen            # SOLO genera tipos locales — NO deploya (E-061)
npx convex dev                # deploya y queda escuchando
npx convex deploy
npx convex function-spec      # qué hay realmente publicado en el deployment

# Freshness
git rev-parse HEAD
# comparar con línea "Built from commit" en GRAPH_REPORT.md
```

## Apéndice B — Documentos relacionados en el repo

| Archivo | Contenido |
|---|---|
| `graphify-out/GRAPH_REPORT.md` | Mapa vivo del código |
| `A_Z_Test_Report.md` | Bugs documentados |
| `AGENTS.md` / `CLAUDE.md` | Reglas para agentes IA |
| `convex/_generated/ai/guidelines.md` | Guidelines Convex |
| `STORE_READY_BASELINE.md` | Requisitos tiendas |
| `SECURITY_SIGNOFF.md` | *(crear en Bloque C6)* |

---

*Documento vivo — versión 1.6. Mantener §15–§17 actualizados. Ver §17 para protocolo de reanálisis.*
