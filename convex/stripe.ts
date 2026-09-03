// ---------------------------------------------------------------------------
// PAGOS — Stripe Connect con Separate Charges & Transfers (SCT).
//
// Modelo:
//   1. El comprador paga a la cuenta PLATAFORMA (PaymentIntent V1, sin
//      transfer_data). La plata queda retenida ("escrow") en nuestro balance.
//   2. El webhook `payment_intent.succeeded` crea UNA orden por vendedor a
//      partir del snapshot congelado al crear el PI (nunca del carrito vivo).
//   3. Al liberar (comprador confirma / admin / cron / disputa a favor del
//      vendedor) se hace UN `transfers.create` al vendedor con
//      `source_transaction` (el charge) y clave de idempotencia.
//   4. El influencer cobra 10 días después de liberada la orden (ventana de
//      clawback), con un transfer por orden y su propia clave.
//   5. Reembolsos: `refunds.create` sobre el PI por el monto de ESA orden;
//      si ya se transfirió, `transfers.createReversal` proporcional.
//
// Bi-modal: el toggle test/live del app se respeta de punta a punta. El
// modo se persiste en `payments.mode` / `orders.mode` / `payouts.mode` y
// TODAS las llamadas posteriores usan `getStripe(order.mode)`.
//
// Simulación (`simulate: true`) sólo existe si `ALLOW_STRIPE_MOCK=true` en
// Convex. Un pago real NUNCA se marca liberado con un transfer ficticio: si
// Stripe rechaza el transfer, la orden vuelve a `held` con el error visible.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import type Stripe from "stripe";
import {
    action,
    internalAction,
    internalMutation,
    internalQuery,
    query,
    type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getActorOrNull, requireActor } from "./authHelpers";
import { canUseTestMode, publicStripeModes, TEST_MODE_DENIED_MESSAGE } from "./_paymentModeAccess";
import { classifyPayoutClaim, shouldRetryRelease } from "./_payoutRetry";
import { decrementStock, hasEnoughStock, outOfStockMessage, shortfallFor } from "./_inventory";
import { can, denialMessage } from "./_roles";
import { buildAuditRecord } from "./_audit";
import { stripeFeeCentsFor } from "./_fees";
import {
    allocateExternalRefund,
    computeCheckoutSplit,
    DiscountExceedsCommissionError,
    reapplyActualFee,
    reversalAmountsFor,
    type CheckoutSplit,
} from "./_split";
import {
    isMockPaymentIntentId,
    mockPaymentIntentId,
    mockRefundId,
    mockReversalId,
    mockTransferId,
    type StripeMode,
} from "./_stripeEnv";
import {
    assertMockAllowed,
    assertStripeConfigured,
    getStripe,
    hasStripeKey,
    isMockAllowed,
    stripeEnv,
} from "./stripeClient";
import {
    influencerPayoutDueAt,
    INFLUENCER_PAYOUT_MAX_ATTEMPTS,
    RELEASE_MAX_ATTEMPTS,
    retryPayoutAtMs,
    isRefundable,
    isReleasable,
    releaseDueAtFor,
} from "./orders/_escrowStates";
import { canConfirmReceipt } from "./orders/_orderStates";
import { resolveLineAttribution } from "./campaigns";
import { shippingValidator, stripeModeValidator } from "./schema";
import { withStripeBreadcrumb } from "./observability";
import { POINT_VALUE_USD } from "./economy/_rewardRules";
import { hydrateRewardsState } from "./economy/pointsState";
import { awardPoints } from "./economy/pointsEngine";

/** Centavos por punto (POINT_VALUE_USD está en dólares). */
const CENTS_PER_POINT = POINT_VALUE_USD * 100;
/** Pagos 100% con puntos (sin cargo en Stripe). */
const POINTS_PI_PREFIX = "pts_";
const isPointsOnlyPaymentId = (id?: string | null) => !!id && id.startsWith(POINTS_PI_PREFIX);

const nowIso = () => new Date().toISOString();

const releaseTriggerValidator = v.union(
    v.literal("buyer_confirm"),
    v.literal("admin_force"),
    v.literal("dispute_seller"),
    v.literal("auto_release"),
    v.literal("bono_redeemed"),
    v.literal("event_auto"),
    v.literal("service_auto"),
);

const refundSourceValidator = v.union(
    v.literal("cancel"),
    v.literal("dispute_buyer"),
    v.literal("admin"),
    v.literal("stripe_refund"),
    v.literal("stripe_dispute_lost"),
);

/** Cuenta Connect del usuario para el modo dado. */
const connectAccountFor = (user: Doc<"users"> | null | undefined, mode: StripeMode): string | null => {
    if (!user) return null;
    const id = mode === "live" ? user.stripeConnectAccountId : user.stripeConnectAccountIdTest;
    return id ?? null;
};

const stripeErrorMessage = (error: any): string =>
    String(error?.raw?.message || error?.message || error || "Error de Stripe");

// ===========================================================================
// Config pública (el cliente decide qué modos mostrar en el toggle)
// ===========================================================================
/**
 * Qué modos de Stripe se le ofrecen a QUIEN pregunta.
 *
 * `sessionToken` es **opcional a propósito**: los clientes ya publicados la
 * llaman con `{}`, y volverlo obligatorio los dejaría inutilizables por error
 * de validación de argumentos. La forma de la respuesta tampoco cambia, que es
 * lo único que esos clientes leen.
 */
export const getPublicConfig = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (
        ctx,
        args,
    ): Promise<{ modes: { test: boolean; live: boolean }; mockAllowed: boolean }> => {
        const env = stripeEnv();
        const actor = await getActorOrNull(ctx, args.sessionToken);
        return {
            modes: publicStripeModes(env.keys, actor),
            mockAllowed: env.mockAllowed,
        };
    },
});

// ===========================================================================
// CHECKOUT
// ===========================================================================

type StockIssue = { listingId: string; title: string; requested: number; available: number };

/**
 * Construye el checkout DESDE LA BASE: precio, vendedor, tipo, stock y
 * atribución de influencer salen de `listings`/`cart`/campañas, nunca del
 * cliente. Devuelve el split congelado que después usa el webhook.
 */
export const internalBuildCheckout = internalQuery({
    args: {
        userId: v.string(),
        lineItems: v.array(
            v.object({
                listingId: v.string(),
                quantity: v.number(),
                referralCode: v.optional(v.string()),
            }),
        ),
        shippingCents: v.number(),
        pointsToRedeem: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        snapshot: CheckoutSplit;
        totalCents: number;
        hasBono: boolean;
        attributionRejectedReason: string | null;
        stockIssues: StockIssue[];
    }> => {
        const stockIssues: StockIssue[] = [];

        // Puntos: se validan contra el saldo real y se convierten a centavos.
        let pointsRedeemed = 0;
        let discountCents = 0;
        if (args.pointsToRedeem && args.pointsToRedeem > 0) {
            const state = await ctx.db
                .query("economyState")
                .withIndex("by_user", (q) => q.eq("userId", args.userId))
                .first();
            const balance = state ? hydrateRewardsState(state.rewardsState).points || 0 : 0;
            const wanted = Math.floor(args.pointsToRedeem);
            if (wanted > balance) throw new Error(`No tenés suficientes puntos (saldo: ${balance}).`);
            discountCents = Math.floor(wanted * CENTS_PER_POINT);
            pointsRedeemed = Math.round(discountCents / CENTS_PER_POINT);
        }
        const cartRows = await ctx.db
            .query("cart")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        const cartByListing = new Map(cartRows.map((r) => [String(r.listingId), r]));

        type PendingLine = {
            listingId: string;
            sellerId: string;
            type: string;
            unitCents: number;
            quantity: number;
            title: string;
            image?: string;
            sourcePostId?: string;
            referralCode?: string;
            influencerId?: string;
            influencerRate?: number;
        };
        const lines: PendingLine[] = [];
        const influencerIds = new Set<string>();
        let hasBono = false;

        for (const item of args.lineItems) {
            const listingId = ctx.db.normalizeId("listings", item.listingId);
            if (!listingId) throw new Error(`Producto inválido: ${item.listingId}`);
            const listing: any = await ctx.db.get(listingId);
            if (!listing) throw new Error(`Producto no encontrado: ${item.listingId}`);
            if (listing.status && listing.status !== "active") {
                throw new Error(`"${listing.title}" ya no está disponible.`);
            }
            const quantity = Math.max(1, Math.floor(item.quantity));
            const title = listing.title || "Producto";
            const type = String(listing.type || "product").toLowerCase();
            if (type === "bono") hasBono = true;

            if (typeof listing.stock === "number" && !hasEnoughStock(listing.stock, quantity)) {
                stockIssues.push({ listingId: item.listingId, title, requested: quantity, available: listing.stock });
            }

            const cartRow: any = cartByListing.get(item.listingId);
            const referralCode = item.referralCode ?? cartRow?.snapshot?.referralCode ?? undefined;
            const attribution = referralCode
                ? await resolveLineAttribution(ctx, {
                      listingId: item.listingId,
                      sellerId: String(listing.sellerId),
                      referralCode,
                  })
                : null;
            if (attribution?.influencerId) influencerIds.add(attribution.influencerId);

            const rawImage =
                cartRow?.snapshot?.image || listing.image || listing.gallery?.[0] || listing.images?.[0]?.url;

            lines.push({
                listingId: item.listingId,
                sellerId: String(listing.sellerId),
                type,
                unitCents: Math.round(Number(listing.price || 0) * 100),
                quantity,
                title,
                image: rawImage ? String(rawImage) : undefined,
                sourcePostId: cartRow?.snapshot?.sourcePostId ? String(cartRow.snapshot.sourcePostId) : undefined,
                referralCode,
                influencerId: attribution?.influencerId,
                influencerRate: attribution?.rate,
            });
        }

        // Regla vigente: si más de un influencer gana en el mismo checkout,
        // no se acredita a ninguno (split multi-influencer pendiente).
        let attributionRejectedReason: string | null = null;
        if (influencerIds.size > 1) {
            attributionRejectedReason = "mixed_influencers_in_checkout";
            for (const l of lines) {
                l.influencerId = undefined;
                l.influencerRate = 0;
            }
        }

        const provisional =
            lines.reduce((a, l) => a + l.unitCents * l.quantity, 0) + Math.round(args.shippingCents) - discountCents;
        let snapshot: CheckoutSplit;
        try {
            snapshot = computeCheckoutSplit({
                lines,
                shippingCents: args.shippingCents,
                feeCents: provisional > 0 ? stripeFeeCentsFor(provisional) : 0,
                discountCents,
                pointsRedeemed,
            });
        } catch (error: any) {
            if (error instanceof DiscountExceedsCommissionError) {
                const maxPoints = Math.floor(error.maxDiscountCents / CENTS_PER_POINT);
                throw new Error(`Podés usar hasta ${maxPoints} puntos en esta compra.`);
            }
            throw error;
        }

        return {
            snapshot,
            totalCents: snapshot.totalCents,
            hasBono,
            attributionRejectedReason,
            stockIssues,
        };
    },
});

