# Pagos con Stripe Connect — setup completo

> Objetivo: cargar credenciales y que TODO el flujo funcione: cobro → escrow →
> split vendedor / influencer / plataforma → reembolsos y disputas → retiros
> del vendedor. Sin código extra.

## 1. Arquitectura (qué hace el sistema)

| Pieza | Cómo |
| --- | --- |
| Cobro | `PaymentIntent` V1 en la cuenta **plataforma** (Separate Charges & Transfers). Sin `transfer_data`. `transfer_group = cartId`. |
| Split | Calculado en el servidor desde la base (`convex/_split.ts`): comisión **por línea** (10% productos/servicios, 30% bonos), influencer por línea (campaña activa → promoción abierta → whitelist), envío al primer vendedor, fee de Stripe **real** prorrateada por mayor resto. Σ = total cobrado, siempre. |
| Órdenes | El webhook `payment_intent.succeeded` crea **una orden por vendedor** desde el snapshot congelado al crear el PI. Idempotente por PI. |
| Escrow | La plata queda en el balance de la plataforma (`escrowState = held`). Se libera al confirmar recepción, por admin, por disputa a favor del vendedor, o por cron (productos 10 días, bonos 1 día, eventos +24h, servicios 7 días). |
| Transfer al vendedor | `transfers.create({ destination, source_transaction: charge, transfer_group, idempotencyKey: release:{orderId}:seller })`. Un solo camino: `internalReleaseOrderEscrow`. Si Stripe rechaza, la orden vuelve a `held` con `escrowReleaseError` visible. |
| Influencer | Cobra **10 días** después de liberada la orden (ventana de clawback). Fila `payouts` `scheduled` → cron diario → `transfers.create` con `idempotencyKey: release:{orderId}:influencer`. |
| Reembolsos | `refunds.create` sobre el PI por el monto de ESA orden (`idempotencyKey: refund:{orderId}:{n}`). Si ya se transfirió: `transfers.createReversal` proporcional (vendedor e influencer). Cancelación del comprador, disputa a favor del comprador y refund admin son automáticos. Reembolsos hechos desde el Dashboard (`charge.refunded`) se sincronizan. |
| Chargebacks | `charge.dispute.created` congela las órdenes del PI (`frozen`); `closed` → `won` restaura, `lost` contabiliza el retiro de Stripe y revierte transfers. |
| Cuentas conectadas | **V2** (`v2.core.accounts.create`): `dashboard: express`, `losses_collector: application`, capacidad `stripe_balance.stripe_transfers` (recibir) — es la única solicitable en `configuration.recipient`; `stripe_balance.payouts` sólo se **lee** de la respuesta (pedirla da "Unknown field"), y el retiro al banco lo administra el vendedor desde su dashboard Express. Onboarding hosted (`v2.core.accountLinks.create`) con retorno a la app. Estado reactivo en `users.stripeConnectCaps[Test]`. |
| Bi-modal | El toggle test/live del app se respeta de punta a punta: cada pago/orden/payout guarda `mode`; cuentas conectadas y webhooks separados por modo. |
| Puntos | Descuento por puntos absorbido por la comisión de la plataforma (máximo = comisión). El servidor debita los puntos al procesar el pago. |

Estados de escrow (`convex/orders/_escrowStates.ts`): `held → release_pending → released`, `held|released → refund_pending → refunded`, `disputed` (interna), `frozen` (Stripe).

## 2. Variables en Convex (backend)

Cargar con `npx convex env set VAR valor` (o en el Dashboard de Convex → Settings → Environment Variables).

| Variable | Modo | Valor |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | live | `sk_live_…` (si ponés una `sk_test_` acá, se usa como test) |
| `STRIPE_WEBHOOK_SECRET` | live | secreto del destino **snapshot** apuntando a `/stripe-webhook` |
| `STRIPE_WEBHOOK_SECRET_THIN` | live | secreto del destino **thin** (eventos `v2.core.account[...]`) apuntando a `/stripe-webhook` |
| `STRIPE_SECRET_KEY_TEST` | test | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET_TEST` | test | destino snapshot → `/stripe-webhook-test` |
| `STRIPE_WEBHOOK_SECRET_THIN_TEST` | test | destino thin → `/stripe-webhook-test` |
| `ALLOW_STRIPE_MOCK` | ambos | `false` en producción. `true` sólo para QA: habilita `simulate` (pagos sin Stripe). |
| `STRIPE_CONNECT_RETURN_URL_BASE` | ambos | **Opcional.** Default `https://ramgos.app/connect`. Tiene que ser https (Stripe rechaza esquemas custom tipo `ramgos://`; sólo tolera `http://localhost` en modo test) — un valor con esquema custom se ignora. En web el cliente manda su propio origen y gana sobre esta variable, si está en la allowlist de `convex/_connectReturnUrl.ts`. El retorno a la app nativa entra por universal link (`ramgos.app`). |

Con un solo modo alcanza: la app sólo muestra en el toggle los modos configurados.

## 3. Variables en la app (Expo)

