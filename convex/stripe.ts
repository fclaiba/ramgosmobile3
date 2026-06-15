import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Stripe from "stripe";
import { requireActor } from "./authHelpers";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any,
});

/**
 * Crea un PaymentIntent en Stripe y persiste el registro en la tabla 'payments'.
 * Cumple con el requerimiento 1.1 del Plan Maestro.
 */
export const createPaymentIntent = action({
    args: {
        amountInCents: v.optional(v.number()),
        lineItems: v.optional(v.array(v.object({
            listingId: v.string(),
            sellerId: v.optional(v.string()),
            type: v.string(),
            amountInCents: v.number(),
            referralCode: v.optional(v.string()),
            quantity: v.number(),
            description: v.string(),
        }))),
        userId: v.optional(v.string()),
        sellerId: v.optional(v.string()),
        commissionRate: v.optional(v.number()),
        influencerRate: v.optional(v.number()),
        influencerId: v.optional(v.string()),
        description: v.optional(v.string()),
        metadata: v.optional(v.any()),
        tokenId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.userId);
        const userId = actor.idString;

        let totalAmountCents = args.amountInCents || 0;
        if (args.lineItems) {
            totalAmountCents = args.lineItems.reduce((sum, item) => sum + (item.amountInCents * item.quantity), 0);
        }

        if (totalAmountCents <= 0) throw new Error("El monto debe ser mayor a 0");

        try {
            // 1. Resolve influencer attribution dynamically based on cart items
            let resolvedInfluencerId = args.influencerId;
            let resolvedInfluencerRate = args.influencerRate ?? 0;
            let resolvedInfluencerAmount = Math.round(totalAmountCents * resolvedInfluencerRate);

            if (args.lineItems && args.lineItems.length > 0) {
                const attribution = await ctx.runQuery(internal.campaigns.internalResolveCartAttribution, {
                    lineItems: args.lineItems.map(i => ({
                        listingId: i.listingId,
                        sellerId: i.sellerId,
                        referralCode: i.referralCode,
                        amountInCents: i.amountInCents,
                        quantity: i.quantity,
                    })),
                });
                
                if (attribution.influencerId) {
                    resolvedInfluencerId = attribution.influencerId;
                    resolvedInfluencerRate = attribution.influencerRate;
                    resolvedInfluencerAmount = attribution.influencerAmount;
                }
            }

            // 2. Crear y opcionalmente confirmar el PaymentIntent en Stripe
            const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
                amount: totalAmountCents,
                currency: "usd",
                metadata: {
                    userId,
                    lineItemsCount: args.lineItems?.length || 0,
                },
            };

            if (args.tokenId) {
                // Si pasamos un tokenId, creamos un PaymentMethod y confirmamos directamente
                const paymentMethod = await stripe.paymentMethods.create({
                    type: "card",
                    card: {
                        token: args.tokenId,
                    },
                });
                paymentIntentParams.payment_method = paymentMethod.id;
                paymentIntentParams.confirm = true;
                paymentIntentParams.automatic_payment_methods = {
                    enabled: true,
                    allow_redirects: "never",
                };
            } else {
                paymentIntentParams.automatic_payment_methods = { enabled: true };
            }

            const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

            // 3. Persistir en la tabla 'payments' de Convex
            const ramgosCommissionRate = args.commissionRate ?? 0.12; // 12% default
            const ramgosCommission = Math.round(totalAmountCents * ramgosCommissionRate);
            const sellerNet = totalAmountCents - ramgosCommission - resolvedInfluencerAmount;

            await ctx.runMutation(internal.finance.createPaymentRecord, {
                userId,
                amount: totalAmountCents / 100,
                stripePaymentIntentId: paymentIntent.id,
                status: paymentIntent.status === "succeeded" ? "succeeded_in_escrow" : "pending",
                provider: "stripe",
                providerFee: 0, // Se actualiza por webhook si es necesario
                sellerNet: sellerNet / 100,
                ramgosCommission: ramgosCommission / 100,
                influencerAmount: resolvedInfluencerAmount / 100,
                commissionRate: ramgosCommissionRate,
                influencerRate: resolvedInfluencerRate,
                influencerId: resolvedInfluencerId,
                description: args.description || args.lineItems?.[0]?.description || "Pago Ramgos",
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                status: paymentIntent.status,
            };
        } catch (error: any) {
            console.error("[Stripe] Error al crear/confirmar PaymentIntent:", error);
            throw new Error(`Error al procesar el pago: ${error.message}`);
        }
    },
});



