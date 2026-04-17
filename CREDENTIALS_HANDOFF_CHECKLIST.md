# Credentials Handoff Checklist

Fecha: `2026-03-30`

## Sprint 1 - Convex + Stripe Core

Completar este bloque antes de ejecutar cobros reales.

### 1) Convex
- [ ] `EXPO_PUBLIC_CONVEX_URL` productivo confirmado.
- [ ] Proyecto Convex accesible por CLI del owner (`npx convex dev` / `deploy`).
- [ ] Variables en Convex (server-side):
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `ALLOW_STRIPE_MOCK=false` en producción.

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