```
EXPO_PUBLIC_STRIPE_KEY_TEST=pk_test_...
EXPO_PUBLIC_STRIPE_KEY_LIVE=pk_live_...
```
(o `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, asignada al modo por su prefijo). Van en `.env.local` para desarrollo y en `eas.json` → `env` para builds.

## 4. Webhooks en Stripe (Dashboard → Developers → Webhooks / Workbench)

URL base: `https://<deployment>.convex.site` (`npx convex url` o Dashboard de Convex). Repetir en test y en live (cada modo tiene su propio Dashboard y sus propios secretos).

### Destino A — snapshot, "Your account"
URL: `/stripe-webhook` (live) o `/stripe-webhook-test` (test). Eventos:
```
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
charge.dispute.created
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
transfer.reversed
refund.updated
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
identity.verification_session.verified
identity.verification_session.requires_input
identity.verification_session.canceled
```
→ copiar el `whsec_` en `STRIPE_WEBHOOK_SECRET[_TEST]`.

### Destino B — thin (V2), "Your account"
Misma URL. En "Show advanced options" elegir **Payload style: Thin**. Eventos:
```
v2.core.account[requirements].updated
v2.core.account[configuration.recipient].capability_status_updated
v2.core.account_link.returned
```
→ copiar el `whsec_` en `STRIPE_WEBHOOK_SECRET_THIN[_TEST]`.

### Destino C (opcional) — snapshot, "Connected accounts"
`payout.paid`, `payout.failed` (sólo auditoría). Podés ponerlo en el destino A: se acepta cualquier secreto del modo.

### Desarrollo local con Stripe CLI (sólo test)
```bash
stripe listen --forward-to https://<dev-deployment>.convex.site/stripe-webhook-test
# segunda terminal, thin events:
stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated,v2.core.account_link.returned' \
  --forward-thin-to https://<dev-deployment>.convex.site/stripe-webhook-test
```
Cada `stripe listen` imprime su `whsec_…`: van en `STRIPE_WEBHOOK_SECRET_TEST` y `STRIPE_WEBHOOK_SECRET_THIN_TEST`. Si tu versión del CLI no tiene `--thin-events`, registrá el destino B en el Dashboard apuntando al deployment de dev (es público).

## 5. Stripe Connect en el Dashboard
- Connect → Settings: plataforma con **Separate charges and transfers**; branding (logo/colores) para el onboarding Express.
- Las cuentas conectadas se crean desde la app (`ensureConnectAccount`); no hace falta crearlas a mano.
- En **test**, el onboarding hosted también hay que completarlo (datos de prueba: SSN `000-00-0000`, fecha `01/01/1901`, banco de prueba `000123456789` / routing `110000000`). Sin `stripe_transfers = active` los transfers fallan y la orden queda en `held` con el error visible.

## 6. Verificación

```bash
npm run typecheck          # 0 errores
npm test                   # incluye convex/__tests__/split, escrowStates, stripeEnv, fees
node scripts/check-readiness.js
npx convex run stripe:getPublicConfig   # → { modes: { test: true, live: false }, mockAllowed: false }
```

E2E en test (app con `EXPO_PUBLIC_STRIPE_KEY_TEST`, toggle "Prueba", `ALLOW_STRIPE_MOCK=false`):
1. Vendedor: Dashboard → "Conectar cuenta de pagos" → onboarding hosted → vuelve por `ramgos://connect/return?mode=test` → banner "Cuenta de pagos lista". En `paymentEvents` aparece `v2.core.account_link.returned` procesado.
2. Comprador: carrito con un producto y un bono del mismo vendedor + `?ref=` de influencer → `4242 4242 4242 4242` → una orden por vendedor con `mode: 'test'`, `grossCents`, `providerFeeCents` (fee real), bono 30% / producto 10%, `influencerCents`. Reenviar el evento desde Workbench → sin duplicados.
3. Confirmar recepción → `release_pending` → `released`, `tr_…` en Dashboard → Connect → Transfers (con `source_transaction`); `payouts` seller `completed`, influencer `scheduled` (+10 días). Repetir → sin segundo transfer.
4. Vendedor sin Connect → confirmar → vuelve a `held` con `escrowReleaseError`; admin notificado. Onboardear → admin "forzar liberación" → OK.
5. Influencer: adelantar `scheduledAtMs` en la fila `payouts` → `npx convex run stripe:internalPayDueInfluencerPayouts` → transfer; repetir → sin duplicado.
6. Cancelar antes del envío → `refund_pending` → `refunded`, refund exacto de esa orden, stock restaurado; la otra orden del PI sigue intacta.
7. Refund admin sobre orden liberada → refund + reversal proporcional; payouts `reversed`; influencer `cancelled`.
8. Refund desde el Dashboard → `charge.refunded` → órdenes actualizadas sin refund duplicado.
9. Disputa con `4000 0000 0000 0259` → órdenes `frozen`; el cron las salta; cerrar (won) → restauradas.
10. Retiros: balance, calendario (o "se administra desde Stripe Express"), payout instantáneo si hay `instant_available`.
11. `npx convex run reconciliation:internalReconcileStripeBalanceTransactions '{}'` → sin flags `no_local_payout` / `amount_mismatch`.

## 7. Go-live
- [ ] `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_THIN` cargados; destinos A y B creados en modo live.
- [ ] `EXPO_PUBLIC_STRIPE_KEY_LIVE=pk_live_…` en `eas.json` (producción).
- [ ] `ALLOW_STRIPE_MOCK=false`.
- [ ] Rotar cualquier clave que haya pasado por chat o quedado en `eas.json` del repo.
- [ ] Compra real de validación + confirmación de recepción + verificación del transfer en Dashboard.
