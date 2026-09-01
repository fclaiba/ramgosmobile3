
# Arquitectura: Stripe Connect + Split de Pagos

> [!NOTE]
> Auditoría de código hecha el 2026-09-01 (agente Explore, lectura directa de
> `convex/connect.ts`, `convex/stripe.ts`, `convex/http.ts`, `convex/schema.ts`,
> `convex/_fees.ts`). Este documento describe **lo que el código hace hoy**, no
> un diseño aspiracional — sirve como mapa para retomar el cierre de esta parte
> sin tener que re-auditar todo de cero. Complementa a [`ARQUITECTURA_ESCROW.md`](./ARQUITECTURA_ESCROW.md)
> (reglas de liberación por tipo de ítem) y a [`PAYMENTS_SETUP.md`](./PAYMENTS_SETUP.md)
> (setup de claves/webhook). Corrige al tracker `PLAN_ESTRATEGICO_MAESTRO.md`
> (fila `CLI-STRIPE`), que lo marca en `0%` — el código real va bastante más
> allá de eso.

## 1. Qué existe y funciona

### 1.1 Vinculación de cuenta (onboarding Connect)

| Pieza | Archivo:línea |
|---|---|
| Crear cuenta Connect (Stripe **V2**, `dashboard: "express"`) | `convex/connect.ts:121-188` (`createConnectAccount`, action pública) y `convex/connect.ts:335-378` (`internalCreateConnectAccountAction`, invocada por `ensureConnectAccount`, `convex/connect.ts:295-330`) |
| Link de onboarding (KYC de Stripe) | `convex/connect.ts:194-230` (`createOnboardingLink`) y `convex/connect.ts:699-729` (`internalCreateOnboardingLink`, usada por `convex/stripe.ts:583-606` `createConnectAccountLink`). Usa `v2.core.accountLinks.create` con `use_case.account_onboarding`; deep-links de vuelta a la app: `ramgos://onboarding/refresh` y `ramgos://onboarding/complete`. |
| UI de vinculación — negocios | `src/screens/BusinessDashboardScreen.tsx:110-130,340-399,702-758` — banner "Vincula tu cuenta bancaria", progreso de onboarding, estado ("Stripe Connect activo · `<id>`"). |
| UI de vinculación — influencers | `src/screens/InfluencerDashboardScreen.tsx:41-105,214-239` — mismo flujo copiado (comentario propio dice "única fuente de onboarding"). |
| Persistencia | `convex/schema.ts:105-106` — `users.stripeConnectAccountId: v.optional(v.string())`, `users.stripeConnectStatus: v.optional(v.union("pending"|"active"|"rejected"))`. Se escribe en `convex/connect.ts:64-74` (`internalSaveConnectAccount`) y se sincroniza en `convex/connect.ts:424-467` (`internalSaveConnectFlags`). |
| Sync automático de estado | Webhook `account.updated` **V2** (thin events): `convex/http.ts:81-90` — `v2.core.account[requirements].updated` / `...capability_status_updated` → `internal.connect.internalApplyV2AccountUpdate` (`convex/connect.ts:386-418`) → recalcula `readyToReceivePayments`/`onboardingComplete` → `internalSaveConnectFlags`. |

**Conclusión:** un negocio o influencer **ya puede vincular su cuenta de Stripe hoy** — el circuito completo (crear cuenta → link → completar en Stripe → webhook actualiza el estado → UI lo refleja) está cerrado.

No hay pantalla equivalente para el rol `consumer` (no aplica) ni un flujo distinto "vendedor" vs "negocio" — ambos dashboards reusan el mismo patrón.

### 1.2 Split de pagos

**Modelo elegido: Separate Charges & Transfers (escrow), NO direct/destination charges de Stripe.**