/**
 * Crea el PaymentIntent y persiste el registro de pago con el snapshot.
 *
 * El cliente sólo manda QUÉ compra (listingId + cantidad + ref) y el total
 * que espera ver; todo el dinero se calcula en el servidor.
 */
export const createPaymentIntent = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        cartId: v.string(),
        lineItems: v.array(
            v.object({
                listingId: v.string(),
                quantity: v.number(),
                referralCode: v.optional(v.string()),
            }),
        ),
        expectedTotalCents: v.number(),
        pointsToRedeem: v.optional(v.number()),
        shipping: v.optional(shippingValidator),
        simulate: v.optional(v.boolean()),
        tokenId: v.optional(v.string()),
        cardholderName: v.optional(v.string()),
        documentNumber: v.optional(v.string()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        clientSecret: string | null;
        paymentIntentId: string;
        status: string;
        isMock: boolean;
        mode: StripeMode;
        pointsAwarded: number;
    }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const userId = actor.idString;
        const mode = args.mode;

        /**
         * El modo llega COMO ARGUMENTO DEL CLIENTE, así que acá se autoriza:
         * el toggle de `PaymentModeToggle` es sólo de UI y un cliente
         * modificado puede pedir `test` igual. Y cobrar en test no es
         * inofensivo — el webhook de test crea la orden real, descuenta
         * stock, otorga puntos y deja al vendedor con un cobro pendiente que
         * nadie va a poder pagar. Sólo admin/developer o cuentas de prueba.
         */
        if (mode === "test" && !canUseTestMode(actor)) {
            throw new Error(TEST_MODE_DENIED_MESSAGE);
        }

        const useMock = !!args.simulate;
        if (useMock) assertMockAllowed();
        if (args.lineItems.length === 0) throw new Error("El carrito está vacío.");

        const shippingCents = Math.max(0, Math.round(Number(args.shipping?.cost || 0) * 100));
        const built = await ctx.runQuery(internal.stripe.internalBuildCheckout, {
            userId,
            lineItems: args.lineItems,
            shippingCents,
            pointsToRedeem: args.pointsToRedeem,
        });
        if (built.stockIssues.length > 0) throw new Error(outOfStockMessage(built.stockIssues));
        if (built.totalCents < 0) throw new Error("El monto debe ser mayor a 0");
        if (built.totalCents !== Math.round(args.expectedTotalCents)) {
            throw new Error("El precio cambió. Actualizá el carrito y volvé a intentar.");
        }
        // 100% con puntos: no hay cargo en Stripe; el pedido se procesa ya.
        const pointsOnly = built.totalCents === 0;
        if (!useMock && !pointsOnly) assertStripeConfigured(mode);
        if (!pointsOnly && built.totalCents < 50) {
            throw new Error("El monto mínimo a cobrar con tarjeta es US$ 0,50.");
        }

        const { snapshot } = built;
        const totalCents = snapshot.totalCents;
        const commissionCents = snapshot.sellers.reduce((a, s) => a + s.commissionCents, 0);
        const influencerCents = snapshot.sellers.reduce((a, s) => a + s.influencerCents, 0);
        const sellerNetCents = snapshot.sellers.reduce((a, s) => a + s.sellerNetCents, 0);
        const influencerId = snapshot.sellers.find((s) => s.influencerId)?.influencerId;
        const influencerRate = snapshot.lineItems.reduce((m, l) => Math.max(m, l.influencerRate), 0);
        const commissionRate = totalCents > 0 ? commissionCents / totalCents : 0;

        let paymentIntentId: string;
        let clientSecret: string | null;
        let status: string;

        if (pointsOnly) {
            paymentIntentId = `${POINTS_PI_PREFIX}${userId}_${args.cartId}`;
            clientSecret = null;
            status = "succeeded";
        } else if (useMock) {
            paymentIntentId = mockPaymentIntentId(args.cartId);
            clientSecret = `mock_secret_${paymentIntentId}`;
            status = "succeeded";
        } else {
            const stripe = getStripe(mode);
            const user = await ctx.runQuery(internal.users.internalGetUserById, { id: userId });
            const customerId = customerIdFor(user, mode);

            const metadata: Record<string, string> = {
                userId,
                cartId: args.cartId,
                mode,
                lineItemsCount: String(args.lineItems.length),
                billingMarket: "US-NY",
            };
            if (built.attributionRejectedReason) metadata.attributionRejectedReason = built.attributionRejectedReason;
            if (args.cardholderName) metadata.cardholderName = args.cardholderName.trim().slice(0, 120);
            if (args.documentNumber) metadata.documentNumber = args.documentNumber.replace(/\D/g, "").slice(0, 20);
            if (args.metadata && typeof args.metadata === "object") {
                for (const [k, val] of Object.entries(args.metadata as Record<string, unknown>)) {
                    if (val == null || k in metadata) continue;
                    metadata[k] = String(val).slice(0, 500);
                }
            }

            const params: Stripe.PaymentIntentCreateParams = {
                amount: totalCents,
                currency: "usd",
                customer: customerId,
                payment_method_types: ["card"],
                // SCT: el charge entra al grupo del carrito; los transfers
                // posteriores referencian el mismo `transfer_group`.
                transfer_group: args.cartId,
                metadata,
            };
            if (args.tokenId) {
                const pm = await stripe.paymentMethods.create({ type: "card", card: { token: args.tokenId } });
                params.payment_method = pm.id;
                params.confirm = true;
            }

            try {
                const pi = await withStripeBreadcrumb(
                    { api: "paymentIntents.create", userId, cartId: args.cartId, mode },
                    () => stripe.paymentIntents.create(params, { idempotencyKey: `pi:${userId}:${args.cartId}` }),
                );
                paymentIntentId = pi.id;
                clientSecret = pi.client_secret;
                status = pi.status;
            } catch (error: any) {
                console.error("[Stripe] paymentIntents.create failed:", error);
                throw new Error(`Error al procesar el pago: ${stripeErrorMessage(error)}`);
            }
        }

        await ctx.runMutation(internal.finance.createPaymentRecord, {
            userId,
            stripePaymentIntentId: paymentIntentId,
            status: status === "succeeded" ? "succeeded_in_escrow" : "pending",
            provider: pointsOnly ? "points" : "stripe",
            amount: totalCents / 100,
            providerFee: snapshot.feeCents / 100,
            sellerNet: sellerNetCents / 100,
            ramgosCommission: commissionCents / 100,
            influencerAmount: influencerCents / 100,
            influencerId,
            commissionRate,
            influencerRate,
            description: args.description || snapshot.lineItems[0]?.title || "Pago Ramgos",
            mode,
            cartId: args.cartId,
            amountCents: totalCents,
            commissionCents,
            influencerCents,
            providerFeeEstimatedCents: snapshot.feeCents,
            sellerNetCents,
            attributionRejectedReason: built.attributionRejectedReason ?? undefined,
            shipping: args.shipping,
            checkoutSnapshot: snapshot,
        });

        let pointsAwarded = 0;
        if (useMock || pointsOnly) {
            // No llega webhook: procesamos el checkout ahora mismo.
            const result = await ctx.runMutation(internal.stripe.internalProcessPaidCheckout, {
                stripePaymentIntentId: paymentIntentId,
                mode,
            });
            pointsAwarded = result.pointsAwarded;
        }

        return { clientSecret, paymentIntentId, status, isMock: useMock, mode, pointsAwarded };
    },
});

// ===========================================================================
// MÉTODOS DE PAGO GUARDADOS (customer por modo)
// ===========================================================================

const customerIdFor = (user: any, mode: StripeMode): string | undefined =>
    (mode === "live" ? user?.stripeCustomerIdLive : user?.stripeCustomerIdTest) ||
    user?.stripeCustomerId ||
    undefined;

export const listPaymentMethods = action({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
        mode: stripeModeValidator,
    },
    handler: async (ctx, args): Promise<Stripe.PaymentMethod[]> => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (!hasStripeKey(args.mode)) return [];
        const stripe = getStripe(args.mode);
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: actor.idString });
        const customerId = customerIdFor(user, args.mode);
        if (!customerId) return [];
        try {
            const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
            return list.data;
        } catch (error: any) {
            const msg = stripeErrorMessage(error);
            if (msg.includes("similar object exists in") || msg.includes("No such customer")) return [];
            throw new Error(`Error al listar métodos de pago: ${msg}`);
        }
    },
});

