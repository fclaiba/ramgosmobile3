# Diagnostico Integral - ramgos-mobile v1.0.0

Fecha: `2026-04-29T15:57:49-03:00`  
Generado por: `scripts/app_integral_audit.py`  
Modo: `run_checks=True online_checks=True`

## 1) Resumen ejecutivo

- **Estado global: `NO_GO`**
- Score global ponderado: **91.3/100**
- Checks ejecutados: 82 (PASS: 76, WARN: 3, CRITICAL/FAIL: 1, HIGH/FAIL: 1)

Interpretacion:
- `GO`: sin bloqueantes, listo para release con riesgos menores.
- `GO_WITH_RISKS`: sin criticos, con riesgos altos a mitigar antes de produccion.
- `NO_GO`: hay al menos 1 bloqueante critico que impide release.

## 2) Score por dimension

| Dimension | Score | Pasados | Total |
|---|---:|---:|---:|
| Arquitectura y dominio | 100.0 | 28 | 28 |
| Pagos / Escrow / Comisiones | 100.0 | 21 | 21 |
| Seguridad y credenciales | 81.2 | 6 | 8 |
| Build / Release readiness | 100.0 | 11 | 11 |
| Testing y calidad | 100.0 | 5 | 5 |
| Integraciones externas | 66.7 | 5 | 9 |

## 3) Hallazgos por severidad

### CRITICAL
- [FAIL] **eas.production.stripe_key** (seguridad) - eas.json -> production tiene EXPO_PUBLIC_STRIPE_KEY real (pk_live_...)
  - Evidencia: `valor actual: 'pk_live_replace_me'`
  - Remediacion: Cargar clave publica de Stripe live en eas.json (production).

### HIGH
- [FAIL] **integrations.crash_analytics** (integraciones) - SDK de crash reporting / analytics integrado
  - Evidencia: `ninguna lib instalada`
  - Remediacion: Integrar Sentry o Firebase Crashlytics para monitoreo en produccion.
- [WARN] **integrations.app_stores** (integraciones) - Documentacion para Apple/Play presente (credenciales pendientes)
  - Evidencia: `apple_doc=True play_doc=True`
  - Remediacion: Crear app records en App Store Connect / Play Console y subir builds.
- [WARN] **maps.apikey_restriccion** (seguridad) - Google Maps API key embebida en app.json (verificar restriccion en GCP)
  - Evidencia: `key presente: AIzaSy...UZVs`
  - Remediacion: Restringir la API key por package + SHA1 en Google Cloud Console.

### MEDIUM
_Sin hallazgos medium._

### LOW
- [WARN] **integrations.zendesk** (integraciones) - Zendesk preparado en env (modulo deshabilitado)
  - Evidencia: `env_documented=True`
  - Remediacion: Habilitar modulo soporte cuando se cargue cuenta Zendesk.

## 4) Plan de accion priorizado

### Bloqueantes (CRITICAL/FAIL)
- `eas.production.stripe_key` - eas.json -> production tiene EXPO_PUBLIC_STRIPE_KEY real (pk_live_...)
    - Accion: Cargar clave publica de Stripe live en eas.json (production).

### Riesgos altos (HIGH/FAIL)
- `integrations.crash_analytics` - SDK de crash reporting / analytics integrado
    - Accion: Integrar Sentry o Firebase Crashlytics para monitoreo en produccion.

### Quick wins (MEDIUM/WARN)
- (ninguno)

## 5) Matriz de integraciones externas

| Plataforma | Estado | Detalle |
|---|---|---|
| Stripe (pagos / payouts / KYC) | Integrado en codigo | Cargar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Convex) y `EXPO_PUBLIC_STRIPE_KEY` (eas.json prod). |
| Resend (emails) | Integrado en convex/notifications.ts | Cargar `RESEND_API_KEY` en Convex env. |
| Expo / EAS (builds + push) | Configurado | Validar credenciales EAS (Android keystore + iOS provisioning). |
| Google Maps | Integrado, key embebida | Restringir API key por package + SHA1 en Google Cloud Console. |
| Apple Developer (App Store) | Pendiente credenciales | Crear app record en App Store Connect, subir build TestFlight. |
| Google Play Console | Pendiente cierre de ficha | Generar AAB, completar Data Safety, Content Rating, Policy. |
| Zendesk (soporte) | Preparado, deshabilitado | Activar modulo cuando se carguen credenciales. |
| Crash/Analytics | No implementado | Instalar Sentry o Firebase Crashlytics. |

## 6) Detalle completo de checks