/**
 * Lista los métodos de pago guardados del usuario.
 */
export const listPaymentMethods = action({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, args.userId);
        
        // Obtener el usuario mediante internalQuery para acceder al stripeCustomerId
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: args.userId });
        
        if (!user || !user.stripeCustomerId) {
            return [];
        }

        try {
            const paymentMethods = await stripe.paymentMethods.list({
                customer: user.stripeCustomerId,
                type: 'card',
            });
            return paymentMethods.data;
        } catch (error: any) {
            console.error("[Stripe] Error al listar métodos de pago:", error);
            throw new Error(`Error al listar métodos de pago: ${error.message}`);
        }
    },
});

/**
 * Inicia la configuración de un nuevo método de pago (tarjeta) guardado.
 */
export const createSetupIntent = action({
    args: {},
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        const userId = actor.idString;

        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: userId });
        
        let customerId = user?.stripeCustomerId;
        if (!customerId) {
            // Si el usuario no tiene customerId, lo creamos
            const customer = await stripe.customers.create({
                metadata: { userId },
            });
            customerId = customer.id;
            // Actualizamos el usuario con el customerId
            await ctx.runMutation(internal.users.updateUserStripeCustomerId, {
                userId,
                stripeCustomerId: customerId,
            });
        }

        try {
            const setupIntent = await stripe.setupIntents.create({
                customer: customerId,
                payment_method_types: ['card'],
            });

            return {
                clientSecret: setupIntent.client_secret,
                isMock: !process.env.STRIPE_SECRET_KEY,
            };
        } catch (error: any) {
            console.error("[Stripe] Error al crear SetupIntent:", error);
            throw new Error(`Error al iniciar el alta de tarjeta: ${error.message}`);
        }
    },
});

/**
 * Elimina (desvincula) un método de pago del usuario.
 */
export const detachPaymentMethod = action({
    args: {
        paymentMethodId: v.string(),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx);
        
        try {
            await stripe.paymentMethods.detach(args.paymentMethodId);
        } catch (error: any) {
            console.error("[Stripe] Error al eliminar método de pago:", error);
            throw new Error(`Error al eliminar método de pago: ${error.message}`);
        }
    },
});

/**
 * Establece un método de pago como predeterminado (por ejemplo, para facturas de suscripciones).
 */
export const setDefaultPaymentMethod = action({
    args: {
        paymentMethodId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx);
        const userId = actor.idString;
        const user = await ctx.runQuery(internal.users.internalGetUserById, { id: userId });
        
        if (!user || !user.stripeCustomerId) {
            throw new Error("Usuario no encontrado o sin customer ID de Stripe");
        }

        try {
            await stripe.customers.update(user.stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: args.paymentMethodId,
                },
            });
        } catch (error: any) {
            console.error("[Stripe] Error al establecer método de pago predeterminado:", error);
            throw new Error(`Error al actualizar tarjeta predeterminada: ${error.message}`);
        }
    },
});

/**
 * Marca un pago como exitoso tras recibir el webhook de Stripe.
 */
export const internalMarkPaymentSucceeded = internalMutation({
    args: {
        stripePaymentIntentId: v.string(),
        orderId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.runMutation(internal.finance.updatePaymentByIntentId, {
            stripePaymentIntentId: args.stripePaymentIntentId,
            status: "succeeded_in_escrow",
            settledAt: new Date().toISOString(),
        });
    },
});

/**
 * Notifica al usuario sobre el estado de su pago (Push/Email).
 */
export const internalNotifyPaymentEvent = internalAction({
    args: {
        stripePaymentIntentId: v.string(),
        eventType: v.string(),
    },
    handler: async (ctx, args) => {
        // Lógica de notificación aquí
        console.log(`[Notification] Notificando evento ${args.eventType} para PI ${args.stripePaymentIntentId}`);
    },
});

/**
 * Crea un link de onboarding para Stripe Connect.
 * Requerido por el check 'stripe.connect.payouts' de la auditoría.
 */
