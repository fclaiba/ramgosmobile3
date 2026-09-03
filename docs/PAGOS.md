# Pagos — el mapa

> **Empezá acá.** Este documento responde tres preguntas: cómo funciona, qué está
> probado, y qué falta. Los demás documentos son referencia especializada; hay un
> índice al final.
>
> Última verificación contra el código y contra Stripe: **2026-09-03**.

---

## 1. ¿Puedo pasar a otra cosa?

**El sistema funciona y está probado de punta a punta, pero sólo en modo prueba.**
Para cobrarle a un cliente real falta **una sola cosa que bloquea**: publicar una
versión nueva de la app en las tiendas.

El motivo es concreto: la decisión de cobrar "de verdad" o "en modo prueba" vive
**dentro de la app**, no en el servidor. Los celulares que ya tienen la app
instalada tienen el código viejo, que elige modo prueba. Ningún despliegue de
backend los alcanza.

| | Estado |
|---|---|
| Código de pagos | ✅ Completo y desplegado en producción |
| Circuito probado contra Stripe | ✅ Cobro, split, escrow, liberación, reembolso, disputa |
| Webhooks de producción | ✅ Configurados y apuntando al servidor correcto |
| App publicada con el arreglo | ❌ **Bloqueante** — hay que buildear y publicar |
| Compra real de validación | ❌ Pendiente |

---

## 2. Cómo funciona, en una página

### El recorrido de la plata

El comprador **le paga a Ramgos**, no al vendedor. La plata queda retenida
(escrow) hasta que se confirma la entrega, y recién ahí se transfiere.

```
Comprador paga  3000¢
      ↓         el dinero entra a la cuenta de Ramgos
  [ESCROW]      retenido: la orden queda en "held"
      ↓         comprador confirma recepción (o vence el plazo)
Vendedor cobra  1983¢  ← transferencia real a su cuenta de Stripe

   3000  cobrado
   -900  comisión Ramgos (30%: es un bono)
   -117  comisión de Stripe (2.9% + 30¢), el REAL, no estimado
  =1983  neto al vendedor
```

Ese ejemplo no es teórico: es la transferencia `tr_3UBNx4A7Fz349bFU05WJBQ8r`,
verificable en el panel de Stripe.

### Las comisiones

| Concepto | Tasa | Quién la paga |
|---|---|---|
| Comisión Ramgos — productos, servicios, eventos | **10%** | Se descuenta del vendedor |
| Comisión Ramgos — bonos | **30%** | Se descuenta del vendedor |
| Comisión de Stripe (2.9% + 30¢) | variable | Se descuenta del vendedor |
| Influencer (si la venta vino de un referido) | según campaña | Sale de la parte del vendedor |

Se calculan **por producto**, no sobre el total del carrito. Si un carrito tiene
varios vendedores, cada uno recibe su propia transferencia con su propio cálculo.
Fuente de verdad: `convex/_fees.ts` y `convex/_split.ts`.

### Cuándo se libera la plata

| Tipo | Se libera |
|---|---|
| Producto / alquiler | 10 días después de la compra |
| Bono | 1 día |
| Servicio | 7 días después de marcarlo entregado |
| Evento | 24 h después de la fecha del evento |
| Cualquiera | **inmediato** si el comprador confirma recepción |
| Influencer | 10 días después de que se liberó la orden |

Fuente de verdad: `convex/orders/_escrowStates.ts`.

### Cómo vincula su cuenta un vendedor

Tres entradas, mismo flujo: el banner de su **dashboard** (negocio o influencer),
o la pantalla de **Retirar fondos**.

Al tocarlo se crea su cuenta en Stripe, se abre el **formulario de Stripe** (datos
personales, fiscales y bancarios — nunca pasan por nuestra app), y al terminar
vuelve solo. El estado se actualiza automáticamente. Hasta que Stripe la aprueba,
ese vendedor no puede recibir transferencias: si se libera una venta suya antes,
la orden queda pendiente con el error a la vista y se puede reintentar.

### Tres decisiones de arquitectura que conviene conocer

1. **Separate Charges & Transfers, no destination charges.** El cobro entra
   entero a la cuenta de Ramgos y las transferencias a vendedores salen después,
   por separado. Es lo que permite el escrow: si el dinero fuera directo al
   vendedor en el momento del cobro, no habría nada que retener.
2. **`losses_collector: application`.** Ante una disputa o contracargo, **Ramgos
   absorbe la pérdida**, no el vendedor. Es coherente con lo anterior: el cargo
   vive en nuestra cuenta. Stripe además lo exige para esta configuración.
3. **No se usa `application_fee_amount` de Stripe.** El split es contabilidad
   propia (`_split.ts`) más transferencias manuales. Migrar a un split automático
   de Stripe implicaría rehacer el checkout entero.

