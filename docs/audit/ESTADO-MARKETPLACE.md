# Estado del marketplace — 2026-09-04 (208ab3c)

Auditoría de integridad transaccional. Evidencia estática en `docs/audit/audit-report.{json,md}`
(scanner `scripts/audit/marketplace-audit.mjs`, 124 archivos, 543 límites transaccionales);
falsación en `tests/audit/`. Toda afirmación lleva `archivo:línea`; sin evidencia → `NO_VERIFICADO`.

## 1. Veredicto ejecutivo

**Se puede sobrevender un producto de unidad única, y hoy pasa por diseño.** El stock se chequea en
`createPaymentIntent` (una action, antes de cobrar) y se descuenta en el webhook (una mutation,
después de cobrar); entre ambos no hay reserva. N compradores concurrentes sobre stock 1 pagan los N;
el código lo sabe, lo registra en `orders.stockShortfall` y lo loguea — pero nadie lo lee.

**Un bono reembolsado sigue siendo canjeable.** El refund no toca `bonoRedemptions`: el comprador
recupera los $50 y conserva $100 de crédito. El negocio paga la diferencia.

**Los eventos no controlan aforo ni emiten entradas.** `holdEventCapacity` e
`internalIssueEventReservationsForPayment` existen, están bien escritos, y tienen **cero call sites**.
Se venden entradas sin límite y el comprador no recibe QR.

**Dos mutations públicas sin autenticación crean bonos** (`seedMockBonos`, `seed5Bonos`) sobre
negocios reales. Cualquiera con la URL del deployment (está en el bundle) puede invocarlas.

**Lo que sí está sólido:** pagos, escrow, reembolsos de dinero, reversión de transfers, idempotencia
de webhooks y canje de bonos. Es el módulo con más tests y el único con máquina de estados aplicada.

**¿Abrir al público hoy?** Sí para productos con stock > 1 y bonos, **con 3 condiciones**: cerrar los
seeds públicos (30 min), cancelar el bono en el refund (1 h), y no vender unidades únicas ni eventos
hasta tener reserva atómica. Agenda de turnos: no existe, no aplica.

## 2. Tablero de madurez

| Área | Nivel | Invariantes críticos rotos | Riesgo |
|---|---|---|---|
| Stock | **2** — Camino feliz | STK-01, STK-03 (STK-02 y STK-05 en 3) | **Alto** para unidad única; Medio para stock > 1 |
| Agenda | **0-1** — Inexistente / esbozada | AGD-01, AGD-02, AGD-05, AGD-08 (feature no construida); eventos: capacidad desconectada | Bajo (turnos) / **Alto** (eventos) |
| Pagos y reembolsos | **3** — Robusto | PAY-05 (efectos colaterales) | Medio |
| Bonos | **3** con un agujero | BON-07 | **Alto** (pérdida directa del negocio) |
| Transversal | **2** | TRV-01 (seeds públicos), TRV-02 (0 tests de concurrencia) | **Alto** |

## 3. Hallazgos críticos

### [STK-01 / STK-03] Sobreventa de unidad única: chequeo y descuento en transacciones distintas
- **Nivel:** 2 — Camino feliz
- **Evidencia:** `convex/stripe.ts:233` (chequeo en action `createPaymentIntent`, L312) · `convex/stripe.ts:713-723` (descuento en mutation `internalProcessPaidCheckout`, L647, acotado en 0) · `convex/_inventory.ts:20-29` (la decisión documentada: "después de cobrar NO se rechaza") · `tests/audit/invariants.pure.test.ts` (5 compradores → 5 órdenes)
- **Qué pasa hoy:** cada comprador pasa el pre-check leyendo el mismo stock; todos pagan en Stripe; cada webhook descuenta acotado en 0, crea la orden en `paid_escrow` y guarda `stockShortfall`. Ninguna orden se rechaza ni se reembolsa sola. El descuento en sí es atómico (mutation → OCC), pero el invariante "una sola orden pagada" no vive en ninguna transacción.
- **Escenario de falla concreto:** (1) producto usado con `stock: 1`; (2) A y B tocan "Pagar" con 3 s de diferencia — ambos `createPaymentIntent` leen stock 1 y crean PI; (3) ambos confirman tarjeta; (4) llegan dos `payment_intent.succeeded`; (5) primera mutation: stock 1→0, orden A; segunda: shortfall 1, stock 0, orden B en `paid_escrow` con `stockShortfall: [{requested:1, available:0}]`; (6) el vendedor ve dos órdenes pagadas por un solo artículo.
- **Impacto económico:** el vendedor tiene que cancelar y reembolsar B a mano (la comisión de Stripe del cobro no se recupera: ~3% + fijo por orden fallida), y hasta que alguien lo note la plata de B está en escrow. Con `marketplace-auto-release` (`crons.ts:22`) a los N días **la orden B se libera al vendedor igual**: cobra dos veces por un artículo.
- **Corrección mínima:** una mutation `reserveStock` (check-and-decrement + fila de reserva con TTL) llamada desde `createPaymentIntent` **antes** de `paymentIntents.create`; el webhook consume la reserva en vez de descontar; un cron libera reservas vencidas (PI `canceled`/`payment_failed`). Mientras tanto: que `internalProcessPaidCheckout` programe un refund automático cuando `shortfalls.length > 0` (`internalRefundOrder` ya existe, L1722) y avise a admins.