- El comprador paga el monto total **a la cuenta plataforma** — `createPaymentIntent` (`convex/stripe.ts:56-327`) no usa `transfer_data` ni `on_behalf_of` ni `application_fee_amount` en los params del PaymentIntent (líneas 217-263).
- Comisión y neto se calculan en código propio (`convex/_fees.ts`, líneas 191-196) y se guardan en `payments` (`convex/stripe.ts:272-293`) — **no** se le pasan a Stripe como parte del cobro.
- El dinero se mueve recién al liberar el escrow: `stripe.transfers.create({ destination: sellerConnectAccountId, ... })` en `convex/stripe.ts:891-901`, dentro de `internalReleasePaymentAction` (línea 818). Es un `Transfer` V1 explícito y posterior al charge, no automático.
- Este modelo es coherente con el fix del commit `losses_collector: "stripe"` → `"application"` (`convex/connect.ts:154-159,353-358`) — con `"application"`, **Ramgos absorbe disputas/reembolsos/balance negativo**, no Stripe. Tiene sentido: el charge vive en la cuenta plataforma, no en la del vendedor.

**Multi-vendedor (un carrito, varios sellers) — soportado y con el bug de doble cobro ya resuelto:**

- `internalProcessMultiVendorCart` (`convex/stripe.ts:958-1112`) agrupa el carrito por `sellerId` (líneas 994-1010) y crea **una sub-orden por vendedor** (`internalCreateSubOrder`, línea 1075), con `netAmountCents`/`commissionCents` prorrateados por fracción de subtotal (líneas 1044-1072).
- Antes del fix (commit `dfa4bec`), `internalReleasePaymentAction` transfería `payment.sellerNet` (el neto del CARRITO ENTERO) a **cada** vendedor por separado → doble/triple pago. El comentario en `convex/stripe.ts:854-870` documenta el bug y el fix explícitamente. Ahora usa `order.netAmountCents` (ya prorrateado por sub-orden) — resuelto.
- El costo de envío se cobra una sola vez dentro del mismo PaymentIntent y se adjunta sólo a la primera sub-orden, para no duplicarlo (`convex/stripe.ts:1012-1024,1056-1060`).

**Comisión de plataforma:**

- `PLATFORM_COMMISSION_RATE = 0.10`, `BONO_COMMISSION_RATE = 0.30` — `convex/_fees.ts:20,23`. Cubierto por `convex/__tests__/fees.test.ts` (tasa fija, redondeo, fee de Stripe 2.9%+30¢).
- El fee estándar de Stripe (2.9%+30¢) lo absorbe el **vendedor**, restado de su neto (`convex/stripe.ts:194`), no la plataforma.

## 2. Lo que NO está resuelto

