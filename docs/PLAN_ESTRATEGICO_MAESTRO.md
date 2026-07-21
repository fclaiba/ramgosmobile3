# Plan Estratégico Integral Maestro — Ramgos Mobile

> **Versión:** 1.5 · **Última actualización plan:** 2026-07-13 · **Commit base grafo:** post-Fase-6-código  
> **Fase activa:** Fase 7 — **Fases 1–2 y 6 cerradas** · **Fases 3–5 código listo, QA manual + push Convex diferidos (§12.4 / tarea final Fase 5)**  
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
py --version                    # Python 3.11.9
py -m graphify --version        # graphify 0.9.13
py -m graphify update .         # actualizar grafo (sin costo API)
py -m graphify query "..."      # consultar
start graphify-out\graph.html   # visualizar
```

> **Nota:** Usar `py`, no `python` (alias de Microsoft Store roto en Windows).

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

**Leyenda:** ✅ Cerrada · 🟡 En curso · 🔴 Bloqueada · ⚪ Pendiente

---

## 16. Bitácora de ejecución (errores y soluciones)

> Cada agente **añade una fila** al terminar una sesión o al resolver un error. No borrar entradas; marcar como RESUELTO.

| ID | Fecha | Fase | Error / síntoma | Causa raíz | Solución aplicada | Estado | Referencia |
|---|---|---|---|---|---|---|---|
| E-001 | 2026-07-13 | 1 | Expo web: `Unable to resolve "fbjs/lib/invariant"` | `node_modules/fbjs` corrupto/vacío | `npm.cmd install fbjs@3.0.5` | ✅ Resuelto | `react-native-web` → AppRegistry |
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
# Graphify
py -m graphify update .
py -m graphify query "tu pregunta"
start graphify-out\GRAPH_REPORT.md
start graphify-out\graph.html

# Validación
npm run typecheck
npm run test:constitution
npm audit

# Convex
npx convex dev
npx convex deploy

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

*Documento vivo — versión 1.2. Mantener §15–§17 actualizados. Ver §17 para protocolo de reanálisis.*