export const createSetupIntent = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
    },
    handler: async (ctx, args): Promise<{ clientSecret: string | null; isMock: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const userId = actor.idString;
        assertStripeConfigured(args.mode);
        const stripe = getStripe(args.mode);
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: userId });
        let customerId = customerIdFor(user, args.mode);
        if (!customerId) {
            const customer = await stripe.customers.create({ metadata: { userId, mode: args.mode } });
            customerId = customer.id;
            await ctx.runMutation(internal.users.updateUserStripeCustomerId, {
                userId,
                stripeCustomerId: customerId,
                mode: args.mode,
            });
        }
        try {
            const si = await stripe.setupIntents.create({ customer: customerId, payment_method_types: ["card"] });
            return { clientSecret: si.client_secret, isMock: false };
        } catch (error: any) {
            const msg = stripeErrorMessage(error);
            if (msg.includes("similar object exists in") || msg.includes("No such customer")) {
                throw new Error(
                    "El perfil de pagos pertenece a otro entorno (test/live). Intentá de nuevo o contactá soporte.",
                );
            }
            throw new Error(`Error al configurar método de pago: ${msg}`);
        }
    },
});

export const detachPaymentMethod = action({
    args: {
        sessionToken: v.optional(v.string()),
        paymentMethodId: v.string(),
        mode: stripeModeValidator,
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const stripe = getStripe(args.mode);
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: actor.idString });
        const customerId = customerIdFor(user, args.mode);
        const pm = await stripe.paymentMethods.retrieve(args.paymentMethodId);
        if (!customerId || pm.customer !== customerId) throw new Error("No autorizado.");
        await stripe.paymentMethods.detach(args.paymentMethodId);
    },
});

export const setDefaultPaymentMethod = action({
    args: {
        sessionToken: v.optional(v.string()),
        paymentMethodId: v.string(),
        mode: stripeModeValidator,
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const stripe = getStripe(args.mode);
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: actor.idString });
        const customerId = customerIdFor(user, args.mode);
        if (!customerId) throw new Error("Usuario sin perfil de pagos en Stripe.");
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: args.paymentMethodId },
        });
    },
});

// ===========================================================================
// WEBHOOK: pago confirmado → órdenes
// ===========================================================================

/**
 * Recupera el charge y la fee REAL del PaymentIntent y procesa el checkout.
 * Lo llama el webhook `payment_intent.succeeded`.
 */
export const internalHandlePaymentIntentSucceeded = internalAction({
    args: { mode: stripeModeValidator, paymentIntentId: v.string() },
    handler: async (ctx, args): Promise<{ created: number; pointsAwarded: number }> => {
        const stripe = getStripe(args.mode);
        const pi = await stripe.paymentIntents.retrieve(args.paymentIntentId, {
            expand: ["latest_charge.balance_transaction"],
        });
        const charge = (pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null) as Stripe.Charge | null;
        const bt =
            charge && charge.balance_transaction && typeof charge.balance_transaction === "object"
                ? (charge.balance_transaction as Stripe.BalanceTransaction)
                : null;
        return await ctx.runMutation(internal.stripe.internalProcessPaidCheckout, {
            stripePaymentIntentId: pi.id,
            mode: args.mode,
            chargeId: charge?.id,
            actualFeeCents: bt ? bt.fee : undefined,
            balanceTransactionId: bt ? bt.id : undefined,
        });
    },
});

/** Resuelve una imagen (storage id o URL) a URL. */
async function resolveImage(ctx: MutationCtx, image?: string): Promise<string | undefined> {
    if (!image) return undefined;
    if (image.startsWith("http") || image.startsWith("blob:") || image.startsWith("data:")) return image;
    try {
        const url = await ctx.storage.getUrl(image as any);
        return url ?? image;
    } catch {
        return image;
    }
}

/**
 * Crea las sub-órdenes (una por vendedor) desde el snapshot del pago.
 * IDEMPOTENTE: si ya hay órdenes para el PI, no crea nada.
 */
export const internalProcessPaidCheckout = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        mode: stripeModeValidator,
        chargeId: v.optional(v.string()),
        actualFeeCents: v.optional(v.number()),
        balanceTransactionId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ created: number; pointsAwarded: number }> => {
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (!payment) {
            // El webhook reintenta (500). Si nunca aparece, la reconciliación lo marca.
            throw new Error(`Pago no encontrado para ${args.stripePaymentIntentId}`);
        }
        if (!payment.checkoutSnapshot) {
            throw new Error(`Pago ${payment._id} sin snapshot de checkout; no se pueden crear órdenes.`);
        }

        const existing = await ctx.db
            .query("orders")
            .withIndex("by_stripe_payment_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .collect();
        if (existing.length > 0) {
            for (const o of existing) {
                if (!o.stripeChargeId && args.chargeId) {
                    await ctx.db.patch(o._id, { stripeChargeId: args.chargeId, updatedAt: nowIso() });
                }
            }
            if (!payment.stripeChargeId && args.chargeId) {
                await ctx.db.patch(payment._id, {
                    stripeChargeId: args.chargeId,
                    stripeBalanceTransactionId: args.balanceTransactionId,
                    providerFeeCents: args.actualFeeCents ?? payment.providerFeeCents,
                });
            }
            return { created: 0, pointsAwarded: 0 };
        }

        const snapshot: CheckoutSplit =
            args.actualFeeCents != null
                ? reapplyActualFee(payment.checkoutSnapshot as CheckoutSplit, args.actualFeeCents)
                : (payment.checkoutSnapshot as CheckoutSplit);
        const now = Date.now();
        const nowStr = new Date(now).toISOString();
        const shipping = payment.shipping;
        let firstOrderId: Id<"orders"> | null = null;

        for (const seller of snapshot.sellers) {
            const lines = snapshot.lineItems.filter((l) => l.sellerId === seller.sellerId);
            const items: Array<{ listingId: string; title: string; quantity: number; price: number; image?: string }> = [];
            const shortfalls: StockIssue[] = [];

            for (const line of lines) {
                items.push({
                    listingId: line.listingId,
                    title: line.title ?? "Producto",
                    quantity: line.quantity,
                    price: line.unitCents / 100,
                    image: await resolveImage(ctx, line.image),
                });
                const listingId = ctx.db.normalizeId("listings", line.listingId);
                if (!listingId) continue;
                const listing: any = await ctx.db.get(listingId);
                if (!listing || typeof listing.stock !== "number") continue;
                const missing = shortfallFor(listing.stock, line.quantity);
                if (missing > 0) {
                    shortfalls.push({
                        listingId: line.listingId,
                        title: line.title ?? "Producto",
                        requested: line.quantity,
                        available: listing.stock,
                    });
                }
                await ctx.db.patch(listingId, { stock: decrementStock(listing.stock, line.quantity) });
            }

            const listingType = lines[0]?.type || "product";
            const orderId = await ctx.db.insert("orders", {
                userId: payment.userId,
                sellerId: seller.sellerId,
                items,
                total: seller.grossCents / 100,
                currency: "USD",
                status: "paid_escrow",
                escrowState: "held",
                mode: args.mode,
                listingType,
                releaseDueAt: releaseDueAtFor(listingType, now),
                grossCents: seller.grossCents,
                commissionCents: seller.commissionCents,
                influencerId: seller.influencerId,
                influencerCents: seller.influencerCents,
                providerFeeCents: seller.feeCents,
                sellerNetCents: seller.sellerNetCents,
                netAmountCents: seller.sellerNetCents,
                refundedCents: 0,
                refundCount: 0,
                transferGroup: payment.cartId ?? args.stripePaymentIntentId,
                stripePaymentIntentId: args.stripePaymentIntentId,
                stripeChargeId: args.chargeId,
                ...(shipping ? { shipping: { ...shipping, cost: seller.shippingCents / 100 } } : {}),
                ...(shortfalls.length > 0 ? { stockShortfall: shortfalls } : {}),
                createdAt: nowStr,
                updatedAt: nowStr,
            });
            if (!firstOrderId) firstOrderId = orderId;
            if (shortfalls.length > 0) {
                console.error(`[Stripe] SOBREVENTA en orden ${orderId}: ${JSON.stringify(shortfalls)}`);
            }

            const socialItems = lines
                .filter((l) => l.sourcePostId)
                .map((l) => ({
                    listingId: l.listingId,
                    sourcePostId: String(l.sourcePostId),
                    quantity: l.quantity,
                    grossCents: l.grossCents,
                }));
            if (socialItems.length > 0) {
                await ctx.runMutation(internal.commerce.internalRecordSocialSalesForOrder, {
                    orderId: String(orderId),
                    buyerUserId: payment.userId,
                    sellerId: seller.sellerId,
                    stripePaymentIntentId: args.stripePaymentIntentId,
                    items: socialItems,
                });
            }
            if (lines.some((l) => l.type === "bono")) {
                await ctx.scheduler.runAfter(0, internal.bonos.internalIssueBonosForOrder, { orderId });
            }
        }

        const totalSellerNet = snapshot.sellers.reduce((a, s) => a + s.sellerNetCents, 0);
        await ctx.db.patch(payment._id, {
            status: "succeeded_in_escrow",
            settledAt: nowStr,
            orderId: firstOrderId ? String(firstOrderId) : payment.orderId,
            sellerId: payment.sellerId ?? snapshot.sellers[0]?.sellerId,
            stripeChargeId: args.chargeId,
            stripeBalanceTransactionId: args.balanceTransactionId,
            providerFeeCents: snapshot.feeCents,
            providerFee: snapshot.feeCents / 100,
            sellerNetCents: totalSellerNet,
            sellerNet: totalSellerNet / 100,
            checkoutSnapshot: snapshot,
        });

        await ctx.runMutation(internal.cart.internalClearCart, { userId: payment.userId });

        // Canje de puntos (idempotente por PI). Si el usuario gastó los puntos
        // entre el PI y el webhook, el cobro ya ocurrió: se registra y se avisa.
        if ((snapshot.pointsRedeemed ?? 0) > 0) {
            const outcome = await awardPoints(ctx, {
                userId: payment.userId,
                eventKey: `checkout_redeem_${args.stripePaymentIntentId}`,
                amount: snapshot.pointsRedeemed!,
                type: "redeem",
                source: "purchase",
                description: `Canje de ${snapshot.pointsRedeemed} puntos (-$${((snapshot.discountCents ?? 0) / 100).toFixed(2)})`,
                metadata: { paymentIntentId: args.stripePaymentIntentId, discountCents: snapshot.discountCents },
            });
            if (outcome.awarded === 0 && outcome.reason !== "duplicate") {
                console.error(`[Stripe] No se pudieron debitar ${snapshot.pointsRedeemed} puntos de ${payment.userId}: ${outcome.reason}`);
                await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
                    title: "Canje de puntos fallido",
                    body: `PI ${args.stripePaymentIntentId}: descuento aplicado sin débito de puntos (${outcome.reason}).`,
                    category: "payment",
                    data: { paymentIntentId: args.stripePaymentIntentId },
                });
            }
        }

        // Puntos y referidos (idempotentes por PI).
        let pointsAwarded = 0;
        if (snapshot.totalCents > 0) {
            const award = await ctx.runMutation(internal.economy.internalAwardPurchasePoints, {
                userId: payment.userId,
                cashAmountUsd: snapshot.totalCents / 100,
                paymentIntentId: args.stripePaymentIntentId,
                orderId: firstOrderId ? String(firstOrderId) : undefined,
                description: payment.description ? `Compra: ${payment.description}` : undefined,
            });
            pointsAwarded = Number((award as any)?.pointsAwarded) || 0;
            await ctx.runMutation(internal.users.internalHandleReferralPurchase, {
                buyerUserId: payment.userId,
                amountUSD: snapshot.totalCents / 100,
                paymentIntentId: args.stripePaymentIntentId,
            });
        }

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: payment.userId,
            title: "Pago confirmado",
            body:
                pointsAwarded > 0
                    ? `Tu compra de $${(snapshot.totalCents / 100).toFixed(2)} fue confirmada. Sumaste +${pointsAwarded} pts.`
                    : `Tu compra de $${(snapshot.totalCents / 100).toFixed(2)} fue confirmada.`,
            category: "payment",
            data: { paymentIntentId: args.stripePaymentIntentId, pointsAwarded },
        });

        return { created: snapshot.sellers.length, pointsAwarded };
    },
});