### [BON-07 / PAY-05] El reembolso no cancela el bono
- **Nivel:** 1 — Esbozado (el estado `cancelled` existe en el guard, nadie lo escribe)
- **Evidencia:** `convex/bonos.ts:273-278` (redeemBono rechaza `cancelled`) · scanner BON-07: 0 escrituras de `status: "cancelled"` en `bonos.ts`, `stripe.ts`, `disputes.ts` · `convex/stripe.ts:1555-1689` (`internalCompleteOrderRefund` no lee ni escribe `bonoRedemptions`) · `convex/orders/_escrowStates.ts:134` (`isRefundable('held')` y `isRefundable('released')` → `true`)
- **Qué pasa hoy:** el bono se emite al pagar (`stripe.ts:778` → `internalIssueBonosForOrder`) con `status: issued`. Un refund (admin `adminRefundEscrow` L2017, disputa a favor del comprador `disputes.ts:302`, contracargo perdido L1961, o refund desde el dashboard de Stripe L1857) devuelve el dinero y deja el bono `issued`.
- **Escenario de falla concreto:** (1) comprador paga $50 por un bono de $100; (2) abre disputa "no me llegó" → admin resuelve a favor → `refunded`; (3) el comprador va al negocio con el QR; (4) `redeemBono` valida `issued`, no vencido, sellerId correcto → canjea $100; (5) intenta auto-release: `isReleasable('refunded')` es `false`, no hay transfer. **Inverso:** bono canjeado → `released` → admin reembolsa después (`isRefundable('released')` = true): el comprador recupera $50 tras gastar $100; al negocio se le revierte el transfer (L1808 `createReversal`).
- **Impacto económico:** $100 de mercadería por bono en el primer caso, $100 + $45 netos en el segundo. Lo paga el negocio, no la plataforma — es el tipo de pérdida que hace que un negocio se vaya.
- **Corrección mínima:** en `internalBeginOrderRefund` (`stripe.ts:1493`): si la orden tiene bonos por `by_order`, (a) si alguno está `redeemed` → rechazar el refund salvo `force` de admin con motivo; (b) si `issued` → patch `status: "cancelled"` en la misma mutation (atómico con el `refund_pending`). Y `canTransition('released', 'refund_pending')` para `listingType === 'bono'` debería exigir el mismo `force`.

