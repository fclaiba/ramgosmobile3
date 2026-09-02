
# Arquitectura de Escrow Dinámico (Retención de Fondos)

> [!NOTE]
> **¿Qué es el Escrow?** Es el mecanismo financiero donde Ramgos actúa como un tercero imparcial, reteniendo el dinero del comprador hasta que se cumplen ciertas condiciones pactadas con el vendedor. Esto erradica las estafas y genera total confianza.

## 1. Concepto General
Dado que Ramgos es un ecosistema híbrido donde se puede comprar desde una taza hasta reservar un Airbnb o pagar una entrada a una discoteca, **un solo tipo de Escrow no sirve**. 
El sistema de Escrow de Ramgos es **adaptativo**, mutando sus reglas de liberación de fondos dependiendo de la naturaleza del ítem transaccionado.

## 2. Tipología de Escrows y Reglas de Liberación

### A. Productos Físicos (Bienes Tangibles)
*Ejemplo: Comprar una moto, una taza, indumentaria.*
* **Condición de Liberación:** El comprador debe hacer click en "Recibí mi producto y está todo OK" en la app. Alternativamente, si hay un código de seguimiento de correo (API de Andreani/Correo Argentino) y marca como "Entregado", se activa un periodo de gracia (ej. 48hs). Si el comprador no abre disputa en ese plazo, la plata se libera.
* **Garantía:** Evita que te manden un ladrillo en una caja.

### B. Servicios Profesionales o Informáticos
*Ejemplo: Desarrollo de software, arreglos del hogar (plomería), diseño.*
* **Condición de Liberación (Por Hitos):** Los servicios grandes se pueden dividir en hitos (milestones). La plata se libera contra la aprobación formal del comprador en la app de que el trabajo (o una fase de este) fue concluido satisfactoriamente.

### C. Infoproductos (Productos Digitales)
*Ejemplo: PDFs, Cursos en video, E-books.*
* **Condición de Liberación:** Liberación casi inmediata (ej. 2-12 horas) luego de que el usuario accede al link o descarga el archivo. El periodo de gracia es cortísimo y solo sirve para evitar links rotos o fraudes de archivos vacíos.

### D. Servicios Presenciales de Turno
*Ejemplo: Sesión de masajes, turno de peluquería, consulta médica.*
* **Condición de Liberación:** El usuario llega al local. El profesional escanea un Código QR desde el celular del cliente (o valida un código de 4 dígitos), lo que hace un "Check-In" criptográfico. La plata se libera en ese exacto segundo hacia el profesional.

### E. Entradas a Eventos, Fiestas y Restaurantes
*Ejemplo: Ticket para un boliche, reserva de mesa VIP.*
* **Condición de Liberación (Híbrida/Masiva):** 
  - **Opción A (Riesgo Bajo):** La plata se liquida en lotes al organizador (ej. 40% días antes para pagar proveedores, 60% al abrir puertas).
  - **Opción B (Estricta):** El dinero se libera en tiempo real a medida que los asistentes validan su ticket QR en la puerta del evento. 

### F. Alquileres Temporales (Estilo Airbnb)
*Ejemplo: Alquiler de departamento por 3 días, alquiler de quinta para evento.*
* **Condición de Liberación:** El monto total queda bloqueado hasta **24 horas después de la hora oficial del Check-In**. Si el inquilino entra a la casa y no era la de las fotos (o no le dieron la llave), tiene 24hs para trabar el pago. Si todo fluye, el anfitrión cobra al día siguiente.

## 3. Resolución de Disputas (Casos de Quiebre)
Si hay un quiebre en cualquier tipo de contrato (el inquilino dice que la casa está sucia, el comprador dice que le llegó otra cosa), los fondos quedan congelados en "Dispute Mode". 
Un moderador de Ramgos (Admin) puede intervenir, solicitar fotos por el chat asociado, y usar la función de `adminForceReleaseEscrow` o `adminRefundEscrow` para liquidar o devolver el pago.



## 4. Implementación (2026-09-02, Stripe Connect SCT)

Estados de escrow (`convex/orders/_escrowStates.ts`):

| Estado | Significado |
| --- | --- |
| `held` | Plata retenida en la cuenta plataforma. |
| `release_pending` | Transfer al vendedor en curso (o falló: `escrowReleaseError`). |
| `released` | Transferida al vendedor (`stripeTransferId`). El influencer cobra a los 10 días. |
| `refund_pending` | Reembolso en curso (o falló: `escrowRefundError`). |
| `refunded` | Devuelta al comprador (total). Parciales vuelven al estado previo. |
| `disputed` | Disputa interna (moderador de Ramgos). |
| `frozen` | Chargeback en Stripe: nadie puede mover la plata hasta que cierre. |

Ventanas de auto-liberación: productos 10 días, bonos 1 día, alquileres 10 días (`marketplace-auto-release`); eventos +24h de la fecha (`events-auto-release`); servicios 7 días entregados (`services-auto-release`). Todo confluye en `internal.stripe.internalReleaseOrderEscrow`. Detalle operativo en `docs/PAYMENTS_SETUP.md`.