/** Camino legacy (PI sin `cartId`): marca el pago y acredita puntos. */
export const internalMarkPaymentSucceeded = internalMutation({
    args: { stripePaymentIntentId: v.string(), orderId: v.optional(v.string()) },
    handler: async (ctx, args): Promise<{ success: boolean; pointsAwarded: number }> => {
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (!payment) return { success: false, pointsAwarded: 0 };
        await ctx.db.patch(payment._id, { status: "succeeded_in_escrow", settledAt: nowIso() });
        let pointsAwarded = 0;
        if (payment.amount > 0) {
            const award = await ctx.runMutation(internal.economy.internalAwardPurchasePoints, {
                userId: payment.userId,
                cashAmountUsd: payment.amount,
                paymentIntentId: args.stripePaymentIntentId,
                orderId: args.orderId || payment.orderId,
            });
            pointsAwarded = Number((award as any)?.pointsAwarded) || 0;
        }
        return { success: true, pointsAwarded };
    },
});

// ===========================================================================
// LIBERACIÓN DE ESCROW — camino único
// ===========================================================================

export const internalGetOrderForAdminEscrow = internalQuery({
    args: { orderId: v.id("orders") },
    handler: async (ctx, args): Promise<Doc<"orders"> | null> => ctx.db.get(args.orderId),
});

type ReleaseBegin =
    | { alreadyReleased: true }
    | {
          alreadyReleased: false;
          mode: StripeMode;
          isMock: boolean;
          sellerId: string;
          sellerNetCents: number;
          chargeId?: string;
          transferGroup: string;
          destination: string;
          payoutId: Id<"payouts">;
      };

export const internalBeginEscrowRelease = internalMutation({
    args: { orderId: v.id("orders"), trigger: releaseTriggerValidator },
    handler: async (ctx, args): Promise<ReleaseBegin> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");
        if (order.escrowState === "released") return { alreadyReleased: true };

        const fromDispute = args.trigger === "dispute_seller" && order.escrowState === "disputed";
        if (!fromDispute && !isReleasable(order.escrowState, !!order.escrowReleaseError)) {
            throw new Error(`La orden no está en condiciones de liberar (escrow: ${order.escrowState ?? "n/a"}).`);
        }
        if (!fromDispute && !canConfirmReceipt(order.status) && order.status !== "completed") {
            throw new Error(`La orden no está en un estado liberable (${order.status}).`);
        }

        const mode: StripeMode = order.mode ?? "test";
        const sellerNetCents = order.sellerNetCents ?? order.netAmountCents ?? 0;
        if (sellerNetCents <= 0) throw new Error("La orden no tiene neto a transferir.");
        if (!order.stripePaymentIntentId) throw new Error("La orden no tiene PaymentIntent.");
        const isMock = isMockPaymentIntentId(order.stripePaymentIntentId);

        const sellerUserId = ctx.db.normalizeId("users", order.sellerId);
        const seller = sellerUserId ? await ctx.db.get(sellerUserId) : null;
        const destination = isMock ? `mock_acct_${order.sellerId}` : connectAccountFor(seller, mode);
        if (!destination) {
            throw new Error(
                `El vendedor no completó su cuenta de pagos (Stripe Connect, modo ${mode}). No se puede liberar todavía.`,
            );
        }

        const now = nowIso();
        await ctx.db.patch(order._id, {
            escrowState: "release_pending",
            escrowPrevStatus: order.escrowPrevStatus ?? order.status,
            escrowReleaseTrigger: args.trigger,
            escrowReleaseError: undefined,
            updatedAt: now,
        });

        const idempotencyKey = `release:${order._id}:seller`;
        const existingPayout = await ctx.db
            .query("payouts")
            .withIndex("by_order_and_kind", (q) => q.eq("orderId", String(order._id)).eq("kind", "seller"))
            .first();
        let payoutId: Id<"payouts">;
        if (existingPayout) {
            payoutId = existingPayout._id;
            await ctx.db.patch(payoutId, {
                status: "processing",
                attempts: (existingPayout.attempts ?? 0) + 1,
                amountInCents: sellerNetCents,
                destinationAccountId: destination,
                error: undefined,
                updatedAt: now,
            });
        } else {
            const payment = await ctx.db
                .query("payments")
                .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", order.stripePaymentIntentId))
                .first();
            payoutId = await ctx.db.insert("payouts", {
                paymentId: payment ? String(payment._id) : undefined,
                orderId: String(order._id),
                kind: "seller",
                mode,
                sellerId: order.sellerId,
                destinationAccountId: destination,
                amountInCents: sellerNetCents,
                currency: "USD",
                status: "processing",
                idempotencyKey,
                attempts: 1,
                createdAt: now,
                updatedAt: now,
            });
        }

        return {
            alreadyReleased: false,
            mode,
            isMock,
            sellerId: order.sellerId,
            sellerNetCents,
            chargeId: order.stripeChargeId,
            transferGroup: order.transferGroup ?? order.stripePaymentIntentId,
            destination,
            payoutId,
        };
    },
});

export const internalCompleteEscrowRelease = internalMutation({
    args: {
        orderId: v.id("orders"),
        payoutId: v.id("payouts"),
        transferId: v.string(),
        actorUserId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<void> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;
        const now = Date.now();
        const nowStr = new Date(now).toISOString();

        await ctx.db.patch(order._id, {
            escrowState: "released",
            status: "completed",
            stripeTransferId: args.transferId,
            escrowReleasedAt: nowStr,
            escrowReleaseError: undefined,
            // Se limpia el rastro de los reintentos: la orden se liberó.
            escrowReleaseAttempts: undefined,
            escrowReleaseFailedAtMs: undefined,
            updatedAt: nowStr,
        });
        await ctx.db.patch(args.payoutId, {
            status: "completed",
            stripeTransferId: args.transferId,
            executedAt: nowStr,
            error: undefined,
            updatedAt: nowStr,
        });

        // Influencer: se programa a +10 días (ventana de clawback).
        if (order.influencerId && (order.influencerCents ?? 0) > 0) {
            const existing = await ctx.db
                .query("payouts")
                .withIndex("by_order_and_kind", (q) => q.eq("orderId", String(order._id)).eq("kind", "influencer"))
                .first();
            if (!existing) {
                const dueAt = influencerPayoutDueAt(now);
                await ctx.db.insert("payouts", {
                    orderId: String(order._id),
                    kind: "influencer",
                    mode: order.mode ?? "test",
                    sellerId: order.influencerId,
                    amountInCents: order.influencerCents!,
                    currency: "USD",
                    status: "scheduled",
                    idempotencyKey: `release:${order._id}:influencer`,
                    scheduledAtMs: dueAt,
                    scheduledAt: new Date(dueAt).toISOString(),
                    attempts: 0,
                    createdAt: nowStr,
                    updatedAt: nowStr,
                });
            }
        }

        // Pago: released_to_seller cuando TODAS las órdenes del PI se liberaron.
        if (order.stripePaymentIntentId) {
            const siblings = await ctx.db
                .query("orders")
                .withIndex("by_stripe_payment_intent", (q) =>
                    q.eq("stripePaymentIntentId", order.stripePaymentIntentId),
                )
                .collect();
            const allReleased = siblings.every(
                (o) => o._id === order._id || o.escrowState === "released" || o.escrowState === "refunded",
            );
            if (allReleased) {
                const payment = await ctx.db
                    .query("payments")
                    .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", order.stripePaymentIntentId))
                    .first();
                if (payment && payment.status === "succeeded_in_escrow") {
                    await ctx.db.patch(payment._id, { status: "released_to_seller" });
                }
            }
        }

        await ctx.db.insert(
            "audit_logs",
            buildAuditRecord({
                actorUserId: args.actorUserId ?? `system:${order.escrowReleaseTrigger ?? "release"}`,
                targetUserId: order.sellerId,
                action: "ESCROW_RELEASED",
                amountCents: order.sellerNetCents ?? order.netAmountCents,
                metadata: { orderId: String(order._id), transferId: args.transferId, trigger: order.escrowReleaseTrigger },
            }),
        );

        const shortOrderId = String(order._id).slice(-6);
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: order.sellerId,
            title: "Fondos liberados",
            body: `Se liberaron los fondos del pedido #${shortOrderId}. Ya están en tu cuenta de Stripe.`,
            category: "payment",
            data: { type: "escrow_released", orderId: String(order._id), amount: order.total },
        });
    },
});