### [AGD-06 / STK-04] Aforo de eventos y entradas: implementados y desconectados
- **Nivel:** 1 — Esbozado
- **Evidencia:** `convex/events.ts:40` (`holdEventCapacity`, atómico, correcto) y `:102` (`internalIssueEventReservationsForPayment`, idempotente por pago) · scanner STK-04 counterHit: **0 call sites** de ambos fuera de `events.ts`, en `convex/` y en `src/` · `convex/stripe.ts:778` (el checkout pagado sólo emite bonos) · `convex/events.ts:2-13` (el comentario afirma que CheckoutScreen llama al hold: es falso)
- **Qué pasa hoy:** `eventSoldCount` nunca se incrementa; `eventReservations` nunca se inserta; `checkInReservation` (L173) no tiene nada que escanear. El único freno es `listings.stock`, que el cliente manda con default **1** si el campo queda vacío (`src/screens/CreateListingScreen.tsx:250`, `_validation.ts:94`) y que el pre-check aplica a todos los tipos (`stripe.ts:233`).
- **Escenario de falla concreto:** evento con `eventCapacity: 80` y `stock: 200` (el vendedor puso "muchas"): se venden 200 entradas; ninguna tiene QR; en la puerta no hay forma de validar. Con `stock` vacío: se vende **una** entrada y la segunda persona ve "se quedó sin stock".
- **Impacto económico:** sobreventa de aforo (reembolsos masivos + reputación) o subventa (una sola entrada). Ambos silenciosos.
- **Corrección mínima:** llamar `internalIssueEventReservationsForPayment` desde `internalProcessPaidCheckout` junto al bono (L778, mismo patrón); y unificar el aforo con la reserva de stock del hallazgo anterior (`eventCapacity - eventSoldCount` es el mismo problema que `stock`). Hasta entonces, no vender eventos.

### [TRV-01] Mutations públicas sin autenticación escriben bonos sobre negocios reales
- **Nivel:** 2
- **Evidencia:** `convex/bonos.ts:693` (`seedMockBonos`, `mutation` pública, sin `requireActor`, escribe `listings` + `bonoRedemptions` con `status: "issued"` y `stock: 9999`) · `convex/developer.ts:279` (`seed5Bonos`, ídem) · scanner TRV-01 y tabla de límites (`**NO**` en la columna requireActor)
- **Qué pasa hoy:** cualquier cliente con la URL del deployment (pública en el bundle de la app) puede llamarlas. `seedMockBonos` elige un negocio real por `role: "business"` y le crea bonos emitidos a nombre de un usuario.
- **Escenario de falla concreto:** `npx convex run bonos:seedMockBonos --url https://academic-lapwing-311.convex.cloud` desde cualquier máquina → bonos `issued` redimibles en un negocio real. El código lo devuelve o lo lee `lookupBono`.
- **Impacto económico:** crédito falso canjeable; además contamina `listings` activos en producción.
- **Corrección mínima:** convertirlas a `internalMutation` (se siguen pudiendo correr desde el dashboard) o, si tienen que ser públicas para el panel de developer, `requireActor` + `role === 'developer'` + rechazo cuando `mode === 'live'`.

### [TRV-02] Cero tests de concurrencia
- **Nivel:** 0
- **Evidencia:** scanner `tests.concurrencyTests: []` sobre 18 archivos en `convex/__tests__`; `docs/PLAN_ESTRATEGICO_MAESTRO.md` E-146 (convex-test no arranca con Jest)
- **Qué pasa hoy:** ninguno de los invariantes de esta auditoría tiene un test que lo ejercite bajo dos solicitudes simultáneas. Los tests existentes (`escrowStates`, `orderStates`, `inventory`, `payoutRetry`) son de módulos puros: prueban la tabla de transiciones, no la carrera.
- **Impacto económico:** indirecto — es lo que permitió que STK-01 y AGD-06 llegaran a producción con comentarios que afirman lo contrario.
- **Corrección mínima:** correr `tests/audit/concurrency.integration.test.ts` contra un deployment de preview (instrucciones en `tests/audit/README.md`) y dejarlo en CI con un deployment efímero.

## 4. Hallazgos secundarios