---

## 3. Qué está probado y qué no

### Verificado contra Stripe (no es teoría)

| Flujo | Evidencia |
|---|---|
| Vincular cuenta del vendedor | Cuenta creada y onboarding completado |
| Cobro y creación de la orden | Orden en escrow con el split congelado |
| Split de comisiones | 3000 → 900 + 117 + 1983, exacto |
| Liberación al vendedor | Transferencia `tr_3UBNx4A7Fz349bFU05WJBQ8r` |
| Reembolso | Reembolso `re_3UBOC4A7Fz349bFU1w9BIMXb`, orden a `refunded` |
| Disputa (contracargo) | Orden congelada y restaurada al cerrarse a favor |
| **Idempotencia** | Reenviar el aviso no duplica la orden; liberar dos veces no paga dos veces; reembolsar dos veces se rechaza |

La idempotencia importa más de lo que parece: es lo que evita pagar dos veces
cuando Stripe reintenta un aviso, que es algo que ocurre de forma rutinaria.

### Probado a medias

**Disputas.** Se ejercitó nuestro manejo del evento, con firma real y sobre una
orden y un cargo reales, pero el objeto de la disputa es sintético: Stripe no
permite fabricar una disputa sobre un cargo existente. La única forma de probarlo
de verdad es comprar con la tarjeta `4000000000000259` desde la app.

### Sin probar

**El pago al influencer.** El código existe, tiene tests, y el proceso programado
corre limpio — pero nunca se ejecutó una transferencia real a un influencer,
porque para eso hace falta una compra hecha con un código de referido y las
pruebas se hicieron sin uno. **Es el único tramo del circuito que nunca se
ejercitó.** Se cierra con una compra de prueba usando un link de influencer.

### Limitación conocida y aceptada

Si un carrito mezcla productos atribuidos a **influencers distintos**, la
atribución se descarta entera. Es una regla deliberada, no un bug.

---

## 4. Qué falta para cobrar de verdad

### Bloqueante

**Publicar la app.** `eas build --profile production` y subirla a las tiendas.
Marca el calendario porque la revisión tarda días. Sin esto, los usuarios que ya
tienen la app siguen pagando en modo prueba — y eso no es inofensivo: la orden se
crea igual, se descuenta stock y queda una deuda con el vendedor respaldada por
plata que nunca entró.

### Antes de abrir a clientes

1. **Verificar el entorno de Vercel**: que `EXPO_PUBLIC_CONVEX_URL` apunte al
   servidor de producción (`deafening-turtle-227`) y que `STRIPE_MOCK_MODE` no
   esté activado. Sólo se ve en el panel de Vercel.
2. **Rotar los secretos.** La clave secreta de Stripe está en texto plano en
   `.env.local` y además fue expuesta en una conversación de trabajo. Rotar al
   menos `STRIPE_SECRET_KEY` y `JWT_PRIVATE_KEY`, y recargarlas en Convex.
3. **Una compra real de monto chico**, de punta a punta, verificando la
   transferencia al vendedor en el panel de Stripe.
4. **Cerrar el pago al influencer** con una compra de prueba con referido.

### Riesgo anotado

Producción tiene cargada la clave de prueba de Stripe, así que ofrece los dos
modos. Una app vieja que llegue a producción elegirá modo prueba. Se puede cerrar
en cualquier momento quitando `STRIPE_SECRET_KEY_TEST` del entorno de producción:
eso fuerza a cualquier app, vieja o nueva, a cobrar de verdad.

---

## 5. Los otros documentos

| Documento | Para qué sirve |
|---|---|
| **Este** | Mapa general y estado. Empezá acá. |
| `PAYMENTS_SETUP.md` | **Operación**: variables de entorno, configuración de webhooks, guion de prueba paso a paso, checklist de salida a producción. |
| `ARQUITECTURA_ESCROW.md` | Plazos y estados de retención. Ojo: sus secciones 1-3 son visión de producto **no implementada**; la sección 4 es lo real. |
| `PLAN_ESTRATEGICO_MAESTRO.md` | Tracker y bitácora de errores (E-135 a E-143 cubren todo el trabajo de pagos). Es el "qué pasó y qué falta"; esto es el "cómo funciona". |
| `ARQUITECTURA_SOCIAL_COMMERCE.md` | Cómo una venta que nace en el feed llega al carrito. La parte de pagos delega acá. |

**Fuentes de verdad en el código** (si un documento y el código se contradicen,
gana el código): `convex/_fees.ts` (comisiones), `convex/_split.ts` (cálculo del
split), `convex/orders/_escrowStates.ts` (estados y plazos), `convex/stripe.ts`
(cobro, liberación, reembolsos), `convex/connect.ts` (cuentas de vendedores).