export const internalFlagEscrowReleaseFailed = internalMutation({
    args: { orderId: v.id("orders"), payoutId: v.optional(v.id("payouts")), reason: v.string() },
    handler: async (ctx, args): Promise<void> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;
        const now = nowIso();
        // El contador y la marca de tiempo son lo que permite al cron
        // reintentar con espera creciente en vez de descartar la orden.
        const intentos = (order.escrowReleaseAttempts ?? 0) + 1;
        // Nunca revertir un estado terminal: si la orden ya se liberó o se
        // reembolsó, un intento fallido posterior no debe devolverla a `held`.
        const terminal = order.escrowState === "released" || order.escrowState === "refunded";
        await ctx.db.patch(order._id, {
            ...(terminal
                ? {}
                : { escrowState: "held", status: (order.escrowPrevStatus as any) ?? order.status }),
            escrowReleaseError: args.reason,
            escrowReleaseAttempts: intentos,
            escrowReleaseFailedAtMs: Date.now(),
            updatedAt: now,
        });
        if (args.payoutId) {
            await ctx.db.patch(args.payoutId, { status: "failed", error: args.reason, updatedAt: now });
        }
        await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
            title: "Liberación de escrow fallida",
            body: `Orden ${String(order._id).slice(-6)}: ${args.reason}`,
            category: "payment",
            data: { orderId: String(order._id) },
        });
    },
});

/**
 * ÚNICO camino que mueve plata al vendedor. Lo usan confirmReceipt, admin,
 * disputas, cron y los módulos de eventos/servicios/bonos.
 */
export const internalReleaseOrderEscrow = internalAction({
    args: {
        orderId: v.id("orders"),
        trigger: releaseTriggerValidator,
        actorUserId: v.optional(v.string()),
        skipSourceTransaction: v.optional(v.boolean()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ released: boolean; transferId?: string; alreadyReleased?: boolean }> => {
        // `internalBeginEscrowRelease` valida y puede lanzar (vendedor sin cuenta
        // Connect, neto <= 0, sin PaymentIntent). Ese throw tiene que dejar la
        // orden RECUPERABLE: `confirmReceipt` ya la puso en `release_pending`
        // con `escrowReleaseError: undefined`, y `isReleasable` rechaza ese
        // estado — sin este catch la orden quedaba trabada para siempre, sin
        // que ni el reintento ni `adminForceReleaseEscrow` pudieran rescatarla.
        let begin: Awaited<ReturnType<typeof ctx.runMutation<typeof internal.stripe.internalBeginEscrowRelease>>>;
        try {
            begin = await ctx.runMutation(internal.stripe.internalBeginEscrowRelease, {
                orderId: args.orderId,
                trigger: args.trigger,
            });
        } catch (error: any) {
            const reason = stripeErrorMessage(error);
            console.error(`[Stripe Escrow] No se pudo iniciar la liberación de ${args.orderId}: ${reason}`);
            await ctx.runMutation(internal.stripe.internalFlagEscrowReleaseFailed, {
                orderId: args.orderId,
                reason,
            });
            throw new Error(`No se pudo liberar el pago: ${reason}`);
        }
        if (begin.alreadyReleased) return { released: true, alreadyReleased: true };
        // `begin` viaja a través de ctx.runMutation (function reference), y el
        // convex/tsconfig.json (strict: false) del CLI de Convex no narrowea el
        // discriminated union tras el early-return de arriba como sí lo hace
        // tsc con el tsconfig.json del proyecto. Cast explícito, seguro porque
        // ya descartamos la rama `alreadyReleased: true` en la línea anterior.
        const release = begin as Extract<ReleaseBegin, { alreadyReleased: false }>;

        try {
            let transferId: string;
            if (release.isMock) {
                assertMockAllowed();
                transferId = mockTransferId(String(args.orderId), "seller");
            } else {
                const stripe = getStripe(release.mode);
                const transfer = await withStripeBreadcrumb(
                    { api: "transfers.create", orderId: String(args.orderId), mode: release.mode, trigger: args.trigger },
                    () =>
                        stripe.transfers.create(
                            {
                                amount: release.sellerNetCents,
                                currency: "usd",
                                destination: release.destination,
                                transfer_group: release.transferGroup,
                                ...(release.chargeId && !args.skipSourceTransaction
                                    ? { source_transaction: release.chargeId }
                                    : {}),
                                metadata: {
                                    orderId: String(args.orderId),
                                    kind: "seller",
                                    mode: release.mode,
                                    trigger: args.trigger,
                                },
                            },
                            { idempotencyKey: `release:${args.orderId}:seller` },
                        ),
                );
                transferId = transfer.id;
            }
            await ctx.runMutation(internal.stripe.internalCompleteEscrowRelease, {
                orderId: args.orderId,
                payoutId: release.payoutId,
                transferId,
                actorUserId: args.actorUserId,
            });
            return { released: true, transferId };
        } catch (error: any) {
            const reason = stripeErrorMessage(error);
            console.error(`[Stripe Escrow] Falló la liberación de ${args.orderId}: ${reason}`);
            await ctx.runMutation(internal.stripe.internalFlagEscrowReleaseFailed, {
                orderId: args.orderId,
                payoutId: release.payoutId,
                reason,
            });
            throw new Error(`No se pudo liberar el pago: ${reason}`);
        }
    },
});

/**
 * Órdenes que el cron debe liberar.
 *
 * Antes se excluía a cualquiera con `escrowReleaseError`, así que una orden que
 * falló UNA vez quedaba fuera del cron para siempre y sólo salía con
 * intervención manual — plata del vendedor quieta sin que nadie lo notara. La
 * causa más común es transitoria (el vendedor todavía no vinculó su cuenta), o
 * sea justo el caso que conviene reintentar.
 *
 * Se reintenta con espera creciente en vez de sacar el filtro sin más: un fallo
 * determinístico generaría un intento y un aviso por día, para siempre.
 */
export const internalGetOrdersDueForRelease = internalQuery({
    args: { now: v.number(), limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<Id<"orders">[]> => {
        const rows = await ctx.db
            .query("orders")
            .withIndex("by_escrow_state_and_release_due", (q) =>
                q.eq("escrowState", "held").lte("releaseDueAt", args.now),
            )
            .take(args.limit ?? 100);
        return rows.filter((o) => shouldRetryRelease({ ...o, nowMs: args.now })).map((o) => o._id);
    },
});

export const internalCronAutoReleaseEscrows = internalAction({
    args: {},
    handler: async (ctx): Promise<{ attempted: number; released: number }> => {
        const due = await ctx.runQuery(internal.stripe.internalGetOrdersDueForRelease, { now: Date.now() });
        let released = 0;
        for (const orderId of due) {
            try {
                const r = await ctx.runAction(internal.stripe.internalReleaseOrderEscrow, {
                    orderId,
                    trigger: "auto_release",
                });
                if (r.released) released += 1;
            } catch (error) {
                console.error(`[Cron] auto-release falló para ${orderId}:`, error);
            }
        }
        return { attempted: due.length, released };
    },
});

// ===========================================================================
// INFLUENCER — transfer a los 10 días de liberada la orden
// ===========================================================================

export const internalListDueInfluencerPayouts = internalQuery({
    args: { now: v.number(), limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<Id<"payouts">[]> => {
        const rows = await ctx.db
            .query("payouts")
            .withIndex("by_status_and_scheduled", (q) => q.eq("status", "scheduled").lte("scheduledAtMs", args.now))
            .take(args.limit ?? 50);
        return rows.map((r) => r._id);
    },
});

type InfluencerClaim = null | {
    mode: StripeMode;
    isMock: boolean;
    amount: number;
    destination: string;
    chargeId?: string;
    transferGroup: string;
    orderId: string;
    influencerId: string;
};

export const internalClaimScheduledPayout = internalMutation({
    args: { payoutId: v.id("payouts") },
    handler: async (ctx, args): Promise<InfluencerClaim> => {
        const payout = await ctx.db.get(args.payoutId);
        if (!payout || payout.status !== "scheduled" || !payout.orderId) return null;
        const orderId = ctx.db.normalizeId("orders", payout.orderId);
        const order = orderId ? await ctx.db.get(orderId) : null;
        const now = nowIso();
        const mode: StripeMode = payout.mode ?? order?.mode ?? "test";
        const isMock = isMockPaymentIntentId(order?.stripePaymentIntentId);
        const influencerUserId = ctx.db.normalizeId("users", payout.sellerId);
        const influencer = influencerUserId ? await ctx.db.get(influencerUserId) : null;
        const destination = isMock ? `mock_acct_${payout.sellerId}` : connectAccountFor(influencer, mode);

        // La decisión vive en `_payoutRetry.ts` para poder testearla.
        const verdict = classifyPayoutClaim({
            payoutStatus: payout.status,
            amountInCents: payout.amountInCents,
            orderEscrowState: order?.escrowState,
            hasDestination: !!destination,
            attempts: payout.attempts,
            nowMs: Date.now(),
            maxAttempts: INFLUENCER_PAYOUT_MAX_ATTEMPTS,
            mode,
        });

        if (verdict.kind === "cancel") {
            await ctx.db.patch(payout._id, { status: "cancelled", error: verdict.reason, updatedAt: now });
            return null;
        }
        if (verdict.kind !== "proceed") {
            /**
             * Que el influencer todavía no haya vinculado su cuenta NO es un
             * fallo definitivo: puede vincularla mañana. Antes esto lo mandaba
             * derecho a `failed`, que es terminal — el cron sólo levanta
             * `scheduled` y no hay forma de revivirlo, así que la comisión se
             * perdía en silencio. Ahora se reprograma con espera creciente y
             * recién se da por perdida al agotar los intentos, avisando.
             */
            const agotado = verdict.kind === "give_up";
            const attempts = verdict.attempts;
            await ctx.db.patch(payout._id, {
                status: agotado ? "failed" : "scheduled",
                error: verdict.reason,
                attempts,
                ...(verdict.kind === "reschedule" ? { scheduledAtMs: verdict.nextAtMs } : {}),
                updatedAt: now,
            });
            if (agotado) {
                await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
                    title: "Comisión de influencer sin pagar",
                    body: `El influencer no vinculó su cuenta tras ${attempts} intentos. Payout ${String(payout._id).slice(-6)} por ${payout.amountInCents}¢ quedó sin pagar.`,
                    category: "payment",
                    data: { payoutId: String(payout._id), orderId: payout.orderId },
                });
            } else {
                // Aviso al influencer: es accionable de su lado.
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    userId: payout.sellerId,
                    title: "Vinculá tu cuenta para cobrar",
                    body: "Tenés una comisión lista para acreditarse, pero falta que conectes tu cuenta de pagos.",
                    category: "payment",
                    data: { payoutId: String(payout._id) },
                });
            }
            return null;
        }
        /**
         * A esta altura el veredicto es `proceed`, lo que implica orden
         * liberada y destino presente. TypeScript no puede deducirlo del
         * clasificador, así que se explicita — y de paso queda como red si
         * alguien cambia las reglas de `classifyPayoutClaim`.
         */
        if (!order || !destination) return null;
        await ctx.db.patch(payout._id, {
            status: "processing",
            destinationAccountId: destination,
            attempts: verdict.attempts,
            updatedAt: now,
        });
        return {
            mode,
            isMock,
            amount: payout.amountInCents,
            destination,
            chargeId: order.stripeChargeId,
            transferGroup: order.transferGroup ?? order.stripePaymentIntentId ?? String(order._id),
            orderId: String(order._id),
            influencerId: payout.sellerId,
        };
    },
});