| ID | Nivel | Evidencia | Descripción |
|---|---|---|---|
| STK-02 | 3 | `_inventory.ts:59` `Math.max(0, …)` + mutation | El stock nunca queda negativo. Garantía en backend (OCC + clamp), no en DB. |
| STK-05 | 3 | `stripe.ts:447` `idempotencyKey: pi:${userId}:${cartId}` · `stripe.ts:668-685` órdenes existentes por PI · `finance.ts:298-340` `paymentEvents` con reintento correcto | Un webhook duplicado no descuenta dos veces. |
| STK-06 | 2 | `stripe.ts:1604` `if (full && listingType === "product")` | Sólo el refund **total** de **producto** repone. Refund parcial (2 de 3 unidades) no repone nada. |
| STK-07 | 3 | `stripe.ts:700-757`, `_inventory.ts:20-29` | Política explícita y escrita: post-cobro se acota y se registra. Es coherente; el problema es que nadie consume el registro (TRV-04). |
| STK-08 | 0 | scanner: 0 hits | Sin variantes. Un listing = un SKU. Aceptable para el catálogo actual. |
| STK-09 | 3 | scanner STK-09 (4 hits, todos lectura) | Fuente única: `listings.stock`. El carrito guarda snapshot de precio, no de stock. |
| STK-10 | 0 | scanner: 0 hits | Sin ledger de movimientos. Una discrepancia de stock no se puede auditar. |
| STK-* (nuevo) | 2 | `CreateListingScreen.tsx:250`, `_validation.ts:94`, `cart.ts:92` (guarda sólo `product`), `stripe.ts:233` (check para todos) | Bonos y servicios creados con el campo vacío nacen con `stock: 1`: el carrito deja agregar 5, el checkout rechaza desde la segunda venta. Subventa silenciosa. |
| AGD-01..09 | 0-1 | `schema.ts:550` (`bookings`, 0 escritores, 0 lectores, forma de alquiler) · `businessSettings.slotDurationMinutes` (`schema.ts:1997`, configurable, nunca leído en un check) | La agenda de turnos no está construida. No es un bug: es una feature ausente. Los servicios se compran como listing sin elegir horario y se liberan por cron a los N días (`events.ts:321`). |
| PAY-01 | 3 | `http.ts:65` firma · `http.ts:98-108` dedupe · `http.ts:83-86` chequeo de `livemode` vs ruta | Firma + idempotencia + reintento seguro. Sin test del handler HTTP → no llega a 4. |
| PAY-02 | 3 | `_escrowStates.ts:36-45` + `isRefundable`/`isReleasable` usados en `stripe.ts` (scanner PAY-02: 3 call sites) · `__tests__/escrowStates.test.ts` | Máquina aplicada y testeada en puro. `refunded` es terminal. |
| PAY-03 | 3 | `stripe.ts:1503` `remaining = gross - refundedCents` · `:1767` `amount: begin.refundCents` | Total y parcial; nunca excede lo capturado. |
| PAY-04 | 3 | `stripe.ts:1498` `isRefundable` · `:1537` `idemBase: refundedCents` · `:1775` `idempotencyKey: refund:${orderId}:${idemBase}` | Doble refund bloqueado por estado y por clave atada a lo ya reembolsado (E-146 A4). |
| PAY-06 | 3 | `stripe.ts:1807-1813` `transfers.createReversal` con `idempotencyKey` · `:1618-1623` `reversedCents` | Transfers al vendedor e influencer se revierten proporcionalmente. |
| PAY-07 | 3 | `crons.ts:26` reconciliación diaria · `reconciliationFlags` · `__tests__/reconciliationRules.test.ts` | Conciliación contra balance transactions con paginación real (E-146 A5). |
| PAY-08 | 3 | `stripe.ts:1896/1930` freeze/unfreeze · `:1961-1998` lost → refund | Disputas manejadas; objeto de disputa probado sólo sintético (`docs/PAGOS.md` §3). |
| BON-01 | 3 | `bonos.ts:241` mutation · `:273-278` guards · `:291-297` patch | Canje único garantizado por OCC de Convex: el segundo canje concurrente se reintenta y ve `redeemed`. Sin test de concurrencia → 3. |
| BON-04 | 3 | `bonos.ts:281-288` `validUntil < Date.now()` → `expired` | Expiración server-side, en el canje. |
| BON-05 | 3 | `bonos.ts:264-270` `sellerId === actor` o admin | Sólo el negocio emisor canjea. |
| BON-08 | 3 | `convex/bonoEconomics.ts` + `__tests__/bonoEconomics.test.ts` | Quién financia está definido: el negocio vende crédito prepago con descuento; la plataforma cobra su % sobre lo pagado. |
| BON-09 | 2 | `bonos.ts:45-50` `Date.now().toString(36) + Math.random().toString(36).slice(2,8)` · sin `rateLimits` en `redeemBono` | ~31 bits de aleatoriedad. Mitigado porque sólo el sellerId canjea, pero un negocio malicioso podría enumerar sus propios bonos. Sin límite de intentos. |
| BON-10 | n/a | `redeemBono` no compara `ownerUserId` | Al portador por diseño (el negocio escanea el QR del cliente). Correcto para el modelo; documentarlo. |
| BON-02/03/06 | n/a | `redeemBono:293` `creditRemaining: 0, usesRemaining: 0` | El bono es de canje único y completo; no hay saldo, packs ni acumulación con descuentos. |
| TRV-03 | 3 | `stripe.ts:154-158` "DESDE LA BASE" · counterHits sólo en `orders.ts:260` (`createOrder`, 0 llamadores) | El precio se recalcula en el servidor. |
| TRV-04 | 2 | `stripe.ts:757` `console.error(SOBREVENTA…)` · `stockShortfall`: 0 lectores en `src/` y `adminQueries.ts` | La sobreventa se detecta y se anota en la orden; nadie la ve. La reconciliación financiera (E-146) sí notifica. |

