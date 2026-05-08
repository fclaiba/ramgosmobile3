# Credentials Handoff Checklist

Fecha: `2026-03-30`

## Bitacora de avance (retoma rapida)

Hecho en esta etapa:
- [x] Resend integrado y operativo en Convex (`RESEND_API_KEY` + `RESEND_FROM_EMAIL` provisional).
- [x] Zendesk implementado con backend seguro (`/support-ticket`) sin exponer token en cliente.
- [x] Crash/Analytics integrado con Sentry (`@sentry/react-native`, init global + captura en `CrashHandler`).
- [x] Release hardening preparado:
  - [x] `app.json` con placeholder de Maps (`__SET_GOOGLE_MAPS_ANDROID_API_KEY__`).
  - [x] Checklists operativos Play/iOS reforzados para cierre y evidencia.

Pendiente para cerrar integración total:
- [ ] Stripe credenciales live (server + publishable) y webhook real.
- [ ] Credenciales reales Zendesk + validación end-to-end.
- [ ] DSN real de Sentry + validación de evento en dashboard.
- [ ] Dominio/remitente institucional de Resend + rotación de key.

## Sprint 1 - Convex + Stripe Core

Completar este bloque antes de ejecutar cobros reales.

### 1) Convex
- [ ] `EXPO_PUBLIC_CONVEX_URL` productivo confirmado.
- [ ] Proyecto Convex accesible por CLI del owner (`npx convex dev` / `deploy`).
- [ ] Variables en Convex (server-side):
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `ALLOW_STRIPE_MOCK=false` en producción.
  - [ ] `RESEND_API_KEY` (rotar luego de la primera carga manual).
  - [ ] `ALLOW_KYC_MOCK=false` en producción.

### 2) Stripe
- [ ] `EXPO_PUBLIC_STRIPE_KEY` (publishable) cargada en `eas.json`/entorno.
- [ ] Secret key activa y válida para el mismo modo (test/live).
- [ ] Endpoint webhook configurado:
  - [ ] URL: `https://<convex-deployment>.convex.site/stripe-webhook`
  - [ ] Eventos mínimos: `payment_intent.succeeded`
- [ ] Secret de webhook copiado en Convex (`STRIPE_WEBHOOK_SECRET`).

### 3) Validación mínima obligatoria
- [ ] Crear PaymentIntent desde checkout (sin fallback de mock inesperado).
- [ ] Confirmar pago en Stripe Payment Sheet.
- [ ] Ver transición de orden y escrow en backend:
  - [ ] `payment_received`
  - [ ] `held` -> `released/refunded/disputed`.

## Sprint 2 - Operación Financiera

### Reglas de negocio
- [ ] Comisión Ramgos (% o mínimo fijo) confirmada.
- [ ] Comisión influencer (% por campaña/contrato) confirmada.
- [ ] Política de liberación escrow (tiempo + disparadores) confirmada.

### Operación
- [ ] Cuentas de prueba para seller/influencer con KYC.
- [ ] Flujo de retiro validado (`pending -> processing -> approved/rejected`).
- [ ] Checklist de conciliación diaria acordado (pagos, comisiones, netos).

## Sprint 3 - Mobile Release

- [ ] Keystore Android productivo + passwords + alias.
- [ ] Credenciales Apple/EAS para build iOS.
- [ ] Restricciones Google Maps por `package + SHA1` release.
- [ ] TestFlight habilitado con app record correcta.

## Sprint 4 - Closed Beta

- [ ] Lista de testers internos/externos.
- [ ] Responsable operativo de soporte (on-call).
- [ ] Canal único de incidentes (correo/board/ticketing).
- [ ] Ventana de monitoreo primeras 72h definida.

## Sprint 4.b - Zendesk (soporte)

Implementación: habilitada con backend seguro (`src/utils/support.ts` -> `convex/http.ts` `/support-ticket`).

Nota de retoma (estado actual):
- Backend Zendesk ya implementado y listo para usar sin exponer credenciales en la app cliente.
- Cliente usa `EXPO_PUBLIC_ZENDESK_ENABLED` para activar/desactivar el canal Zendesk.
- Si faltan credenciales, el flujo cae a email como fallback.
- Próximo paso pendiente: cargar credenciales reales en Convex y validar creación de ticket end-to-end.