export const internalFinishInfluencerPayout = internalMutation({
    args: { payoutId: v.id("payouts"), transferId: v.optional(v.string()), error: v.optional(v.string()) },
    handler: async (ctx, args): Promise<void> => {
        const payout = await ctx.db.get(args.payoutId);
        if (!payout) return;
        const now = nowIso();
        if (args.transferId) {
            await ctx.db.patch(payout._id, {
                status: "completed",
                stripeTransferId: args.transferId,
                executedAt: now,
                error: undefined,
                updatedAt: now,
            });
            if (payout.orderId) {
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    userId: payout.sellerId,
                    title: "Comisión acreditada",
                    body: `Se transfirió tu comisión de $${(payout.amountInCents / 100).toFixed(2)} del pedido #${payout.orderId.slice(-6)}.`,
                    category: "payment",
                    data: { type: "influencer_payout", orderId: payout.orderId },
                });
            }
            return;
        }
        const attempts = payout.attempts ?? 1;
        await ctx.db.patch(payout._id, {
            status: attempts < 5 ? "scheduled" : "failed",
            error: args.error,
            updatedAt: now,
        });
    },
});

export const internalPayDueInfluencerPayouts = internalAction({
    args: {},
    handler: async (ctx): Promise<{ attempted: number; paid: number }> => {
        const due = await ctx.runQuery(internal.stripe.internalListDueInfluencerPayouts, { now: Date.now() });
        let paid = 0;
        for (const payoutId of due) {
            const claim = await ctx.runMutation(internal.stripe.internalClaimScheduledPayout, { payoutId });
            if (!claim) continue;
            try {
                let transferId: string;
                if (claim.isMock) {
                    assertMockAllowed();
                    transferId = mockTransferId(claim.orderId, "influencer");
                } else {
                    const stripe = getStripe(claim.mode);
                    const transfer = await stripe.transfers.create(
                        {
                            amount: claim.amount,
                            currency: "usd",
                            destination: claim.destination,
                            transfer_group: claim.transferGroup,
                            ...(claim.chargeId ? { source_transaction: claim.chargeId } : {}),
                            metadata: {
                                orderId: claim.orderId,
                                kind: "influencer",
                                mode: claim.mode,
                                influencerId: claim.influencerId,
                            },
                        },
                        { idempotencyKey: `release:${claim.orderId}:influencer` },
                    );
                    transferId = transfer.id;
                }
                await ctx.runMutation(internal.stripe.internalFinishInfluencerPayout, { payoutId, transferId });
                paid += 1;
            } catch (error: any) {
                const msg = stripeErrorMessage(error);
                console.error(`[Cron] payout influencer ${payoutId} falló: ${msg}`);
                await ctx.runMutation(internal.stripe.internalFinishInfluencerPayout, { payoutId, error: msg });
            }
        }
        return { attempted: due.length, paid };
    },
});

// ===========================================================================
// REEMBOLSOS
// ===========================================================================

type RefundBegin = {
    mode: StripeMode;
    isMock: boolean;
    paymentIntentId: string;
    refundCents: number;
    n: number;
    /** Base de la clave de idempotencia: `refundedCents` antes de este intento. */
    idemBase: number;
    grossCents: number;
    sellerNetCents: number;
    influencerCents: number;
    payouts: Array<{
        payoutId: Id<"payouts">;
        kind: "seller" | "influencer";
        transferId?: string;
        status: string;
        amount: number;
        reversedCents: number;
    }>;
};

export const internalBeginOrderRefund = internalMutation({
    args: { orderId: v.id("orders"), amountCents: v.optional(v.number()) },
    handler: async (ctx, args): Promise<RefundBegin> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) throw new Error("Orden no encontrada");
        if (!isRefundable(order.escrowState, !!order.escrowRefundError)) {
            throw new Error(`La orden no admite reembolso (escrow: ${order.escrowState ?? "n/a"}).`);
        }
        if (!order.stripePaymentIntentId) throw new Error("La orden no tiene PaymentIntent.");
        const grossCents = order.grossCents ?? Math.round(order.total * 100);
        const remaining = grossCents - (order.refundedCents ?? 0);
        if (remaining <= 0) throw new Error("La orden ya fue reembolsada por completo.");
        const refundCents = Math.min(remaining, Math.round(args.amountCents ?? remaining));
        if (refundCents <= 0) throw new Error("El monto a reembolsar debe ser mayor a 0.");
        const n = (order.refundCount ?? 0) + 1;
        await ctx.db.patch(order._id, {
            escrowState: "refund_pending",
            escrowPrevState: order.escrowState === "refund_pending" ? order.escrowPrevState : order.escrowState,
            refundCount: n,
            escrowRefundError: undefined,
            updatedAt: nowIso(),
        });
        const payoutRows = await ctx.db
            .query("payouts")
            .withIndex("by_order_and_kind", (q) => q.eq("orderId", String(order._id)))
            .collect();
        return {
            mode: order.mode ?? "test",
            isMock: isMockPaymentIntentId(order.stripePaymentIntentId),
            paymentIntentId: order.stripePaymentIntentId,
            refundCents,
            n,
            /**
             * Clave de idempotencia del reembolso. Va atada a **cuánto se
             * había reembolsado antes**, no al contador de intentos.
             *
             * El contador avanza aunque el intento falle, así que usarlo hacía
             * que el reintento presentara una clave distinta: Stripe emitía un
             * SEGUNDO reembolso y una SEGUNDA reversión, cobrándole dos veces
             * al vendedor. `refundedCents` en cambio sólo cambia cuando el
             * reembolso se completó, o sea: reintentar la misma operación
             * repite la clave (Stripe la deduplica), y un reembolso parcial
             * posterior genera una nueva.
             */
            idemBase: order.refundedCents ?? 0,
            grossCents,
            sellerNetCents: order.sellerNetCents ?? order.netAmountCents ?? 0,
            influencerCents: order.influencerCents ?? 0,
            payouts: payoutRows
                .filter((p) => p.kind)
                .map((p) => ({
                    payoutId: p._id,
                    kind: p.kind!,
                    transferId: p.stripeTransferId,
                    status: p.status,
                    amount: p.amountInCents,
                    reversedCents: p.reversedCents ?? 0,
                })),
        };
    },
});