| ID | Categoria | Sev | Estado | Descripcion |
|---|---|---|---|---|
| `schema.table.paymentEvents` | finanzas | CRITICAL | PASS | Tabla financiera persistida en convex/schema.ts: paymentEvents |
| `schema.table.payments` | finanzas | CRITICAL | PASS | Tabla financiera persistida en convex/schema.ts: payments |
| `stripe.action.payment_intent_persistido` | finanzas | CRITICAL | PASS | createPaymentIntent persiste registro en payments |
| `webhook.idempotencia` | finanzas | CRITICAL | PASS | Webhook Stripe usa paymentEvents para idempotencia |
| `integrations.stripe` | integraciones | CRITICAL | PASS | Stripe (RN + Node SDK) integrado en codigo |
| `eas.production.stripe_key` | seguridad | CRITICAL | FAIL | eas.json -> production tiene EXPO_PUBLIC_STRIPE_KEY real (pk_live_...) |
| `env.local.gitignored` | seguridad | CRITICAL | PASS | .env.local (si existe) esta gitignorado |
| `convex.generated.modules` | arquitectura | HIGH | PASS | convex/_generated/api.d.ts registra modulos clave |
| `convex.module.authHelpers` | arquitectura | HIGH | PASS | Modulo Convex presente: convex/authHelpers.ts |
| `convex.module.finance` | arquitectura | HIGH | PASS | Modulo Convex presente: convex/finance.ts |
| `convex.module.http` | arquitectura | HIGH | PASS | Modulo Convex presente: convex/http.ts |
| `convex.module.stripe` | arquitectura | HIGH | PASS | Modulo Convex presente: convex/stripe.ts |
| `frontend.contexts.criticos` | arquitectura | HIGH | PASS | Contextos React criticos presentes |
| `cmd.typecheck` | calidad | HIGH | PASS | `npm run typecheck` (tsc -p tsconfig.check.json --noEmit) |
| `economy.idempotencia` | finanzas | HIGH | PASS | Economy (points/wallet/rewards) usa eventKey/claimKey |
| `fintech.sin_charge_local` | finanzas | HIGH | PASS | FintechContext no simula cargos locales (provider.charge / setTimeout) |
| `kyc.stripe_identity` | finanzas | HIGH | PASS | KYC integrado con Stripe Identity con flag explicito de mock |
| `orders.estados_escrow` | finanzas | HIGH | PASS | Estados de orden compatibles con flujo escrow |
| `orders.idempotencia` | finanzas | HIGH | PASS | Orders soporta idempotencyKey con indice |
| `schema.index.paymentEvents.by_stripe_event` | finanzas | HIGH | PASS | Indice transaccional en paymentEvents: by_stripe_event |
| `schema.index.payments.by_order` | finanzas | HIGH | PASS | Indice transaccional en payments: by_order |
| `schema.index.payments.by_status` | finanzas | HIGH | PASS | Indice transaccional en payments: by_status |
| `schema.index.payments.by_stripe_intent` | finanzas | HIGH | PASS | Indice transaccional en payments: by_stripe_intent |
| `schema.index.payouts.by_seller` | finanzas | HIGH | PASS | Indice transaccional en payouts: by_seller |
| `schema.index.walletAccounts.by_user` | finanzas | HIGH | PASS | Indice transaccional en walletAccounts: by_user |
| `schema.index.withdrawals.by_user` | finanzas | HIGH | PASS | Indice transaccional en withdrawals: by_user |
| `schema.table.payouts` | finanzas | HIGH | PASS | Tabla financiera persistida en convex/schema.ts: payouts |
| `schema.table.walletAccounts` | finanzas | HIGH | PASS | Tabla financiera persistida en convex/schema.ts: walletAccounts |
| `schema.table.withdrawals` | finanzas | HIGH | PASS | Tabla financiera persistida en convex/schema.ts: withdrawals |
| `stripe.connect.payouts` | finanzas | HIGH | PASS | Soporte de Stripe Connect (onboarding + payout) |
| `webhook.eventos_cubiertos` | finanzas | HIGH | PASS | Webhook Stripe cubre eventos criticos del ciclo de vida del pago |
| `integrations.app_stores` | integraciones | HIGH | WARN | Documentacion para Apple/Play presente (credenciales pendientes) |
| `integrations.crash_analytics` | integraciones | HIGH | FAIL | SDK de crash reporting / analytics integrado |
| `online.convex_reachable` | integraciones | HIGH | PASS | Convex deployment alcanzable (HEAD/GET) |
| `release.eas.profile_production` | release | HIGH | PASS | eas.json tiene perfil 'production' configurado |
| `app.bundle.identifiers` | seguridad | HIGH | PASS | app.json define bundleIdentifier (iOS) y package (Android) |
| `backend.auth_helpers` | seguridad | HIGH | PASS | Backend usa requireActor / assertSelfOrAdmin / assertAdminOrDeveloper |
| `eas.production.convex_url` | seguridad | HIGH | PASS | eas.json -> production define EXPO_PUBLIC_CONVEX_URL valido |
| `maps.apikey_restriccion` | seguridad | HIGH | WARN | Google Maps API key embebida en app.json (verificar restriccion en GCP) |
| `convex.module.cart` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/cart.ts |
| `convex.module.developer` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/developer.ts |
| `convex.module.disputes` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/disputes.ts |
| `convex.module.economy` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/economy.ts |
| `convex.module.files` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/files.ts |
| `convex.module.identity` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/identity.ts |
| `convex.module.listings` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/listings.ts |
| `convex.module.notifications` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/notifications.ts |
| `convex.module.orders` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/orders.ts |
| `convex.module.reviews` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/reviews.ts |
| `convex.module.userProfile` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/userProfile.ts |
| `convex.module.users` | arquitectura | MEDIUM | PASS | Modulo Convex presente: convex/users.ts |
| `deps.@react-navigation/native` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Navegacion (@react-navigation/native) |
| `deps.@stripe/stripe-react-native` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Stripe RN SDK (@stripe/stripe-react-native) |
| `deps.convex` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Cliente Convex (convex) |
| `deps.expo` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Expo SDK base (expo) |
| `deps.expo-image-picker` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Captura de evidencia/foto (expo-image-picker) |
| `deps.expo-notifications` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Push notifications (expo-notifications) |
| `deps.react` | arquitectura | MEDIUM | PASS | Dependencia critica presente: React core (react) |
| `deps.react-native` | arquitectura | MEDIUM | PASS | Dependencia critica presente: React Native runtime (react-native) |
| `deps.resend` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Servicio de emails (resend) |
| `deps.stripe` | arquitectura | MEDIUM | PASS | Dependencia critica presente: Stripe Node SDK (server) (stripe) |
| `integrations.expo_push` | integraciones | MEDIUM | PASS | Expo push notifications integrado |
| `integrations.maps` | integraciones | MEDIUM | PASS | Google Maps integrado (deps + key embebida) |
| `integrations.resend` | integraciones | MEDIUM | PASS | Resend (emails transaccionales) integrado |
| `release.android.apk_artifact` | release | MEDIUM | PASS | Artefacto Android release disponible |
| `release.ios.encryption_declaration` | release | MEDIUM | PASS | iOS declara ITSAppUsesNonExemptEncryption=false (export compliance) |
| `release.version_metadata` | release | MEDIUM | PASS | app.json define version y android.versionCode |
| `env.example.documenta_variables` | seguridad | MEDIUM | PASS | .env.example documenta todas las variables criticas |
| `mocks.flags_explicitas` | seguridad | MEDIUM | PASS | Mocks de pagos/KYC controlados por flags explicitas (ALLOW_*_MOCK) |
| `testing.constitution` | calidad | LOW | PASS | Suite 'constitution' de tests presente |
| `testing.health_check_script` | calidad | LOW | PASS | Script de health-check Node presente |
| `testing.jest_config` | calidad | LOW | PASS | Configuracion Jest presente |
| `testing.tsconfig_check` | calidad | LOW | PASS | tsconfig.check.json para typecheck dedicado |
| `integrations.zendesk` | integraciones | LOW | WARN | Zendesk preparado en env (modulo deshabilitado) |
| `online.stripe_api` | integraciones | LOW | SKIP | Sin STRIPE_SECRET_KEY en env, se omite chequeo Stripe |
| `release.build_script` | release | LOW | PASS | Script de build release presente (build-release.ps1) |
| `release.doc.CREDENTIALS_HANDOFF_CHECKLIST.md` | release | LOW | PASS | Documentacion de release: Handoff de credenciales |
| `release.doc.IOS_RELEASE_ENABLEMENT.md` | release | LOW | PASS | Documentacion de release: Habilitacion iOS |
| `release.doc.PLAY_CONSOLE_RELEASE_CHECKLIST.md` | release | LOW | PASS | Documentacion de release: Play Console checklist |
| `release.doc.RELEASE_ANDROID.md` | release | LOW | PASS | Documentacion de release: Guia release Android |
| `release.doc.STORE_METADATA.md` | release | LOW | PASS | Documentacion de release: Metadata stores |
| `release.doc.STORE_READY_BASELINE.md` | release | LOW | PASS | Documentacion de release: Baseline store readiness |

## 7) Notas tecnicas

- Esta auditoria es estatica + opcionalmente operativa (typecheck) + opcionalmente online.
- Los chequeos de credenciales reales (Stripe live, Resend, Apple/Play) requieren intervencion humana
  y se reportan como `WARN/FAIL` cuando no se detectan.
- El estado global se calcula segun la severidad de los `FAIL`:
  CRITICAL -> NO_GO, HIGH -> GO_WITH_RISKS, sin FAIL -> GO.