Variables a cargar en Convex (server-side):
- [ ] `ZENDESK_ENABLED=true`
- [ ] `ZENDESK_SUBDOMAIN=<tu-subdominio>`
- [ ] `ZENDESK_EMAIL=<usuario-admin-zendesk>`
- [ ] `ZENDESK_API_TOKEN=<token-api-zendesk>`

Variable cliente (Expo public env):
- [ ] `EXPO_PUBLIC_ZENDESK_ENABLED=true`

Checklist Zendesk:
- [ ] Crear un ticket desde `SupportScreen` y confirmar `200` en `/support-ticket`.
- [ ] Validar que el ticket se crea en Zendesk con requester, categoría y mensaje.
- [ ] Confirmar fallback a email si Zendesk se desactiva (`EXPO_PUBLIC_ZENDESK_ENABLED=false`).

## Sprint 4.c - Crash/Analytics (Sentry)

Implementación: integrada (`@sentry/react-native`) con init global en `App.tsx` y captura en `CrashHandler`.

Variables requeridas:
- [ ] `EXPO_PUBLIC_SENTRY_DSN` (EAS build env: development/preview/production).

Checklist Sentry:
- [ ] Cargar DSN real en `eas.json`/entorno de build.
- [ ] Ejecutar build de prueba y forzar un crash controlado.
- [ ] Verificar evento en dashboard Sentry con stacktrace.

## Sprint 5 - Release hardening (Google Maps + Apple/Play)

Estado actual:
- `app.json` quedó con placeholder de Maps: `__SET_GOOGLE_MAPS_ANDROID_API_KEY__`.
- Checklist Play/iOS actualizado para cierre operativo y evidencia.

Pendiente para retomar:
- [ ] Reemplazar placeholder con API key Android restringida por `package + SHA1`.
- [ ] Completar `PLAY_CONSOLE_RELEASE_CHECKLIST.md` (track interno/cerrado + smoke).
- [ ] Completar `IOS_RELEASE_ENABLEMENT.md` (TestFlight + App Store Connect submission).

## Sprint 1.b - Resend (emails transaccionales)

Implementación: ya integrada en `convex/notifications.ts` (`sendOTP`).

Comandos exactos a correr por el owner del proyecto Convex:

```powershell
# 1) cargar la API key (reemplazar por la nueva, NO usar la pegada en chat)
npx convex env set RESEND_API_KEY re_TU_NUEVA_KEY

# 2) verificar
npx convex env list

# 3) (opcional) test de envío desde Convex Dashboard -> Functions -> notifications.sendOTP
```

Checklist Resend:
- [x] API key cargada en Convex (`RESEND_API_KEY`) — deployment `prod:deafening-turtle-227` (verificado con `npx convex env list`).
- [x] Remitente provisional configurado con `RESEND_FROM_EMAIL=Ramgos <onboarding@resend.dev>`.
- [ ] Dominio verificado en https://resend.com/domains.
- [ ] Cambiar `RESEND_FROM_EMAIL` al correo institucional verificado (ej. `Ramgos <noreply@ramgos.app>`) antes de lanzamiento público.
- [ ] Test de OTP a un email real (PASS).
- [ ] Rotación de la primera key (la que se cargó en este handoff) por una nueva limpia (la actual quedó expuesta en chat).

---

## Sprint 6 — Stripe Connect V2 + Subscriptions + IAP (full payments rollout)

### Variables Convex (server-side) requeridas

| Variable | Tipo | Para qué se usa |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | live `sk_live_...` | PaymentIntents, transfers, refunds, payouts, V2 Connect, Subscriptions. |
| `STRIPE_WEBHOOK_SECRET` | live `whsec_...` | Verificación de firma en `/stripe-webhook`. |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | `price_...` | Stripe Subscriptions del plan Business (creado en Stripe Dashboard → Products). |
| `APPLE_SHARED_SECRET` | string | Validación de receipts vía `verifyReceipt` y verificación de Apple Server Notifications V2. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | JSON serializado | Validación de receipts de Google Play Billing (Pub/Sub Real-Time Developer Notifications). |
| `ALLOW_STRIPE_MOCK` | `false` en prod | Bloquea cualquier path que devuelve un PaymentIntent / Connect mock. |
| `ALLOW_KYC_MOCK` | `false` en prod | Bloquea aprobaciones de KYC sin verificación real. |