export const internalCompleteOrderRefund = internalMutation({
    args: {
        orderId: v.id("orders"),
        refundCents: v.number(),
        refundId: v.optional(v.string()),
        source: refundSourceValidator,
        reason: v.string(),
        actorUserId: v.optional(v.string()),
        reversals: v.array(
            v.object({
                payoutId: v.id("payouts"),
                amount: v.number(),
                reversalId: v.optional(v.string()),
                cancelled: v.optional(v.boolean()),
            }),
        ),
        /** Orden pagada 100% con puntos: se devuelven puntos, no dinero. */
        refundPoints: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<void> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;
        const now = nowIso();

        if (args.refundPoints && args.refundPoints > 0) {
            await awardPoints(ctx, {
                userId: order.userId,
                eventKey: `refund_points_${order._id}_${order.refundCount ?? 0}`,
                amount: args.refundPoints,
                type: "earn",
                source: "purchase",
                description: `Devolución de ${args.refundPoints} puntos (pedido #${String(order._id).slice(-6)})`,
                metadata: { orderId: String(order._id) },
            });
        }
        const grossCents = order.grossCents ?? Math.round(order.total * 100);
        const refundedCents = (order.refundedCents ?? 0) + args.refundCents;
        const full = refundedCents >= grossCents;

        await ctx.db.patch(order._id, {
            refundedCents,
            lastStripeRefundId: args.refundId ?? order.lastStripeRefundId,
            escrowRefundError: undefined,
            ...(full
                ? { escrowState: "refunded", status: "cancelled" as const }
                : { escrowState: order.escrowPrevState ?? "held" }),
            updatedAt: now,
        });

        if (full && (order.listingType ?? "product") === "product") {
            for (const item of order.items) {
                const listingId = ctx.db.normalizeId("listings", item.listingId);
                if (!listingId) continue;
                const listing: any = await ctx.db.get(listingId);
                if (!listing || typeof listing.stock !== "number") continue;
                await ctx.db.patch(listingId, { stock: listing.stock + item.quantity });
            }
        }

        for (const r of args.reversals) {
            const payout = await ctx.db.get(r.payoutId);
            if (!payout) continue;
            if (r.cancelled) {
                await ctx.db.patch(payout._id, { status: "cancelled", error: "orden reembolsada", updatedAt: now });
                continue;
            }
            if (r.amount <= 0) continue;
            const reversed = (payout.reversedCents ?? 0) + r.amount;
            await ctx.db.patch(payout._id, {
                reversedCents: reversed,
                stripeReversalIds: [...(payout.stripeReversalIds ?? []), ...(r.reversalId ? [r.reversalId] : [])],
                status: reversed >= payout.amountInCents ? "reversed" : payout.status,
                updatedAt: now,
            });
        }

        // Pago agregado por PI.
        if (order.stripePaymentIntentId) {
            const siblings = await ctx.db
                .query("orders")
                .withIndex("by_stripe_payment_intent", (q) =>
                    q.eq("stripePaymentIntentId", order.stripePaymentIntentId),
                )
                .collect();
            const totalRefunded = siblings.reduce(
                (a, o) => a + (o._id === order._id ? refundedCents : (o.refundedCents ?? 0)),
                0,
            );
            const totalGross = siblings.reduce((a, o) => a + (o.grossCents ?? Math.round(o.total * 100)), 0);
            const payment = await ctx.db
                .query("payments")
                .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", order.stripePaymentIntentId))
                .first();
            if (payment) {
                await ctx.db.patch(payment._id, {
                    refundedCents: totalRefunded,
                    status:
                        totalRefunded >= totalGross
                            ? "refunded"
                            : totalRefunded > 0
                              ? "partially_refunded"
                              : payment.status,
                });
            }
        }

        await ctx.db.insert(
            "audit_logs",
            buildAuditRecord({
                actorUserId: args.actorUserId ?? `system:${args.source}`,
                targetUserId: order.userId,
                action: "ESCROW_REFUNDED",
                amountCents: args.refundCents,
                metadata: {
                    orderId: String(order._id),
                    refundId: args.refundId,
                    source: args.source,
                    reason: args.reason,
                    full,
                },
            }),
        );

        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: order.userId,
            title: full ? "Reembolso realizado" : "Reembolso parcial realizado",
            body: `Te devolvimos $${(args.refundCents / 100).toFixed(2)} del pedido #${String(order._id).slice(-6)}. Verás el crédito en tu tarjeta en 5-10 días hábiles.`,
            category: "payment",
            data: { type: "refund", orderId: String(order._id), amountCents: args.refundCents },
        });
    },
});

export const internalFlagOrderRefundFailed = internalMutation({
    args: { orderId: v.id("orders"), reason: v.string() },
    handler: async (ctx, args): Promise<void> => {
        const order = await ctx.db.get(args.orderId);
        if (!order) return;
        /**
         * Sólo se revierte el estado si el reembolso estaba EN VUELO
         * (`refund_pending`). Antes se revertía a ciegas, así que un intento
         * fallido sobre una orden ya `refunded` la devolvía a `held` — la
         * des-reembolsaba. Si el fallo ocurrió antes de mover el estado (por
         * ejemplo, la orden ya estaba en un estado terminal), no hay nada que
         * restaurar: sólo se deja constancia del intento.
         */
        const enVuelo = order.escrowState === "refund_pending";
        await ctx.db.patch(order._id, {
            ...(enVuelo ? { escrowState: order.escrowPrevState ?? "held" } : {}),
            escrowRefundError: args.reason,
            updatedAt: nowIso(),
        });
        await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
            title: "Reembolso fallido",
            body: `Orden ${String(order._id).slice(-6)}: ${args.reason}`,
            category: "payment",
            data: { orderId: String(order._id) },
        });
    },
});

/**
 * ÚNICO camino que devuelve plata al comprador. `externalRefund: true`
 * significa que el dinero ya salió por Stripe (dashboard / disputa perdida)
 * y sólo hay que revertir transfers y contabilizar.
 */
export const internalRefundOrder = internalAction({
    args: {
        orderId: v.id("orders"),
        amountCents: v.optional(v.number()),
        reason: v.string(),
        source: refundSourceValidator,
        externalRefund: v.optional(v.boolean()),
        actorUserId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ refunded: boolean; refundCents: number; refundId?: string }> => {
        /**
         * Igual que en `internalReleaseOrderEscrow`: el inicio puede lanzar
         * (estado no reembolsable, sin PaymentIntent, monto inválido) y ese
         * throw tiene que dejar la orden RECUPERABLE. Sin este catch, una
         * orden que entrara en `refund_pending` sin `escrowRefundError`
         * quedaba trabada — `isRefundable` rechaza ese estado, así que ni el
         * reintento ni `adminRefundEscrow` podían rescatarla.
         */
        let begin: Awaited<ReturnType<typeof ctx.runMutation<typeof internal.stripe.internalBeginOrderRefund>>>;
        try {
            begin = await ctx.runMutation(internal.stripe.internalBeginOrderRefund, {
                orderId: args.orderId,
                amountCents: args.amountCents,
            });
        } catch (error: any) {
            const reason = stripeErrorMessage(error);
            console.error(`[Stripe Refund] No se pudo iniciar el reembolso de ${args.orderId}: ${reason}`);
            await ctx.runMutation(internal.stripe.internalFlagOrderRefundFailed, {
                orderId: args.orderId,
                reason,
            });
            throw new Error(`No se pudo reembolsar: ${reason}`);
        }
        try {
            let refundId: string | undefined;
            const pointsOnly = isPointsOnlyPaymentId(begin.paymentIntentId);
            if (!args.externalRefund && !pointsOnly) {
                if (begin.isMock) {
                    assertMockAllowed();
                    refundId = mockRefundId(String(args.orderId), begin.idemBase);
                } else {
                    const stripe = getStripe(begin.mode);
                    const refund = await withStripeBreadcrumb(
                        { api: "refunds.create", orderId: String(args.orderId), mode: begin.mode },
                        () =>
                            stripe.refunds.create(
                                {
                                    payment_intent: begin.paymentIntentId,
                                    amount: begin.refundCents,
                                    reason: "requested_by_customer",
                                    metadata: { orderId: String(args.orderId), n: String(begin.n), source: args.source },
                                },
                                { idempotencyKey: `refund:${args.orderId}:${begin.idemBase}` },
                            ),
                    );
                    refundId = refund.id;
                }
            }

            const sellerPayout = begin.payouts.find((p) => p.kind === "seller");
            const influencerPayout = begin.payouts.find((p) => p.kind === "influencer");
            const amounts = reversalAmountsFor(begin.refundCents, {
                grossCents: begin.grossCents,
                sellerNetCents: begin.sellerNetCents,
                influencerCents: begin.influencerCents,
                sellerReversedCents: sellerPayout?.reversedCents,
                influencerReversedCents: influencerPayout?.reversedCents,
            });
            const isFull = begin.refundCents >= begin.grossCents;

            const reversals: Array<{ payoutId: Id<"payouts">; amount: number; reversalId?: string; cancelled?: boolean }> = [];
            for (const p of begin.payouts) {
                const amount = p.kind === "seller" ? amounts.seller : amounts.influencer;
                if (p.status === "scheduled") {
                    // Influencer todavía no cobró: se cancela (total) o se descuenta (parcial).
                    reversals.push({ payoutId: p.payoutId, amount: 0, cancelled: isFull || amount >= p.amount });
                    continue;
                }
                if (p.status !== "completed" && p.status !== "reversed") continue;
                if (!p.transferId || amount <= 0) continue;
                let reversalId: string;
                if (begin.isMock || p.transferId.startsWith("mock_")) {
                    reversalId = mockReversalId(String(args.orderId), p.kind, begin.idemBase);
                } else {
                    const stripe = getStripe(begin.mode);
                    const rev = await stripe.transfers.createReversal(
                        p.transferId,
                        { amount, metadata: { orderId: String(args.orderId), kind: p.kind, n: String(begin.n) } },
                        { idempotencyKey: `reversal:${args.orderId}:${p.kind}:${begin.idemBase}` },
                    );
                    reversalId = rev.id;
                }
                reversals.push({ payoutId: p.payoutId, amount, reversalId });
            }

            await ctx.runMutation(internal.stripe.internalCompleteOrderRefund, {
                orderId: args.orderId,
                refundCents: begin.refundCents,
                refundId: pointsOnly ? `points_refund_${args.orderId}_${begin.n}` : refundId,
                source: args.source,
                reason: args.reason,
                actorUserId: args.actorUserId,
                reversals,
                refundPoints: pointsOnly ? Math.round(begin.refundCents / CENTS_PER_POINT) : undefined,
            });
            return { refunded: true, refundCents: begin.refundCents, refundId };
        } catch (error: any) {
            const reason = stripeErrorMessage(error);
            console.error(`[Stripe Refund] Falló el reembolso de ${args.orderId}: ${reason}`);
            await ctx.runMutation(internal.stripe.internalFlagOrderRefundFailed, { orderId: args.orderId, reason });
            throw new Error(`No se pudo reembolsar: ${reason}`);
        }
    },
});

