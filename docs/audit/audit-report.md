# Audit report — marketplace (2026-09-04, d815424)

Archivos escaneados: 124 · sección: todo · evidence-budget: 8

## Entidades con inventario / dinero

| tabla | stock | version/lock | campos clave |
|---|---|---|---|
| listings | ✔ | — | price, stock, status, eventCapacity, eventSoldCount |
| orders | — | — | status, escrowState, escrowPrevState, escrowPrevStatus, escrowReleaseTrigger, escrowReleasedAt, escrowRefundError, refundedCents |
| bookings | — | — | checkInDate, status, totalPrice |
| cart | — | — | quantity |
| payments | — | — | status, refundedCents |
| payouts | — | — | status |
| bonoRedemptions | ✔ | — | bonoCode, creditTotal, creditRemaining, usesTotal, usesRemaining, status |
| eventReservations | — | — | quantity, qrCode, status |

## Señales

### STK-01 — Escrituras a listings.stock / eventSoldCount
confianza: **alta** · hits: 12 · counterHits: 0

- `convex/admin.ts:37` — internalMutation wipeAndSeedBonos: insert listings {title,description,price,discountValue,discountType,validityDays,currency,type,category,tags,sellerId,stock,status,slug,createdAt,openPromotion,openCommissionRate}
- `convex/bonos.ts:717` — mutation seedMockBonos: insert listings {sellerId,title,description,price,discountValue,discountType,currency,category,tags,slug,stock,status,type,condition,createdAt,updatedAt,validityDays,validUntil}
- `convex/developer.ts:303` — mutation seed5Bonos: insert listings {sellerId,title,description,price,discountValue,discountType,validityDays,currency,category,tags,slug,stock,status,type,condition,createdAt,updatedAt,validUntil}
- `convex/listings.ts:454` — mutation createListing: insert listings {title,description,price,type,category,stock,image,gallery,tags,damageDescription,location,shippingProfile,eventDate,eventTime,validUntil,validityDays,discountValue,discountType,discountPercent,condition,openPromotion,openCommissionRate,sellerId,...spread,slug,currency,status,views,favoriteCount,orderCount,createdAt,updatedAt}
- `convex/listings.ts:538` — mutation purchaseItem: patch listings {stock}
- `convex/orders.ts:245` — mutation createOrder: patch listings {stock}
- `convex/seed.ts:44` — internalMutation seedE2E: insert listings {title,description,price,currency,type,category,tags,sellerId,stock,status,slug,createdAt,shippingProfile}
- `convex/seedDemoCatalog.ts:303` — internalMutation seedVerifiedDemo: insert listings {title,description,price,currency,type,category,tags,sellerId,stock,status,slug,image,gallery,images,location,shippingProfile,condition,openPromotion,openCommissionRate,eventDate,eventTime,eventCapacity,eventSoldCount,validUntil,validityDays,discountValue,discountType,discountPercent,views,favoriteCount,orderCount,createdAt,updatedAt}
- … +4 más (ver JSON)

### STK-02 — Read-then-write con await externo entre lectura y escritura
confianza: **alta** · hits: 7 · counterHits: 43

- `convex/migrations/connectAccountModeFix.ts:86` — internalAction fixMislabeledAccounts — lee runQuery:migrations.connectAccountModeFix.listAccountsInLiveField → await existeEnModo → escribe runMutation:migrations.connectAccountModeFix.moveAccountToTestField
- `convex/notifications.ts:337` — internalAction notifyUser — lee runQuery:notifications.internalGetUserNotificationData → await response.json → escribe runMutation:notifications.internalRecordPushDelivery
- `convex/social/linkPreview.ts:77` — internalAction internalFetchLinkPreview — lee runQuery:social.linkPreview.internalGetCached → await reader.read → escribe runMutation:social.linkPreview.internalUpsertLinkPreview
- `convex/stripe.ts:312` — action createPaymentIntent — lee runQuery:users.internalGetUserById → await withStripeBreadcrumb → escribe runMutation:finance.createPaymentRecord
- `convex/stripe.ts:530` — action createSetupIntent — lee runQuery:users.internalGetUserById → await stripe.customers.create → escribe runMutation:users.updateUserStripeCustomerId
- `convex/stripe.ts:1423` — internalAction internalPayDueInfluencerPayouts — lee runQuery:stripe.internalListDueInfluencerPayouts → await stripe.transfers.create → escribe runMutation:stripe.internalFinishInfluencerPayout
- `convex/subscriptions.ts:146` — action createSubscriptionCheckout — lee runQuery:subscriptions.internalGetUser → await withStripeBreadcrumb → escribe runMutation:subscriptions.internalSetStripeCustomerId

