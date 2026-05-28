# Dev Completeness Audit — Ramgos Mobile

Fecha: `2026-05-19 20:47 UTC`  
Generado por: `scripts/dev_completeness_audit.py`

## 1) Resumen ejecutivo

- **Score global: `87.7%`** — Estado: `WARN`
- Total gaps detectados: **24**
- Módulos auditados: 14

## 2) Score por módulo

| Módulo | Score | Gaps | Estado |
|---|---:|---:|---|
| Social (posts, stories, DMs, follows, grupos, highlights) | 38% | 9 | FAIL |
| Auth / KYC | 85% | 2 | WARN |
| Marketplace / Listings | 85% | 2 | WARN |
| Orders / Escrow / Disputas | 85% | 2 | WARN |
| Influencer / Campaigns | 85% | 2 | WARN |
| Games / MiMascota / Raffles | 85% | 2 | WARN |
| General | 85% | 2 | WARN |
| Settings / Perfil de usuario | 90% | 1 | GO |
| Pagos / Stripe / Escrow financiero | 95% | 1 | GO |
| IAP — In-App Purchases (Apple + Google) | 95% | 1 | GO |
| Push Notifications (backend-triggered) | 100% | 0 | GO |
| Wallet / Puntos / Rewards | 100% | 0 | GO |
| Help Center / Soporte | 100% | 0 | GO |
| Admin Dashboard | 100% | 0 | GO |

## 3) Detalle por módulo

---

### Auth / KYC — 85% (2 gaps)

#### Checks fallidos

**[HIGH]** Función KYC en identity.ts
- Detalle: Buscando `startKyc|createVerificationSession` en convex/identity.ts — NO ENCONTRADO
- Accion: Implementar startKyc en convex/identity.ts.

#### Gaps detectados por escaneo de código

**[MEDIUM]** `src/contexts/AuthContext.tsx:198` ×4 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
const sendOtpActionCall = useAction((api as any).notifications?.sendOTP || api.users.syncUser);
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

### Social (posts, stories, DMs, follows, grupos, highlights) — 38% (9 gaps)

#### Checks fallidos

**[HIGH]** Mutación followUser en Convex
- Detalle: Buscando `followUser` en convex/social.ts — NO ENCONTRADO
- Accion: Implementar followUser en convex/social.ts.

**[HIGH]** Mutación sendMessage (DMs) en Convex
- Detalle: Buscando `sendMessage` en convex/social.ts — NO ENCONTRADO
- Accion: Implementar sendMessage en convex/social.ts.

**[HIGH]** Mock data hardcodeado en SocialContext
- Detalle: Patrón `INITIAL_POSTS|MOCK_USERS|MOCK_CHATS` ENCONTRADO (no debería estar)  en src/contexts/SocialContext.tsx
- Accion: Eliminar INITIAL_POSTS / MOCK_USERS y conectar al backend Convex.

#### Gaps detectados por escaneo de código

**[HIGH]** `src/contexts/SocialContext.tsx:464` ×4 — Función stub — no persiste datos en Convex
```
console.warn('[social] highlights not persisted in v1');
```
- Accion: Implementar la mutación/tabla Convex correspondiente.

**[MEDIUM]** `src/contexts/SocialContext.tsx:316` ×12 — Constante EMPTY_* usada como datos — feature sin implementar
```
const EMPTY_TRENDING: TrendingTopic[] = [];
```
- Accion: Conectar a la query Convex correspondiente.

**[MEDIUM]** `src/contexts/SocialContext.tsx:474` — retweetPost es no-op — no hay tabla de reposts
```
// Retweet is currently not persisted (no backing table). Kept as no-op
```
- Accion: Implementar socialReposts en Convex si el producto lo requiere.

**[MEDIUM]** `src/contexts/SocialContext.tsx:607` — savedPosts solo en memoria (no persiste entre sesiones)
```
// savedPosts not yet persisted — kept as in-memory until v1.1.
```
- Accion: Implementar tabla socialSavedPosts en Convex.

**[MEDIUM]** `src/contexts/SocialContext.tsx:660` — suggestedUsers hardcodeado como [] sin backend
```
suggestedUsers: [],
```
- Accion: Implementar query api.social.getSuggestedUsers en Convex.

**[LOW]** `src/contexts/SocialContext.tsx:522` — Función marcada como deprecated en contexto
```
console.warn('[social] deleteComment via context is deprecated — use api.social.deleteComment.');
```
- Accion: Actualizar los consumidores para usar la API directa de Convex.

---

### Marketplace / Listings — 85% (2 gaps)

#### Checks fallidos

**[MEDIUM]** Pantalla importada sin Stack.Screen: AddEditProductScreen
- Detalle: AddEditProductScreen (src/screens/marketplace/AddEditProductScreen) está importada en App.tsx pero no tiene <Stack.Screen>.
- Accion: Agregar <Stack.Screen name="..." component={AddEditProductScreen} /> en App.tsx.

#### Gaps detectados por escaneo de código

**[HIGH]** `convex/listings.ts:223` — Comentario TODO/FIXME en código
```
// TODO: Record Order in 'orders' table (if we add it to schema)
```
- Accion: Resolver el TODO o abrir un ticket y remover el comentario.

---

### Orders / Escrow / Disputas — 85% (2 gaps)

#### Checks fallidos

**[HIGH]** Mutación createDispute
- Detalle: Buscando `createDispute` en convex/disputes.ts — NO ENCONTRADO
- Accion: Implementar createDispute en convex/disputes.ts.

#### Gaps detectados por escaneo de código

**[MEDIUM]** `src/screens/marketplace/CheckoutScreen.tsx:46` ×3 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
const createPaymentIntent = useAction(stripeCreatePaymentIntentRef || api.users.syncUser);
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