export const createConnectAccountLink = action({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args): Promise<{ url: string; isMock: boolean }> => {
        // Obtenemos la cuenta de Connect del usuario
        const accountId: string | null = await ctx.runQuery(internal.connect.internalGetConnectAccountId, { userId: args.userId });
        
        if (!accountId) {
            throw new Error("El usuario no tiene una cuenta de Stripe Connect vinculada.");
        }

        // Delegamos a la acción de Connect V2 existente
        return await ctx.runAction(api.connect.createOnboardingLink, {
            actorId: args.userId,
            accountId: accountId,
        });
    },
});

/**
 * Ejecuta un payout manual hacia la cuenta bancaria vinculada en Stripe Connect.
 * Requerido por el check 'stripe.connect.payouts' de la auditoría.
 */
export const executePayout = action({
    args: {
        userId: v.id("users"),
        amountInCents: v.number(),
    },
    handler: async (ctx, args): Promise<{
        payoutId: string;
        amountInCents: number;
        currency: string;
        status: string;
        arrivalDate: number | null;
        isMock: boolean;
    }> => {
        // Delegamos a la acción de Connect V2 existente
        return await ctx.runAction(api.connect.requestInstantPayout, {
            actorId: args.userId,
            userId: args.userId,
            amountInCents: args.amountInCents,
        });
    },
});

/**
 * Libera el pago de una orden retenida en escrow.
 */
export const internalReleasePayment = internalMutation({
    args: {
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        // Encolar la acción asíncrona de liberación de fondos en Stripe
        await ctx.scheduler.runAfter(0, internal.stripe.internalReleasePaymentAction, {
            orderId: args.orderId,
        });
    },
});

/**
 * Recupera el pago exitoso de una orden y las cuentas Connect asociadas para el vendedor e influencer.
 */
export const internalGetPaymentAndAccounts = internalQuery({
    args: {
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        // Find payment associated with orderId.
        const payment = await ctx.db
            .query("payments")
            .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
            .filter((q) => q.eq(q.field("status"), "succeeded_in_escrow"))
            .first();

        if (!payment) return null;

        let sellerConnectAccountId: string | null = null;
        if (payment.sellerId) {
            const sellerIdVal = ctx.db.normalizeId("users", payment.sellerId);
            if (sellerIdVal) {
                const seller = await ctx.db.get(sellerIdVal);
                sellerConnectAccountId = seller?.stripeConnectAccountId ?? null;
            }
        }

        let influencerConnectAccountId: string | null = null;
        if (payment.influencerId) {
            const influencerIdVal = ctx.db.normalizeId("users", payment.influencerId);
            if (influencerIdVal) {
                const influencer = await ctx.db.get(influencerIdVal);
                influencerConnectAccountId = influencer?.stripeConnectAccountId ?? null;
            }
        }

        return {
            payment: {
                _id: payment._id,
                amount: payment.amount,
                sellerNet: payment.sellerNet,
                influencerAmount: payment.influencerAmount,
                sellerId: payment.sellerId,
                influencerId: payment.influencerId,
                stripePaymentIntentId: payment.stripePaymentIntentId,
            },
            sellerConnectAccountId,
            influencerConnectAccountId,
        };
    },
});

/**
 * Registra los payouts en la base de datos y marca que el escrow fue liberado en el pago.
 */