| # | Gap | Severidad | Dónde |
|---|---|---|---|
| 1 | **Nunca se corrió con Stripe real.** La app arranca en modo `test`/simulado por defecto (`PaymentModeContext`) → `simulate: true` → PaymentIntent falso (`mock_pi_*`) → el flujo salta directo a `internalProcessMultiVendorCart` sin pasar por Stripe ni por el webhook real. Todo lo de la sección 1 es código correcto *on paper*, sin ejercitarse en runtime ni una vez. | 🔴 Bloqueante | `convex/stripe.ts:202-207` (rama `useMock`) |
| 2 | **Fallback mock silencioso en el release.** Si el `transfer` real a un vendedor falla (ej. su cuenta Connect no completó el onboarding, o le faltan capabilities), el código genera un `demo_mock_transfer_*` y sigue como si el pago se hubiera liberado — sin fallar, sin alertar. Un vendedor podría quedar "pagado" en la DB sin haber recibido nada. | 🔴 Riesgo de plata real | `convex/stripe.ts:909-925` (comentario propio `ponytail` ya reconoce que es un mock) |
| 3 | **Los influencers no cobran en el release del escrow.** Cuando hay `influencerAmountInCents > 0`, el comentario dice explícitamente que el dinero queda en la cuenta principal "hasta el día viernes, cuando un cron job consolida todos los pagos" — no se crea ningún `transfer` para el influencer en este código. No se auditó si ese cron existe/corre. | 🟡 Falta confirmar/implementar | `convex/stripe.ts:904-908` |
| 4 | **Split multi-influencer no soportado.** Si un carrito mezcla ítems atribuidos a distintos influencers, la atribución se descarta por completo (`attributionRejectedReason = "mixed_influencers_in_checkout"`) — "regla temporal acordada". | 🟡 Gap conocido y aceptado | `convex/stripe.ts:180-188` |
| 5 | Webhook **V1** `account.updated` es un stub inerte — sólo hace `console.log`, no persiste nada. Inofensivo hoy porque las cuentas se crean por V2 y ese es el camino real, pero si Stripe alguna vez manda el evento V1 real, se ignora en silencio. | 🟢 Cosmético / trampa de mantenimiento | `convex/http.ts:197-203` |
| 6 | `convex/connectV2.ts` — módulo experimental (`createConnectedAccount`, `createAccountLink`, `getAccountStatus`, `createCheckoutSession`), marcado `// ponytail: Stripe Connect V2 experimental ... Todo internal hasta decidir si se borra`. Sin ningún call site fuera de sí mismo (confirmado por grep). Candidato a borrar — confunde a quien audite si no sabe que es el camino muerto. | 🟢 Limpieza | `convex/connectV2.ts:1` |
| 7 | **Cero tests automatizados** de Connect o de split de pagos. `convex/__tests__/fees.test.ts` sólo prueba la aritmética pura de `_fees.ts`; no hay tests de `internalProcessMultiVendorCart`, `internalReleasePaymentAction`, ni de `connect.ts`. | 🟡 | — |
| 8 | No hay `application_fee_amount`/`transfer_data` de Stripe — todo el split es contable interno + `transfers` manuales posteriores. Si algún día se quisiera pasar a direct/destination charges reales de Stripe (split automático en el momento del cobro), habría que rehacer `createPaymentIntent` desde cero. No es un bug, es una decisión de arquitectura a tener presente. | 🟢 Nota de diseño | `convex/stripe.ts:56-327` |

## 3. Checklist para cerrar esta parte

Cuando se retome, el orden lógico es:

1. **QA con Stripe test mode real** (no simulado): sacar `PaymentModeContext` del modo `test` por defecto para al menos un ambiente de prueba, y correr el flujo completo con claves `sk_test_`/`pk_test_` reales — crear cuenta Connect → completar onboarding real en el sandbox de Stripe → cobrar → confirmar que el webhook `payment_intent.succeeded` real llega y dispara `internalMarkPaymentSucceeded` → liberar escrow → confirmar que el `transfer` real llega a la cuenta Connect de test del vendedor. Ver tarjetas de prueba en `PAYMENTS_SETUP.md`.
2. **Sacar el fallback mock silencioso** (gap #2) — que un `transfer` fallido explote (marque la orden en un estado de error/reintento visible para un admin) en vez de fingir éxito con `demo_mock_transfer_*`.
3. **Resolver el pago a influencers** (gap #3) — confirmar si el cron de consolidación de los viernes existe y corre, o implementarlo si no.
4. Decidir si vale la pena soportar **split multi-influencer** en un mismo carrito (gap #4), o mantener la regla temporal a propósito.
5. Limpieza menor: borrar `convex/connectV2.ts` si se confirma que no se va a usar, y hacer que el webhook V1 `account.updated` (gap #5) al menos loguee con nivel de alerta si llega a dispararse alguna vez.
6. Agregar tests para `internalProcessMultiVendorCart` (split correcto por sub-orden, sin duplicar envío) y `internalReleasePaymentAction` (transfer con monto prorrateado correcto, manejo de fallo sin mock silencioso).

## 4. Veredicto corto

**No hace falta construir Stripe Connect — ya está construido** (cuentas, onboarding, UI de vinculación, split multi-vendedor con el bug de doble cobro ya resuelto). Lo que falta es **cerrarlo con Stripe real**: sacar el modo simulado por defecto, probar el circuito completo end-to-end una vez con Stripe test mode, y sacar el fallback mock silencioso del release de escrow — ahí es donde está el riesgo de plata real, no en la arquitectura.
