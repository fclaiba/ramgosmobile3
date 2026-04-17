# Closed Beta Go-Live Runbook

Fecha: `2026-03-30`

## Objetivo
Ejecutar Sprint 4 con una salida formal `GO/NO-GO` para lanzamiento cerrado con clientes.

## 1) Pre-flight (T-24h)
- [ ] Build Android release disponible para testers.
- [ ] Build iOS TestFlight disponible para testers.
- [ ] Credenciales productivas activas en backend (sin mock mode).
- [ ] Responsable de soporte en guardia asignado.

## 2) Smoke funcional (T-0)
Validar en ambas plataformas:
- [ ] login
- [ ] listado
- [ ] compra (cobro real controlado)
- [ ] disputa/chat
- [ ] reseña
- [ ] perfil

Registrar por cada flujo:
- evidencia (captura/video),
- PASS/FAIL,
- IDs de negocio (`orderId`, `paymentIntentId`, `disputeId/messageId`, `reviewId`).

## 3) Monitoreo 72h

### Métricas operativas mínimas
- [ ] crash-free rate
- [ ] errores de checkout/pago
- [ ] disputas abiertas por día
- [ ] tiempo de primera respuesta de soporte

### Reglas de contención
- [ ] Umbral de incidentes severos definido (rollback/pausa de cohortes).
- [ ] Procedimiento de escalación técnica y operativa documentado.
- [ ] Canal único de comunicación a testers habilitado.

## 4) Cierre
- [ ] Actualizar `STORE_GO_LIVE_ACTA.md` con dictamen.
- [ ] Consolidar evidencia en `QA_PROD_100_CIERRE.md`.
- [ ] Emitir decisión final: `GO` o `NO-GO`.