Evidencia en contra / matices:
- ⚠ `convex/auth.ts:98` — mutation verifyEmailCode — en mutation (atómico por OCC): checkRateLimit
- ⚠ `convex/campaigns.ts:746` — mutation seedBusinessInviteInfluencer1 — en mutation (atómico por OCC): findExistingPair
- ⚠ `convex/cart.ts:310` — mutation clearCart — en mutation (atómico por OCC): Promise.all
- ⚠ `convex/cart.ts:331` — internalMutation internalClearCart — en mutation (atómico por OCC): Promise.all
- ⚠ `convex/disputes.ts:99` — mutation addDisputeMessage — en mutation (atómico por OCC): isSupportUser
- ⚠ `convex/disputes.ts:194` — mutation addEvidence — en mutation (atómico por OCC): isSupportUser
- ⚠ `convex/economy.ts:690` — internalMutation internalAwardPurchasePoints — en mutation (atómico por OCC): ensureEconomyState
- ⚠ `convex/economy.ts:790` — mutation spinLuckyWheel — en mutation (atómico por OCC): ensureEconomyState

### STK-03 — Decremento acotado/condicional
confianza: **alta** · hits: 67 · counterHits: 0

- `convex/_inventory.ts:53` — export function hasEnoughStock(available: number | undefined | null, requested: number): boolean {
- `convex/_inventory.ts:59` — export function decrementStock(available: number, requested: number): number {
- `convex/_inventory.ts:60` — return Math.max(0, available - requested);
- `convex/_inventory.ts:71` — return Math.max(0, requested - available);
- `convex/_split.ts:89` — const weightSum = weights.reduce((a, b) => a + Math.max(0, b), 0);
- `convex/_split.ts:95` — const raw = weights.map((w) => (total * Math.max(0, w)) / weightSum);
- `convex/_split.ts:129` — const shippingCents = Math.max(0, round(input.shippingCents || 0));
- `convex/_split.ts:133` — const unitCents = Math.max(0, round(l.unitCents));
- … +59 más (ver JSON)

### STK-04 — Hold/reserva con TTL y liberación
confianza: **alta** · hits: 47 · counterHits: 1

- `convex/adminQueries.ts:123` — const activeSessions = sessions.filter((s) => !s.revokedAt && s.expiresAt > now);
- `convex/adminQueries.ts:166` — expiresAt: s.expiresAt,
- `convex/adminQueries.ts:168` — expired: s.expiresAt <= now,
- `convex/auth.ts:47` — otpExpiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes from now
- `convex/auth.ts:136` — if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
- `convex/auth.ts:148` — otpExpiresAt: undefined
- `convex/auth.ts:207` — if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
- `convex/auth.ts:231` — otpExpiresAt: undefined
- … +39 más (ver JSON)

Evidencia en contra / matices:
- ⚠ `convex/events.ts:40` — holdEventCapacity/releaseEventCapacity: 0 call sites fuera de events.ts (ver también src/)

### STK-05 — Dedupe de webhook / idempotencia
confianza: **alta** · hits: 40 · counterHits: 0

- `convex/connect.ts:540` — ...(args.requestId ? { idempotencyKey: `payout:${targetId}:${args.requestId}` } : {}),
- `convex/finance.ts:300` — stripeEventId: v.string(),
- `convex/finance.ts:322` — .query("paymentEvents")
- `convex/finance.ts:323` — .withIndex("by_stripe_event", (q) => q.eq("stripeEventId", args.stripeEventId))
- `convex/finance.ts:327` — return { alreadyProcessed: true, id: existing._id };
- `convex/finance.ts:330` — return { alreadyProcessed: false, id: existing._id, isRetry: true };
- `convex/finance.ts:332` — const id = await ctx.db.insert("paymentEvents", {
- `convex/finance.ts:333` — stripeEventId: args.stripeEventId,
- … +32 más (ver JSON)

### STK-06 — Reposición de stock en refund/cancel
confianza: **alta** · hits: 1 · counterHits: 1

- `convex/stripe.ts:1610` — internalCompleteOrderRefund: await ctx.db.patch(listingId, { stock: listing.stock + item.quantity });

Evidencia en contra / matices:
- ⚠ `convex/stripe.ts:1604` — condicionado: if (full && (order.listingType ?? "product") === "product") {

### STK-07 — Política multi-vendor / shortfall
confianza: **alta** · hits: 9 · counterHits: 0

- `convex/_inventory.ts:75` — export function outOfStockMessage(shortfalls: StockShortfall[]): string {
- `convex/schema.ts:523` — stockShortfall: v.optional(v.array(v.object({
- `convex/stripe.ts:40` — import { decrementStock, hasEnoughStock, outOfStockMessage, shortfallFor } from "./_inventory";
- `convex/stripe.ts:372` — if (built.stockIssues.length > 0) throw new Error(outOfStockMessage(built.stockIssues));
- `convex/stripe.ts:486` — const result = await ctx.runMutation(internal.stripe.internalProcessPaidCheckout, {
- `convex/stripe.ts:621` — return await ctx.runMutation(internal.stripe.internalProcessPaidCheckout, {
- `convex/stripe.ts:647` — export const internalProcessPaidCheckout = internalMutation({
- `convex/stripe.ts:751` — ...(shortfalls.length > 0 ? { stockShortfall: shortfalls } : {}),
- … +1 más (ver JSON)

### STK-08 — Stock por variante
confianza: **baja** · hits: 0 · counterHits: 0


### STK-09 — Stock desnormalizado fuera de listings
confianza: **alta** · hits: 4 · counterHits: 0

- `convex/cart.ts:92` — if (listing && listing.type === 'product' && typeof listing.stock === 'number' && requested > listing.stock) {
- `convex/cart.ts:281` — if (listing && listing.type === 'product' && typeof listing.stock === 'number' && quantity > listing.stock) {
- `convex/orders.ts:242` — if (listing.stock < item.quantity) throw new Error(`Stock insuficiente para: ${item.title}`);
- `convex/orders.ts:246` — stock: listing.stock - item.quantity

### STK-10 — Ledger append-only de stock
confianza: **baja** · hits: 0 · counterHits: 0


### AGD-01 — Escrituras/lecturas a bookings
confianza: **baja** · hits: 0 · counterHits: 1


Evidencia en contra / matices:
- ⚠ `convex/schema.ts:550` — tabla declarada: bookings: defineTable({

### AGD-02 — Lógica de solapamiento de turnos
confianza: **baja** · hits: 0 · counterHits: 0


### AGD-03 — Duración de slot / buffer en uso
confianza: **alta** · hits: 2 · counterHits: 0

- `convex/businessSettings.ts:44` — slotDurationMinutes: args.slotDurationMinutes,
- `convex/businessSettings.ts:54` — slotDurationMinutes: args.slotDurationMinutes,

### AGD-05 — Manejo de zona horaria
confianza: **baja** · hits: 0 · counterHits: 0


### AGD-09 — Máquina de estados de booking
confianza: **baja** · hits: 0 · counterHits: 0


### PAY-01 — Firma del webhook + idempotencia
confianza: **alta** · hits: 3 · counterHits: 0

- `convex/http.ts:62` — const notification = await (stripe as any).parseEventNotificationAsync(body, signature, secret);
- `convex/http.ts:65` — const event = await stripe.webhooks.constructEventAsync(body, signature, secret);
- `convex/http.ts:81` — const signature = request.headers.get("stripe-signature") ?? "";

### PAY-02 — Máquina de estados de escrow/orden aplicada
confianza: **alta** · hits: 3 · counterHits: 0

- `convex/orders.ts:415` — if (!canConfirmReceipt(order.status) || !isReleasable(order.escrowState, !!order.escrowReleaseError)) {
- `convex/stripe.ts:911` — if (!fromDispute && !isReleasable(order.escrowState, !!order.escrowReleaseError)) {
- `convex/stripe.ts:1498` — if (!isRefundable(order.escrowState, !!order.escrowRefundError)) {

### PAY-03 — Refund parcial
confianza: **alta** · hits: 24 · counterHits: 0

- `convex/stripe.ts:1476` — refundCents: number;
- `convex/stripe.ts:1503` — const remaining = grossCents - (order.refundedCents ?? 0);
- `convex/stripe.ts:1504` — if (remaining <= 0) throw new Error("La orden ya fue reembolsada por completo.");
- `convex/stripe.ts:1505` — const refundCents = Math.min(remaining, Math.round(args.amountCents ?? remaining));
- `convex/stripe.ts:1506` — if (refundCents <= 0) throw new Error("El monto a reembolsar debe ser mayor a 0.");
- `convex/stripe.ts:1523` — refundCents,
- `convex/stripe.ts:1558` — refundCents: v.number(),
- `convex/stripe.ts:1591` — const refundedCents = (order.refundedCents ?? 0) + args.refundCents;
- … +16 más (ver JSON)

### PAY-04 — Guard de doble refund
confianza: **alta** · hits: 12 · counterHits: 0

- `convex/stripe.ts:1479` — idemBase: number;
- `convex/stripe.ts:1498` — if (!isRefundable(order.escrowState, !!order.escrowRefundError)) {
- `convex/stripe.ts:1509` — escrowState: "refund_pending",
- `convex/stripe.ts:1510` — escrowPrevState: order.escrowState === "refund_pending" ? order.escrowPrevState : order.escrowState,
- `convex/stripe.ts:1537` — idemBase: order.refundedCents ?? 0,
- `convex/stripe.ts:1592` — const full = refundedCents >= grossCents;
- `convex/stripe.ts:1702` — const enVuelo = order.escrowState === "refund_pending";
- `convex/stripe.ts:1761` — refundId = mockRefundId(String(args.orderId), begin.idemBase);
- … +4 más (ver JSON)

### PAY-05 — Efectos colaterales revertidos en refund
confianza: **alta** · hits: 3 · counterHits: 7

- `convex/stripe.ts:1610` — internalCompleteOrderRefund: patch listings {stock}
- `convex/stripe.ts:1618` — internalCompleteOrderRefund: patch payouts {status,error,updatedAt}
- `convex/stripe.ts:1623` — internalCompleteOrderRefund: patch payouts {reversedCents,stripeReversalIds,status,updatedAt}

Evidencia en contra / matices:
- ⚠ `convex/disputes.ts:14` — mutation createDispute — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/disputes.ts:99` — mutation addDisputeMessage — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/disputes.ts:302` — internalMutation internalApplyDisputeResolution — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/orders.ts:482` — mutation openDispute — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/orders.ts:526` — mutation escalateDispute — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/stripe.ts:1493` — internalMutation internalBeginOrderRefund — refund/dispute mutation que NO toca stock/bono/reserva/payout
- ⚠ `convex/stripe.ts:1689` — internalMutation internalFlagOrderRefundFailed — refund/dispute mutation que NO toca stock/bono/reserva/payout

### PAY-06 — Reversión de transfer / comisión
confianza: **alta** · hits: 8 · counterHits: 0

- `convex/schema.ts:870` — reversedCents: v.optional(v.number()),
- `convex/stripe.ts:1489` — reversedCents: number;
- `convex/stripe.ts:1549` — reversedCents: p.reversedCents ?? 0,
- `convex/stripe.ts:1622` — const reversed = (payout.reversedCents ?? 0) + r.amount;
- `convex/stripe.ts:1624` — reversedCents: reversed,
- `convex/stripe.ts:1787` — sellerReversedCents: sellerPayout?.reversedCents,
- `convex/stripe.ts:1788` — influencerReversedCents: influencerPayout?.reversedCents,
- `convex/stripe.ts:1807` — const rev = await stripe.transfers.createReversal(

### PAY-07 — Ledger contable + reconciliación
confianza: **alta** · hits: 12 · counterHits: 0

- `convex/finance.ts:801` — .query("reconciliationFlags")
- `convex/finance.ts:806` — return await ctx.db.query("reconciliationFlags").order("desc").take(cap);
- `convex/finance.ts:815` — flagId: v.id("reconciliationFlags"),
- `convex/migrations/reconciliationCursorScopeSplit.ts:41` — .query("reconciliationCursor")
- `convex/migrations/reconciliationCursorScopeSplit.ts:50` — .query("reconciliationCursor")
- `convex/migrations/reconciliationCursorScopeSplit.ts:65` — const newRowId = await ctx.db.insert("reconciliationCursor", {
- `convex/reconciliation.ts:44` — .query("reconciliationCursor")
- `convex/reconciliation.ts:62` — .query("reconciliationCursor")
- … +4 más (ver JSON)

### PAY-08 — Disputas / contracargos
confianza: **alta** · hits: 10 · counterHits: 0

- `convex/http.ts:215` — case "charge.dispute.created": {
- `convex/http.ts:219` — await ctx.runMutation(internal.stripe.internalFreezeOrdersForPaymentIntent, {
- `convex/http.ts:227` — case "charge.dispute.closed": {
- `convex/http.ts:231` — await ctx.runAction(internal.stripe.internalResolveStripeDispute, {
- `convex/http.ts:241` — case "charge.dispute.funds_withdrawn":
- `convex/http.ts:242` — case "charge.dispute.funds_reinstated":
- `convex/http.ts:243` — case "charge.dispute.updated":
- `convex/stripe.ts:1896` — export const internalFreezeOrdersForPaymentIntent = internalMutation({
- … +2 más (ver JSON)

### BON-01 — Guard de canje único en redeemBono
confianza: **alta** · hits: 9 · counterHits: 1

- `convex/bonos.ts:272` — if (bono.status === "redeemed") {
- `convex/bonos.ts:275` — if (bono.status === "cancelled") {
- `convex/bonos.ts:383` — const isOpen = bono.status === "issued";
- `convex/bonos.ts:435` — const isOpen = bono.status === "issued";
- `convex/bonos.ts:501` — const isOpen = bono.status === "issued";
- `convex/bonos.ts:584` — (bono.status === "issued" ? eco.creditTotal : 0),
- `convex/bonos.ts:626` — (bono.status === "issued" ? eco.creditTotal : 0),
- `convex/bonos.ts:681` — (bono.status === "issued" ? eco.creditTotal : 0),
- … +1 más (ver JSON)

Evidencia en contra / matices:
- ⚠ `convex/bonos.ts:241` — mutation redeemBono — kind=mutation (mutation ⇒ serializable por OCC) — escribe bonoRedemptions

### BON-04 — Expiración validada server-side
confianza: **alta** · hits: 3 · counterHits: 0

- `convex/bonos.ts:68` — const abs = new Date(listing.validUntil).getTime();
- `convex/bonos.ts:281` — const expiresAt = new Date(bono.validUntil).getTime();
- `convex/bonos.ts:282` — if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {

### BON-05 — Alcance: sólo el sellerId del bono canjea
confianza: **alta** · hits: 5 · counterHits: 0

- `convex/bonos.ts:264` — const isSeller = bono.sellerId === actor.idString;
- `convex/bonos.ts:266` — if (!isSeller && !isAdmin) {
- `convex/bonos.ts:375` — const sellerNormId = ctx.db.normalizeId("users", bono.sellerId);
- `convex/bonos.ts:429` — const sellerNormId = ctx.db.normalizeId("users", bono.sellerId);
- `convex/bonos.ts:488` — if (opts?.sellerIdFilter && bono.sellerId !== opts.sellerIdFilter) continue;

### BON-07 — Bono tocado en refund/dispute
confianza: **baja** · hits: 0 · counterHits: 1


Evidencia en contra / matices:
- ⚠ `convex/bonos.ts:275` — estado 'cancelled' leído acá; escritores: 3

### BON-09 — Código único / no adivinable / rate limit
confianza: **alta** · hits: 8 · counterHits: 0

- `convex/bonos.ts:48` — const generateBonoCode = (): string => {
- `convex/bonos.ts:50` — const rand = Math.random().toString(36).slice(2, 8);
- `convex/bonos.ts:51` — const rand2 = Math.random().toString(36).slice(2, 6);
- `convex/bonos.ts:135` — const code = generateBonoCode();
- `convex/bonos.ts:203` — const code = generateBonoCode();
- `convex/bonos.ts:257` — .withIndex("by_code", (q) => q.eq("bonoCode", code))
- `convex/bonos.ts:659` — .withIndex("by_code", (q) => q.eq("bonoCode", code))
- `convex/bonos.ts:765` — const rand = Math.random().toString(36).slice(2, 6);

### BON-10 — Nominativo: ownerUserId verificado al canjear
confianza: **baja** · hits: 0 · counterHits: 0


### TRV-01 — Mutation/action pública sin requireActor
confianza: **media** · hits: 106 · counterHits: 0

- `convex/auth.ts:53` — action sendVerificationEmail — escribe: runMutation:users.internalCheckRateLimit,runMutation:auth.saveOtp,runAction:notifications.sendOTP
- `convex/auth.ts:161` — action sendPasswordResetEmail — escribe: runMutation:users.internalCheckRateLimit,runMutation:auth.saveOtp,runAction:notifications.sendOTP
- `convex/auth.ts:185` — mutation resetPasswordWithCode — escribe: users
- `convex/connect.ts:219` — action ensureConnectAccount — escribe: runMutation:connect.internalSaveConnectAccount
- `convex/connect.ts:285` — action createOnboardingLink — escribe: —
- `convex/connect.ts:330` — action getAccountStatus — escribe: runMutation:connect.internalSaveConnectFlags
- `convex/connect.ts:378` — action getConnectBalance — escribe: —
- `convex/connect.ts:427` — action getPayoutSchedule — escribe: —
- … +98 más (ver JSON)

### TRV-02 — Tests de concurrencia (Promise.all en __tests__)
confianza: **baja** · hits: 0 · counterHits: 0


### TRV-03 — Precio recalculado server-side
confianza: **alta** · hits: 2 · counterHits: 2

- `convex/stripe.ts:207` — unitCents: number;
- `convex/stripe.ts:255` — unitCents: Math.round(Number(listing.price || 0) * 100),

Evidencia en contra / matices:
- ⚠ `convex/orders.ts:260` — total: args.total,
- ⚠ `convex/orders.ts:278` — body: `Pedido #${shortOrderId} por $${args.total.toFixed(2)} ${args.currency}`,

### TRV-04 — Observabilidad (flags, audit_logs, console.error de invariantes)
confianza: **alta** · hits: 12 · counterHits: 0

- `convex/_roles.ts:53` — | 'view_audit_logs'
- `convex/_roles.ts:75` — 'view_audit_logs',
- `convex/adminQueries.ts:93` — assertAdmin(actor, "view_audit_logs");
- `convex/adminQueries.ts:95` — return await ctx.db.query("audit_logs").order("desc").take(cap);
- `convex/adminQueries.ts:453` — await ctx.db.insert("audit_logs", {
- `convex/bonos.ts:115` — `[Bonos] ${existing.length} already issued for payment ${args.paymentId}; skipping`,
- `convex/connect.ts:157` — await ctx.db.insert("audit_logs", {
- `convex/connect.ts:651` — await ctx.db.insert("audit_logs", {
- … +4 más (ver JSON)

## Límites transaccionales que tocan tablas de dinero

| handler | kind | pública | requireActor | escribe | await-gap |
|---|---|---|---|---|---|
| `convex/admin.ts:4` wipeAndSeedBonos | internalMutation | — | — | bonoRedemptions, listings | — |
| `convex/bonos.ts:82` internalIssueBonosForPayment | internalMutation | — | — | bonoRedemptions | — |
| `convex/bonos.ts:169` internalIssueBonosForOrder | internalMutation | — | — | bonoRedemptions | — |
| `convex/bonos.ts:241` redeemBono | mutation | sí | ✔ | bonoRedemptions | — |
| `convex/bonos.ts:693` seedMockBonos | mutation | sí | **NO** | listings, bonoRedemptions | — |
| `convex/businessForms.ts:82` submitLead | mutation | sí | ✔ | businessFormLeads | — |
| `convex/businessForms.ts:210` cancelLead | mutation | sí | ✔ | orders | — |
| `convex/campaigns.ts:111` proposeCampaign | mutation | sí | ✔ | influencerCampaigns | — |
| `convex/campaigns.ts:177` inviteInfluencer | mutation | sí | ✔ | influencerCampaigns | — |
| `convex/campaigns.ts:245` respondToCampaign | mutation | sí | ✔ | orders | — |
| `convex/campaigns.ts:300` pauseCampaign | mutation | sí | ✔ | orders | — |
| `convex/campaigns.ts:346` resumeCampaign | mutation | sí | ✔ | orders | — |
| `convex/campaigns.ts:379` endCampaign | mutation | sí | ✔ | orders | — |
| `convex/campaigns.ts:746` seedBusinessInviteInfluencer1 | mutation | sí | **NO** | ?, orders, influencerCampaigns | ⚠ findExistingPair |
| `convex/cart.ts:258` updateCartQuantity | mutation | sí | ✔ | cart | — |
| `convex/cart.ts:293` removeFromCart | mutation | sí | ✔ | cart | — |
| `convex/commerce.ts:394` internalRecordSocialSalesForOrder | internalMutation | — | — | socialPostSales | — |
| `convex/developer.ts:163` resetAndSeedListings | internalMutation | — | — | listings | — |
| `convex/developer.ts:279` seed5Bonos | mutation | sí | **NO** | listings, bonoRedemptions | — |
| `convex/disputes.ts:14` createDispute | mutation | sí | ✔ | orders, disputeMessages | — |
| `convex/disputes.ts:302` internalApplyDisputeResolution | internalMutation | — | — | orders, disputeMessages, audit_logs | — |
| `convex/events.ts:40` holdEventCapacity | mutation | sí | ✔ | listings | — |
| `convex/events.ts:81` releaseEventCapacity | mutation | sí | ✔ | listings | — |
| `convex/events.ts:102` internalIssueEventReservationsForPayment | internalMutation | — | — | eventReservations | — |
| `convex/events.ts:173` checkInReservation | mutation | sí | ✔ | orders | — |
| `convex/favorites.ts:8` addFavorite | mutation | sí | ✔ | favorites, listings | — |
| `convex/favorites.ts:57` removeFavorite | mutation | sí | ✔ | ?, listings | — |
| `convex/finance.ts:147` createPaymentRecord | internalMutation | — | — | payments | — |
| `convex/finance.ts:197` updatePaymentStatus | internalMutation | — | — | payments | — |
| `convex/finance.ts:220` updatePaymentByIntentId | internalMutation | — | — | payments | — |
| `convex/finance.ts:372` createPayout | internalMutation | — | — | payouts | — |
| `convex/finance.ts:393` updatePayoutStatus | internalMutation | — | — | payouts | — |
| `convex/finance.ts:454` createWithdrawal | mutation | sí | ✔ | ?, withdrawals, audit_logs | — |
| `convex/finance.ts:572` updateWithdrawalStatus | internalMutation | — | — | ?, orders | — |
| `convex/finance.ts:811` updateReconciliationFlag | mutation | sí | ✔ | orders, audit_logs | — |
| `convex/iap.ts:23` internalUpsertIapReceipt | internalMutation | — | — | orders, iapReceipts, users | — |
| `convex/influencers.ts:13` addToWhitelist | mutation | sí | ✔ | orders, influencerWhitelists | — |
| `convex/influencers.ts:61` removeFromWhitelist | mutation | sí | ✔ | orders | — |
| `convex/listings.ts:261` createListing | mutation | sí | ✔ | listings | — |
| `convex/listings.ts:513` purchaseItem | mutation | sí | ✔ | listings, orders | — |
| `convex/listings.ts:785` recordView | mutation | sí | **NO** | listingViews, listings | — |
| `convex/notifications.ts:284` internalRecordPushDelivery | internalMutation | — | — | pushDeliveries | — |
| `convex/orders.ts:191` createOrder | mutation | sí | ✔ | listings, orders | — |
| `convex/orders.ts:293` internalUpdateOrderStatus | internalMutation | — | — | orders | — |
| `convex/orders.ts:309` markAsShipped | mutation | sí | ✔ | orders | — |
| `convex/orders.ts:360` markAsDelivered | mutation | sí | ✔ | orders | — |
| `convex/orders.ts:400` confirmReceipt | mutation | sí | ✔ | orders | — |
| `convex/orders.ts:442` cancelOrder | mutation | sí | ✔ | orders | — |
| `convex/orders.ts:482` openDispute | mutation | sí | ✔ | orders | — |
| `convex/orders.ts:526` escalateDispute | mutation | sí | ✔ | orders, audit_logs | — |
| `convex/reconciliation.ts:124` internalCreateFlag | internalMutation | — | — | reconciliationFlags | — |
| `convex/seed.ts:5` seedE2E | internalMutation | — | — | users, listings, orders | — |
| `convex/seedDemoCatalog.ts:138` seedVerifiedDemo | internalMutation | — | — | ?, users, listings | — |
| `convex/seedListings.ts:4` run | internalMutation | — | — | listings | — |
| `convex/seedMarketplace.ts:3` seed | internalMutation | — | — | listings | — |
| `convex/social.ts:2008` addComment | mutation | sí | **NO** | socialComments, ?, socialReports | ⚠ bumpAuthorAffinity |
| `convex/social/communities.ts:125` createCommunity | mutation | sí | **NO** | commercialCommunities, communityMembers | — |
| `convex/social/communities.ts:494` joinCommunity | mutation | sí | **NO** | orders, communityMembers, communityJoinRequests | ⚠ awardSocialAction |
| `convex/social/communities.ts:582` approveMember | mutation | sí | **NO** | orders | — |
| `convex/social/communities.ts:613` rejectMember | mutation | sí | **NO** | orders | — |
| `convex/social/communities.ts:631` leaveCommunity | mutation | sí | **NO** | orders | — |
| `convex/social/communities.ts:651` removeMember | mutation | sí | **NO** | orders | — |
| `convex/social/communityAccess.ts:276` acceptInvite | mutation | sí | **NO** | orders, communityMembers, ?, communityInviteRedemptions | ⚠ loadMembership |
| `convex/social/communityAccess.ts:571` submitJoinRequest | mutation | sí | **NO** | orders, communityMembers | — |
| `convex/social/communityAccess.ts:692` decideJoinRequest | mutation | sí | **NO** | orders, communityMembers | ⚠ requireCommunityAdmin |
| `convex/social/communityAccess.ts:749` withdrawJoinRequest | mutation | sí | **NO** | orders | ⚠ loadMembership |
| `convex/social/drafts.ts:33` saveDraft | mutation | sí | **NO** | socialPostDrafts | — |
| `convex/social/eventMatching.ts:159` swipe | mutation | sí | **NO** | orders, eventMatches, →social.dm.getOrCreateDirectChat | — |
| `convex/social/eventMatching.ts:289` unmatch | mutation | sí | **NO** | orders | — |
| `convex/social/moderation.ts:39` reportContent | mutation | sí | **NO** | socialReports, ? | — |
| `convex/social/moderation.ts:365` adminResolveReport | mutation | sí | ✔ | moderationActions, orders | ⚠ applyModerationAction |
| `convex/stripe.ts:647` internalProcessPaidCheckout | internalMutation | — | — | ?, payments, listings, orders, →commerce.internalRecordSocialSalesForOrder, →cart.internal | ⚠ awardPoints |
| `convex/stripe.ts:857` internalMarkPaymentSucceeded | internalMutation | — | — | payments, →economy.internalAwardPurchasePoints | — |
| `convex/stripe.ts:903` internalBeginEscrowRelease | internalMutation | — | — | orders, payouts | — |
| `convex/stripe.ts:994` internalCompleteEscrowRelease | internalMutation | — | — | orders, payouts, payments, audit_logs | — |
| `convex/stripe.ts:1097` internalFlagEscrowReleaseFailed | internalMutation | — | — | orders, payouts | — |
| `convex/stripe.ts:1296` internalClaimScheduledPayout | internalMutation | — | — | payouts | — |
| `convex/stripe.ts:1389` internalFinishInfluencerPayout | internalMutation | — | — | payouts | — |
| `convex/stripe.ts:1493` internalBeginOrderRefund | internalMutation | — | — | orders | — |
| `convex/stripe.ts:1555` internalCompleteOrderRefund | internalMutation | — | — | orders, listings, payouts, payments, audit_logs | ⚠ awardPoints |
| `convex/stripe.ts:1689` internalFlagOrderRefundFailed | internalMutation | — | — | orders | — |
| `convex/stripe.ts:1896` internalFreezeOrdersForPaymentIntent | internalMutation | — | — | orders, payments | — |
| `convex/stripe.ts:1930` internalUnfreezeOrdersForPaymentIntent | internalMutation | — | — | orders, payments | — |
| `convex/subscriptions.ts:78` internalUpsertSubscription | internalMutation | — | — | orders, stripeSubscriptions, users | — |

## Webhooks

| path | firma | idempotencia | eventos |
|---|---|---|---|
| /stripe-webhook (`convex/http.ts:327`) | ✔ | ✔ | account.updated, charge.dispute.closed, charge.dispute.created, charge.dispute.funds_reinstated, charge.dispute.funds_withdrawn, charge.dispute.updated, charge.refunded, checkout.session.completed, customer.subscription.created, customer.subscription.deleted, customer.subscription.updated, invoice.payment_failed |
| /stripe-webhook-test (`convex/http.ts:328`) | ✔ | ✔ | account.updated, charge.dispute.closed, charge.dispute.created, charge.dispute.funds_reinstated, charge.dispute.funds_withdrawn, charge.dispute.updated, charge.refunded, checkout.session.completed, customer.subscription.created, customer.subscription.deleted, customer.subscription.updated, invoice.payment_failed |

## Jobs programados

- check-influencer-metrics (cron "0 0 * * *") → users.checkInfluencerMetrics — `convex/crons.ts:16`
- events-auto-release (cron "0 4 * * *") → events.internalAutoReleaseEvents — `convex/crons.ts:18`
- services-auto-release (cron "30 4 * * *") → events.internalAutoReleaseServices — `convex/crons.ts:20`
- marketplace-auto-release (cron "30 5 * * *") → stripe.internalCronAutoReleaseEscrows — `convex/crons.ts:22`
- influencer-due-payouts (cron "15 6 * * *") → stripe.internalPayDueInfluencerPayouts — `convex/crons.ts:24`
- stripe-bt-reconciliation (cron "0 7 * * *") → reconciliation.internalReconcileStripeBalanceTransactions — `convex/crons.ts:26`
- expire-stories (interval { hours: 1 }) → social.internalExpireStories — `convex/crons.ts:33`
- dm-sweep-ephemeral (interval { minutes: 15 }) → social.dm.cleanupEphemeral — `convex/crons.ts:35`
- expire-social-suspensions (cron "0 3 * * *") → social.moderation.internalExpireSuspensions — `convex/crons.ts:37`
- recompute-tag-stats (interval { hours: 1 }) → social.hashtags.internalRecomputeTagStats — `convex/crons.ts:39`
- publish-scheduled-posts (interval { minutes: 5 }) → social.drafts.internalPublishDueScheduled — `convex/crons.ts:41`
- cleanup-event-matching (cron "45 4 * * *") → social.eventMatching.internalCleanupStaleMatching — `convex/crons.ts:43`
- loops-tiering (interval { hours: 2 }) → social.loopsTiering.internalGradeLoopsTier — `convex/crons.ts:45`

## Máquinas de estado

- **orders.status** `convex/orders/_orderStates.ts:1`: pending · payment_received · paid_escrow · awaiting_shipment · in_transit · delivered · completed · disputed · cancelled — guards usados fuera del módulo: isPaid×1, isTerminal×0, canMarkShipped×1, canMarkDelivered×1, canConfirmReceipt×2, canOpenDispute×0 → enforced=true
- **orders.escrowState** `convex/orders/_escrowStates.ts:1`: held · release_pending · released · refund_pending · refunded · disputed · frozen · buyer_confirm · admin_force · dispute_seller · auto_release · bono_redeemed · event_auto · service_auto · cancel · dispute_buyer · admin · stripe_refund · stripe_dispute_lost · product — guards usados fuera del módulo: isEscrowState×0, canTransition×0, releaseDueAtFor×1, influencerPayoutDueAt×1, retryPayoutAtMs×2, isReleasable×2, isRefundable×1 → enforced=true

## Tests

total: 18 · por área: {"stock":1,"agenda":0,"pagos":13,"bonos":6} · **tests de concurrencia: 0**

## Gaps (señales sin hits)

- STK-08 — sin coincidencias en convex/
- STK-10 — sin coincidencias en convex/
- AGD-01 — sin coincidencias en convex/ (counterHits: 1)
- AGD-02 — sin coincidencias en convex/
- AGD-05 — sin coincidencias en convex/
- AGD-09 — sin coincidencias en convex/
- BON-07 — sin coincidencias en convex/ (counterHits: 1)
- BON-10 — sin coincidencias en convex/
- TRV-02 — sin coincidencias en convex/