## 5. Resultados de falsación

| Invariante | Test | Esperado | Obtenido | Veredicto |
|---|---|---|---|---|
| STK-01 / STK-03 | `invariants.pure.test.ts` — modelo puro de la secuencia action→pago→mutation, 5 compradores, stock 1 | 1 orden | **5 órdenes, 4 con shortfall** (`expect(r.orders).toHaveLength(5)` pasa) | **ROTO** (modelo fiel de `stripe.ts:233` y `:713-723`; no es ejecución contra Convex) |
| STK-02 | ídem | stock ≥ 0 | stock 0 | Cumplido |
| BON-07 | `invariants.pure.test.ts` — `isRefundable('released')` | false para bono canjeado | `true` | **ROTO** (política ausente) |
| PAY-04 | ídem — `isRefundable('refund_pending')` | false | false | Cumplido |
| BON-01 | `concurrency.integration.test.ts` — 5 canjes simultáneos contra `oceanic-goose-862` | 1 éxito | **1 éxito, 4 rechazos** | ✅ **Cumplido — sube a nivel 4** (H0, 2026-09-04) |
| AGD-02 / STK-04 | ídem — 5 `createPaymentIntent` simultáneos sobre un evento con capacidad 1 (re-apuntado al checkout real) | 1 éxito | **5 éxitos** | ❌ **ROTO, verificado empíricamente** (H0). Cierra en H3+H4 |
| STK-03 | ídem — 5 `createPaymentIntent` simultáneos sobre un producto con stock 1 | 1 éxito | **5 éxitos** | ❌ **ROTO, verificado empíricamente** (H0). La predicción estática era exacta. Cierra en H3 |
| PAY-01 / STK-05 | ídem — mismo evento firmado entregado dos veces | 1 fila en `paymentEvents` | **1 fila** | ✅ **Cumplido — sube a nivel 4** (H0) |

Salida de `npx jest tests/audit` (auditoría, 2026-09-04): `1 skipped, 1 passed · 4 skipped, 7 passed`.

**H0 (2026-09-04, deployment `ramgos-audit` / `oceanic-goose-862`)** — `npm run test:audit`: `2 failed, 2 passed, 4 total`. STK-03 y AGD-02 en rojo con **5 de 5 éxitos** cada uno: la sobreventa dejó de ser una inferencia. BON-01 y PAY-01 verdes → nivel 4. Los `NO_VERIFICADO` de la tabla quedaron cerrados; ver `tests/audit/README.md`.

## 6. Zonas no verificadas

- **`args.cartId` en la clave de idempotencia del PaymentIntent** (`stripe.ts:447`). Si es estable por usuario, modificar el carrito después de un intento de pago hace que Stripe rechace el segundo PI (`idempotency_error`, 24 h). No encontré dónde nace `cartId` en el cliente (`PaymentForm.tsx:249`) dentro del presupuesto. Determinarlo: leer `PaymentForm.tsx:230-260` y `cart.ts:190-200`.
- **Comportamiento real bajo concurrencia** de BON-01, STK-03, AGD-02 y PAY-01: los tests están escritos; falta un deployment de preview con datos sembrados (`tests/audit/README.md`).
- **`internalAutoReleaseEvents`/`Services`** (`events.ts:264/321`): asumí que liberan por fecha; no leí el cuerpo. No afecta a ningún invariante crítico.
- **Política de cancelación de servicios (AGD-07)**: no existe agenda; `orders.ts` tiene `cancelOrder`? No leído. Si existe, verificar que reponga stock (STK-06 cubre sólo refund).
- **Visibilidad de `stockShortfall` en el dashboard de Convex**: sólo confirmé que no lo lee ninguna query ni pantalla.

