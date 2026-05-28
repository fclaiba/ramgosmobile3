import { v } from "convex/values";
import { action, httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any,
});

/**
 * Endpoint para Webhooks de Stripe.
 * Configura este URL en tu Dashboard de Stripe: 
 * https://<tu-deployment>.convex.site/stripe_webhook
 */
export const webhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  try {
    // En un entorno de producción, aquí validaríamos la firma con stripe.webhooks.constructEvent
    // Por ahora, procesamos el evento directamente para desarrollo.
    const event = JSON.parse(body);

    console.log(`[Stripe Webhook] Recibido evento: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const orderId = session.metadata?.orderId;
        
        if (userId && orderId) {
          console.log(`[Stripe Webhook] Pago completado para pedido: ${orderId}`);
          // Aquí llamaríamos a una mutación interna para marcar el pedido como pagado
          // await ctx.runMutation(internal.orders.markAsPaid, { orderId });
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object;
        console.log(`[Stripe Webhook] Cuenta de vendedor actualizada: ${account.id}`);
        // Actualizar el estado de onboarding del negocio en nuestra base de datos
        break;
      }

      default:
        console.log(`[Stripe Webhook] Evento no manejado: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[Stripe Webhook Error] ${err}`);
    return new Response("Webhook Error", { status: 400 });
  }
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
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("No autenticado");
        const userId = identity.subject;

        let totalAmountCents = args.amountInCents || 0;
        if (args.lineItems) {
            totalAmountCents = args.lineItems.reduce((sum, item) => sum + (item.amountInCents * item.quantity), 0);
        }

        if (totalAmountCents <= 0) throw new Error("El monto debe ser mayor a 0");

        try {
            // 1. Crear el PaymentIntent en Stripe
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalAmountCents,
                currency: "usd",
                automatic_payment_methods: { enabled: true },
                metadata: {
                    userId,
                    // Si hay varios items, guardamos una referencia resumida
                    lineItemsCount: args.lineItems?.length || 0,
                },
            });

            // 2. Persistir en la tabla 'payments' de Convex (REQUERIMIENTO 1.1)
            // Calculamos comisiones básicas (esto debería ser más complejo en producción)
            const ramgosCommissionRate = 0.12; // 12% default
            const ramgosCommission = Math.round(totalAmountCents * ramgosCommissionRate);
            const sellerNet = totalAmountCents - ramgosCommission;

            await ctx.runMutation(internal.finance.createPaymentRecord, {
                userId,
                amount: totalAmountCents / 100,
                stripePaymentIntentId: paymentIntent.id,
                status: "pending",
                provider: "stripe",
                providerFee: 0, // Se actualiza por webhook si es necesario
                sellerNet: sellerNet / 100,
                ramgosCommission: ramgosCommission / 100,
                influencerAmount: 0,
                commissionRate: ramgosCommissionRate,
                influencerRate: 0,
                description: args.lineItems?.[0]?.description || "Pago Ramgos",
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            };
        } catch (error: any) {
            console.error("[Stripe] Error al crear PaymentIntent:", error);
            throw new Error(`Error al procesar el pago: ${error.message}`);
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
            status: "succeeded",
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
    handler: async (ctx, args) => {
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
    handler: async (ctx, args) => {
        // Delegamos a la acción de Connect V2 existente
        return await ctx.runAction(api.connect.requestInstantPayout, {
            actorId: args.userId,
            userId: args.userId,
            amountInCents: args.amountInCents,
        });
    },
});