### Pagos / Stripe / Escrow financiero — 95% (1 gaps)

#### Gaps detectados por escaneo de código

**[MEDIUM]** `src/screens/PaymentMethodsScreen.tsx:66` ×5 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
_api.stripe?.listPaymentMethods || api.users.syncUser,
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

### IAP — In-App Purchases (Apple + Google) — 95% (1 gaps)

#### Gaps detectados por escaneo de código

**[MEDIUM]** `src/screens/SubscriptionPlansScreen.tsx:45` ×3 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
_api.subscriptions?.createSubscriptionCheckout || api.users.syncUser,
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

### Push Notifications (backend-triggered) — 100% (0 gaps)

_Sin gaps detectados en este modulo._

---

### Wallet / Puntos / Rewards — 100% (0 gaps)

_Sin gaps detectados en este modulo._

---

### Influencer / Campaigns — 85% (2 gaps)

#### Checks fallidos

**[HIGH]** Atribución de ventas a influencer
- Detalle: Buscando `attribution|influencerRate` en convex/campaigns.ts — NO ENCONTRADO
- Accion: Implementar lógica de atribución en convex/campaigns.ts.

#### Gaps detectados por escaneo de código

**[MEDIUM]** `src/screens/InfluencerDashboardScreen.tsx:71` ×3 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
_api.connect?.ensureConnectAccount || api.users.syncUser,
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

### Settings / Perfil de usuario — 90% (1 gaps)

#### Gaps detectados por escaneo de código

**[HIGH]** `src/screens/SettingsScreen.tsx:227` ×2 — Texto 'próximamente' — feature no implementada
```
onPress={() => show('Términos de servicio detallados próximamente', 'info')}
```
- Accion: Implementar la feature o remover el placeholder.

---

### Help Center / Soporte — 100% (0 gaps)

_Sin gaps detectados en este modulo._

---

### Admin Dashboard — 100% (0 gaps)

_Sin gaps detectados en este modulo._

---

### Games / MiMascota / Raffles — 85% (2 gaps)

#### Checks fallidos

**[MEDIUM]** RaffleServiceMock usa backend simulado con setTimeout
- Detalle: Patrón `Mock backend call|setTimeout.*resolve` ENCONTRADO (no debería estar)  en src/services/raffles/RaffleServiceMock.ts
- Accion: Reemplazar RaffleServiceMock con llamada real a Convex (convex/economy.ts).

#### Gaps detectados por escaneo de código

**[HIGH]** `src/services/raffles/RaffleServiceMock.ts:11` — Mock backend call activo en código de producción
```
// Mock backend call
```
- Accion: Reemplazar con llamada real a Convex o API externa.

---

### General — 85% (2 gaps)

#### Gaps detectados por escaneo de código

**[HIGH]** `src/components/MapErrorBoundary.tsx:130` ×3 — Comentario TODO/FIXME en código
```
// TODO: Send to error tracking service (Sentry, Crashlytics, etc.)
```
- Accion: Resolver el TODO o abrir un ticket y remover el comentario.

**[MEDIUM]** `src/screens/BusinessDashboardScreen.tsx:88` ×7 — Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado
```
const ensureConnectAccountAction = useAction(_api.connect?.ensureConnectAccount || api.users.syncUser);
```
- Accion: Ejecutar 'npx convex codegen' y verificar que el módulo aparece en convex/_generated/api.d.ts.

---

## 4) Quick wins (gaps LOW/MEDIUM de codigo)

| Severidad | Módulo | Archivo | Gap |
|---|---|---|---|
| MEDIUM | Auth / KYC | `src/contexts/AuthContext.tsx:198` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| MEDIUM | Social (posts, stories, DMs, follows, grupos, highlights) | `src/contexts/SocialContext.tsx:316` | Constante EMPTY_* usada como datos — feature sin implementar |
| MEDIUM | Social (posts, stories, DMs, follows, grupos, highlights) | `src/contexts/SocialContext.tsx:474` | retweetPost es no-op — no hay tabla de reposts |
| MEDIUM | Social (posts, stories, DMs, follows, grupos, highlights) | `src/contexts/SocialContext.tsx:607` | savedPosts solo en memoria (no persiste entre sesiones) |
| MEDIUM | Social (posts, stories, DMs, follows, grupos, highlights) | `src/contexts/SocialContext.tsx:660` | suggestedUsers hardcodeado como [] sin backend |
| MEDIUM | General | `src/screens/BusinessDashboardScreen.tsx:88` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| MEDIUM | Influencer / Campaigns | `src/screens/InfluencerDashboardScreen.tsx:71` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| MEDIUM | Pagos / Stripe / Escrow financiero | `src/screens/PaymentMethodsScreen.tsx:66` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| MEDIUM | IAP — In-App Purchases (Apple + Google) | `src/screens/SubscriptionPlansScreen.tsx:45` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| MEDIUM | Orders / Escrow / Disputas | `src/screens/marketplace/CheckoutScreen.tsx:46` | Acción usa api.users.syncUser como fallback — módulo Convex posiblemente no generado |
| LOW | Social (posts, stories, DMs, follows, grupos, highlights) | `src/contexts/SocialContext.tsx:522` | Función marcada como deprecated en contexto |

---
## 5) Notas tecnicas

- Este audit es puramente estatico (sin ejecutar codigo).
- Complementa `scripts/app_integral_audit.py` (credenciales/seguridad/build).
- Scores se calculan con penalizacion por severidad: HIGH=-10pts, MEDIUM=-5pts, LOW=-2pts.
- Re-ejecutar despues de implementar cada gap para confirmar que baja a 0.