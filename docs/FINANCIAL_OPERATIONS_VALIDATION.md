# Financial Operations Validation

Fecha: `2026-03-30`

## Objetivo
Cerrar Sprint 2 con evidencia de que comisiones, escrow y retiros operan sin desbalances visibles.

## Matriz de validación

| Caso | Precondición | Resultado esperado | Estado |
|---|---|---|---|
| Cobro exitoso | PaymentIntent confirmado | Orden `payment_received` + escrow `held` | [ ] |
| Confirmación entrega | Orden `delivered` | Orden `completed` + escrow `released` | [ ] |
| Cancelación antes de envío | Orden `payment_received` | Orden `cancelled` + escrow `refunded` | [ ] |
| Disputa | Orden activa | Orden `disputed` + escrow `frozen` | [ ] |
| Split Ramgos | Cobro con comisión | Movimiento comisión registrado | [ ] |
| Split Influencer | Cobro con referral/campaña | Comisión influencer registrada | [ ] |
| Retiro seller/influencer | KYC aprobado + saldo | Solicitud `pending` y trazable | [ ] |

## Datos a registrar por cada ejecución
- `orderId`
- `paymentIntentId`
- `actorId` (buyer/seller/influencer)
- montos:
  - bruto
  - fee pasarela
  - comisión Ramgos
  - comisión influencer
  - neto vendedor
- timestamps:
  - creación orden
  - cobro confirmado
  - liberación/reembolso

## Criterios de aceptación Sprint 2
- [ ] Sin diferencias entre total cobrado y suma de distribución financiera.
- [ ] Todos los cambios de estado críticos dejan evidencia verificable.
- [ ] Soporte puede auditar un caso completo de punta a punta (pago -> orden -> escrow -> retiro).