export const internalCompleteEscrowRelease = internalMutation({
    args: {
        paymentId: v.id("payments"),
        orderId: v.id("orders"),
        sellerId: v.string(),
        sellerAmountInCents: v.number(),
        sellerTransferId: v.optional(v.string()),
        influencerId: v.optional(v.string()),
        influencerAmountInCents: v.optional(v.number()),
        influencerTransferId: v.optional(v.string()),
        status: v.union(v.literal("completed"), v.literal("failed")),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const payment = await ctx.db.get(args.paymentId);
        if (payment) {
            await ctx.db.patch(args.paymentId, {
                status: args.status === "completed" ? "released_to_seller" : "failed",
                metadata: {
                    ...(payment.metadata ?? {}),
                    escrowReleased: args.status === "completed",
                    escrowReleaseError: args.error,
                    releasedAt: new Date().toISOString(),
                }
            });
        }

        // Insert payout record for seller
        await ctx.db.insert("payouts", {
            paymentId: String(args.paymentId),
            sellerId: args.sellerId,
            stripeTransferId: args.sellerTransferId,
            amountInCents: args.sellerAmountInCents,
            currency: "USD",
            status: args.status,
            executedAt: new Date().toISOString(),
            error: args.error,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        // Insert payout record for influencer if present and successful
        if (args.influencerId && args.influencerAmountInCents && args.influencerAmountInCents > 0) {
            await ctx.db.insert("payouts", {
                paymentId: String(args.paymentId),
                sellerId: args.influencerId,
                stripeTransferId: args.influencerTransferId,
                amountInCents: args.influencerAmountInCents,
                currency: "USD",
                status: args.status,
                executedAt: new Date().toISOString(),
                error: args.error,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    },
});

/**
 * Acción interna que ejecuta las transferencias reales en Stripe Connect.
 */
export const internalReleasePaymentAction = internalAction({
    args: {
        orderId: v.id("orders"),
    },
    handler: async (ctx, args) => {
        // 1. Get payment and accounts
        const data = await ctx.runQuery(internal.stripe.internalGetPaymentAndAccounts, {
            orderId: args.orderId,
        });

        if (!data) {
            console.error(`[Stripe Escrow] No se encontró pago exitoso para la orden ${args.orderId}`);
            return;
        }

        const { payment, sellerConnectAccountId, influencerConnectAccountId } = data;
        const sellerAmountInCents = Math.round(payment.sellerNet * 100);
        const influencerAmountInCents = payment.influencerAmount ? Math.round(payment.influencerAmount * 100) : 0;

        console.log(`[Stripe Escrow] Iniciando liberación para orden: ${args.orderId}, sellerNet: $${payment.sellerNet}`);

        // If in Mock Mode (no Stripe Key)
        const isMockMode = !process.env.STRIPE_SECRET_KEY;
        if (isMockMode) {
            throw new Error("Stripe secret key missing. Cannot release escrow.");
        }

        try {
            if (!sellerConnectAccountId) {
                throw new Error(`El vendedor no tiene una cuenta de Stripe Connect vinculada.`);
            }

            // 2. Perform Seller Transfer
            const sellerTransfer = await stripe.transfers.create({
                amount: sellerAmountInCents,
                currency: "usd",
                destination: sellerConnectAccountId,
                transfer_group: String(args.orderId),
                metadata: {
                    orderId: String(args.orderId),
                    paymentId: String(payment._id),
                    role: "seller",
                },
            });

            // 3. Perform Influencer Transfer if applicable
            let influencerTransferId: string | undefined;
            if (influencerAmountInCents > 0 && influencerConnectAccountId) {
                const influencerTransfer = await stripe.transfers.create({
                    amount: influencerAmountInCents,
                    currency: "usd",
                    destination: influencerConnectAccountId,
                    transfer_group: String(args.orderId),
                    metadata: {
                        orderId: String(args.orderId),
                        paymentId: String(payment._id),
                        role: "influencer",
                    },
                });
                influencerTransferId = influencerTransfer.id;
            }

            // 4. Complete database update
            await ctx.runMutation(internal.stripe.internalCompleteEscrowRelease, {
                paymentId: payment._id,
                orderId: args.orderId,
                sellerId: payment.sellerId ?? "",
                sellerAmountInCents,
                sellerTransferId: sellerTransfer.id,
                influencerId: payment.influencerId,
                influencerAmountInCents: influencerAmountInCents > 0 ? influencerAmountInCents : undefined,
                influencerTransferId,
                status: "completed",
            });

            console.log(`[Stripe Escrow] Fondos liberados con éxito para orden ${args.orderId}`);
        } catch (error: any) {
            console.error(`[Stripe Escrow Error] Falló liberación para orden ${args.orderId}:`, error);
            await ctx.runMutation(internal.stripe.internalCompleteEscrowRelease, {
                paymentId: payment._id,
                orderId: args.orderId,
                sellerId: payment.sellerId ?? "",
                sellerAmountInCents,
                influencerId: payment.influencerId,
                influencerAmountInCents: influencerAmountInCents > 0 ? influencerAmountInCents : undefined,
                status: "failed",
                error: error.message,
            });
        }
    },
});