export const internalGetOrdersForPaymentIntent = internalQuery({
    args: { stripePaymentIntentId: v.string() },
    handler: async (
        ctx,
        args,
    ): Promise<Array<{ id: Id<"orders">; grossCents: number; refundedCents: number; escrowState?: string }>> => {
        const rows = await ctx.db
            .query("orders")
            .withIndex("by_stripe_payment_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .collect();
        return rows.map((o) => ({
            id: o._id,
            grossCents: o.grossCents ?? Math.round(o.total * 100),
            refundedCents: o.refundedCents ?? 0,
            escrowState: o.escrowState,
        }));
    },
});

/** `charge.refunded`: reembolso iniciado FUERA de la app (Dashboard de Stripe). */
export const internalSyncExternalRefund = internalAction({
    args: { mode: stripeModeValidator, paymentIntentId: v.string(), amountRefundedCents: v.number() },
    handler: async (ctx, args): Promise<{ applied: number }> => {
        const orders = await ctx.runQuery(internal.stripe.internalGetOrdersForPaymentIntent, {
            stripePaymentIntentId: args.paymentIntentId,
        });
        if (orders.length === 0) {
            await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
                stripePaymentIntentId: args.paymentIntentId,
                status: "refunded",
            });
            return { applied: 0 };
        }
        const local = orders.reduce((a, o) => a + o.refundedCents, 0);
        const delta = args.amountRefundedCents - local;
        if (delta <= 0) return { applied: 0 }; // eco de un reembolso nuestro
        const allocation = allocateExternalRefund(
            delta,
            orders.map((o) => ({ id: String(o.id), grossCents: o.grossCents, refundedCents: o.refundedCents })),
        );
        let applied = 0;
        for (const o of orders) {
            const amount = allocation[String(o.id)] ?? 0;
            if (amount <= 0) continue;
            if (o.escrowState === "refund_pending") continue; // en curso desde la app
            await ctx.runAction(internal.stripe.internalRefundOrder, {
                orderId: o.id,
                amountCents: amount,
                reason: "stripe_dashboard_refund",
                source: "stripe_refund",
                externalRefund: true,
            });
            applied += amount;
        }
        return { applied };
    },
});

/** `charge.dispute.created`: congela todas las órdenes del PI. */
export const internalFreezeOrdersForPaymentIntent = internalMutation({
    args: { stripePaymentIntentId: v.string(), disputeId: v.string() },
    handler: async (ctx, args): Promise<{ frozen: number }> => {
        const rows = await ctx.db
            .query("orders")
            .withIndex("by_stripe_payment_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .collect();
        const now = nowIso();
        let frozen = 0;
        for (const o of rows) {
            if (o.escrowState === "refunded" || o.escrowState === "frozen") continue;
            await ctx.db.patch(o._id, {
                escrowState: "frozen",
                escrowPrevState: o.escrowState ?? "held",
                stripeDisputeId: args.disputeId,
                updatedAt: now,
            });
            frozen += 1;
        }
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (payment) await ctx.db.patch(payment._id, { status: "disputed" });
        await ctx.scheduler.runAfter(0, internal.notifications.internalNotifyAdmins, {
            title: "Disputa (chargeback) en Stripe",
            body: `PI ${args.stripePaymentIntentId}: ${frozen} orden(es) congeladas. Disputa ${args.disputeId}.`,
            category: "dispute",
            data: { paymentIntentId: args.stripePaymentIntentId, disputeId: args.disputeId },
        });
        return { frozen };
    },
});

export const internalUnfreezeOrdersForPaymentIntent = internalMutation({
    args: { stripePaymentIntentId: v.string() },
    handler: async (ctx, args): Promise<{ restored: number }> => {
        const rows = await ctx.db
            .query("orders")
            .withIndex("by_stripe_payment_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .collect();
        const now = nowIso();
        let restored = 0;
        for (const o of rows) {
            if (o.escrowState !== "frozen") continue;
            await ctx.db.patch(o._id, {
                escrowState: o.escrowPrevState ?? "held",
                escrowPrevState: undefined,
                updatedAt: now,
            });
            restored += 1;
        }
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_stripe_intent", (q) => q.eq("stripePaymentIntentId", args.stripePaymentIntentId))
            .first();
        if (payment && payment.status === "disputed") {
            const allReleased = rows.every((o) => o.escrowPrevState === "released" || o.escrowState === "released");
            await ctx.db.patch(payment._id, { status: allReleased ? "released_to_seller" : "succeeded_in_escrow" });
        }
        return { restored };
    },
});

/** `charge.dispute.closed`: won → restaurar; lost → Stripe ya retiró los fondos. */
export const internalResolveStripeDispute = internalAction({
    args: {
        mode: stripeModeValidator,
        paymentIntentId: v.string(),
        disputeId: v.string(),
        status: v.string(),
    },
    handler: async (ctx, args): Promise<{ outcome: string }> => {
        if (args.status === "won" || args.status === "warning_closed") {
            await ctx.runMutation(internal.stripe.internalUnfreezeOrdersForPaymentIntent, {
                stripePaymentIntentId: args.paymentIntentId,
            });
            return { outcome: "restored" };
        }
        if (args.status === "lost") {
            const orders = await ctx.runQuery(internal.stripe.internalGetOrdersForPaymentIntent, {
                stripePaymentIntentId: args.paymentIntentId,
            });
            for (const o of orders) {
                if (o.grossCents - o.refundedCents <= 0) continue;
                await ctx.runAction(internal.stripe.internalRefundOrder, {
                    orderId: o.id,
                    reason: `stripe_dispute_lost:${args.disputeId}`,
                    source: "stripe_dispute_lost",
                    externalRefund: true,
                });
            }
            return { outcome: "refunded" };
        }
        return { outcome: `ignored:${args.status}` };
    },
});

// ===========================================================================
// ADMIN
// ===========================================================================

export const adminForceReleaseEscrow = action({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        skipSourceTransaction: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; transferId?: string }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (!can(actor.role, "release_escrow")) throw new Error(denialMessage("release_escrow"));
        const result = await ctx.runAction(internal.stripe.internalReleaseOrderEscrow, {
            orderId: args.orderId,
            trigger: "admin_force",
            actorUserId: actor.idString,
            skipSourceTransaction: args.skipSourceTransaction,
        });
        return { success: result.released, transferId: result.transferId };
    },
});

export const adminRefundEscrow = action({
    args: {
        sessionToken: v.optional(v.string()),
        orderId: v.id("orders"),
        returnFeeAmountCents: v.optional(v.number()),
        reason: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ success: boolean; refundId?: string; refundCents: number }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (!can(actor.role, "refund")) throw new Error(denialMessage("refund"));
        const order = await ctx.runQuery(internal.stripe.internalGetOrderForAdminEscrow, { orderId: args.orderId });
        if (!order) throw new Error("Orden no encontrada");
        const grossCents = order.grossCents ?? Math.round(order.total * 100);
        const remaining = grossCents - (order.refundedCents ?? 0);
        const amountCents = remaining - (args.returnFeeAmountCents ?? 0);
        if (amountCents <= 0) throw new Error("El cargo de gestión no puede ser mayor o igual al monto reembolsable.");
        const result = await ctx.runAction(internal.stripe.internalRefundOrder, {
            orderId: args.orderId,
            amountCents,
            reason: args.reason ?? "admin_refund",
            source: "admin",
            actorUserId: actor.idString,
        });
        return { success: result.refunded, refundId: result.refundId, refundCents: result.refundCents };
    },
});

/** Diagnóstico: qué modos y flags ve el backend. */
export const adminGetStripeStatus = action({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (
        ctx,
        args,
    ): Promise<{ modes: StripeMode[]; mockAllowed: boolean; webhookSecrets: Record<StripeMode, number> }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (actor.role !== "admin" && actor.role !== "developer") throw new Error("No autorizado.");
        const env = stripeEnv();
        return {
            modes: env.availableModes,
            mockAllowed: isMockAllowed(),
            webhookSecrets: { test: env.webhookSecrets.test.length, live: env.webhookSecrets.live.length },
        };
    },
});