Carga rápida (sustituir valores reales antes de pegar):

```powershell
npx convex env set STRIPE_SECRET_KEY sk_live_xxx
npx convex env set STRIPE_WEBHOOK_SECRET whsec_xxx
npx convex env set STRIPE_PRICE_BUSINESS_MONTHLY price_xxx
npx convex env set APPLE_SHARED_SECRET <hex>
npx convex env set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON '{"type":"service_account",...}'
npx convex env set ALLOW_STRIPE_MOCK false
npx convex env set ALLOW_KYC_MOCK false
```

### Webhooks a registrar en Stripe Dashboard

URL base: `https://<convex-deployment>.convex.site`

| Endpoint | Eventos a suscribir |
| --- | --- |
| `/stripe-webhook` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, **V2 thin events**: `v2.core.account[requirements].updated`, `v2.core.account[configuration.recipient].capability_status_updated` |
| `/apple-iap-webhook` | App Store Server Notifications V2 — registrar en App Store Connect → Apps → App Information → URL del servidor de notificaciones (production + sandbox). |
| `/google-iap-webhook` | Google Play Real-Time Developer Notifications — registrar en Play Console → Monetización → Suscripciones → Configuración. |

### Configuración de Stripe Dashboard

- Connect → Settings → Onboarding form: revisar `defaults.responsibilities.fees_collector = 'application'` y `losses_collector = 'stripe'` aplicados a las nuevas cuentas.
- Connect → Branding: subir logos/colores antes de generar onboarding links live.
- Products → crear `Ramgos Business Monthly` con un `Price` recurrente USD/mensual; copiar el `price_...` a `STRIPE_PRICE_BUSINESS_MONTHLY`.
- Webhooks → confirmar firma `STRIPE_WEBHOOK_SECRET` post-creación.

### App Store Connect / Play Console

- App Store Connect → My Apps → App → In-App Purchases → crear `pro_monthly` (auto-renewable subscription, $2.99/mo, grupo `consumer_pro`).
- Play Console → Monetización → Suscripciones → crear `pro_monthly` con base plan equivalente.
- Apple Server Notifications V2 → URL de notificaciones apunta a `/apple-iap-webhook`.
- Google Play → Topic Pub/Sub → push a `/google-iap-webhook`.

### Reconciliación + observability

- Cron diario `stripe-bt-reconciliation` ya registrado (`convex/crons.ts`); verificar en Convex Dashboard → Schedules que se está ejecutando.
- Logs estructurados con tag `[stripe.api]` (`convex/observability.ts`). Para enviarlos a Sentry como breadcrumbs, agregar `@sentry/node` al runtime de Convex y mapear el tag `stripe.api` → breadcrumb `category=stripe.api`.
- Pantalla `AdminFinanceScreen` (Stack route `AdminFinance`) lista failed transfers, escrows colgados (>30d), disputas, refunds y discrepancias del cron.

### Validaciones obligatorias antes de salir a vivo

- [ ] Crear PaymentIntent multi-seller real, completar pago, verificar que se crea una fila en `payments` por línea y se acreditan `walletAccounts.balancePending` por seller + influencer.
- [ ] `orders.confirmReceipt` → `internal.stripe.internalReleasePayment` ejecuta `transfers.create` para cada seller / influencer con Connect onboardado, y deja la comisión Ramgos en plataforma.
- [ ] Cancelar un pago → `internal.stripe.internalRefundPayment` ejecuta `refunds.create` + `transfers.createReversal`.
- [ ] Onboardear una cuenta Connect V2 desde `BusinessDashboardScreen` y `InfluencerDashboardScreen`; verificar que el banner pasa de "Conectar" → "Onboarding" → "Listo" con el webhook V2.
- [ ] Suscribirse al plan Business desde `SubscriptionPlansScreen` (Stripe Checkout); verificar `users.subscriptionTier='business'` post-webhook.
- [ ] Validar `WithdrawalScreen` con Connect onboardado: balance live, cambio de schedule, payout on-demand.
- [ ] Forzar un BT sin contraparte local en Stripe (manual journal entry) y verificar que el cron lo flagea como `no_local_payment` en `reconciliationFlags`.