## 7. Backlog priorizado

| # | Tarea | Invariantes | Impacto | Esfuerzo | Bloquea lanzamiento |
|---|---|---|---|---|---|
| 1 | `seedMockBonos` y `seed5Bonos` → `internalMutation` (o gate developer + `mode !== 'live'`) | TRV-01 | Alto: crédito falso en negocios reales | 30 min | **Sí** |
| 2 | Cancelar bono `issued` en `internalBeginOrderRefund`; rechazar refund de bono `redeemed` sin `force` | BON-07, PAY-05 | Alto: $100 por bono, lo paga el negocio | 1-2 h | **Sí** |
| 3 | Refund automático + aviso a admins cuando `shortfalls.length > 0` en `internalProcessPaidCheckout` (reusar `internalRefundOrder` y el patrón de notificación de E-146) | STK-01, TRV-04 | Alto: hoy la orden sobrevendida se libera al vendedor por cron | 2 h | **Sí** si venden unidades únicas |
| 4 | Reserva atómica: `reserveStock` (check-and-decrement + TTL) desde `createPaymentIntent`; el webhook consume; cron libera vencidas | STK-01, STK-03, STK-04 | Alto | 1-2 días | Sí para usados / unidad única |
| 5 | Conectar eventos: emitir `eventReservations` desde `internalProcessPaidCheckout` (junto al bono, L778) y aforo vía la reserva del #4 | AGD-06, STK-04 | Alto para eventos | 1 día (con #4) | **Sí** para vender eventos |
| 6 | No aplicar check de stock a `bono`/`service` sin inventario (o default 9999 en el cliente y guard por tipo en `stripe.ts:233` como en `cart.ts:92`) | STK-* nuevo | Medio: subventa silenciosa | 1 h | No |
| 7 | Query admin + fila en `AdminFinanceScreen` para órdenes con `stockShortfall` | TRV-04 | Medio | 2 h | No (cubierto por #3) |
| 8 | Correr `tests/audit/concurrency.integration.test.ts` en un preview y dejarlo en CI | TRV-02 | Medio: evita la próxima E-146 | 3 h | No |
| 9 | Restock proporcional en refund parcial (requiere refund por ítem, hoy es por monto) | STK-06 | Bajo | 1 día | No |
| 10 | `bonoCode` con `crypto.randomUUID()` + `rateLimits` en `redeemBono` | BON-09 | Bajo | 1 h | No |
| 11 | Verificar `cartId` en la idempotency key del PI | §6 | Desconocido | 30 min | No |
| 12 | Agenda de turnos (slots, solapamiento, tz, estados) | AGD-* | — | Feature entera | No: no se ofrece hoy |

## 8. Suite de tests pendiente

| Hallazgo | Test que lo habría detectado | Dónde |
|---|---|---|
| STK-01 | N `createPaymentIntent` concurrentes sobre stock 1 → exactamente 1 PI (hoy: N) | `tests/audit/concurrency.integration.test.ts` (escrito, skip) |
| BON-07 | Emitir bono → refund total → `redeemBono` debe fallar con "cancelado" | integración: `bonos.ts` + `stripe.internalRefundOrder` en preview |
| BON-07 inverso | Canjear → `released` → `adminRefundEscrow` debe exigir `force` | ídem |
| AGD-06 | Pagar un evento → existe `eventReservations` por unidad y `eventSoldCount` == vendidas | integración: webhook simulado (`ALLOW_STRIPE_MOCK`) en preview |
| TRV-01 | Llamar `seedMockBonos` sin sesión → debe rechazar | `convex/__tests__/` con `convex-test`… no disponible; alternativa: test estático sobre el scanner (`TRV-01` hits en archivos no-seed == 0) |
| STK-* nuevo | Crear bono con stock vacío → comprarlo dos veces → la segunda no debe fallar por stock | integración |
| STK-06 | Refund parcial de 2/3 unidades → stock +2 | integración |
| PAY-01 | Mismo `event.id` dos veces → `paymentEvents` con 1 fila y efectos ×1 | `concurrency.integration.test.ts` (escrito, skip) |
