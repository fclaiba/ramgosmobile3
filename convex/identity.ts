import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireActor } from "./authHelpers";
import { getStripe, hasStripeKey, primaryMode } from "./stripeClient";

/**
 * Initializes a KYC/KYB session using Stripe Identity.
 *
 * Production:  requires STRIPE_SECRET_KEY in Convex env. *
 * Webhook: Stripe sends `identity.verification_session.verified` /
 *          `identity.verification_session.requires_input` to /stripe-webhook
 *        * We use Stripe Identity to create a VerificationSession and return its url.
 * NOTE: The KYC mock has been explicitly removed to enforce production-only behavior.
 */
export const startKyc = action({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        accountType: v.union(
            v.literal("consumer"),
            v.literal("business"),
            v.literal("influencer"),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        if (!hasStripeKey(primaryMode())) {
            throw new Error(
                "KYC no configurado. Define STRIPE_SECRET_KEY en Convex.",
            );
        }
        const stripe = getStripe(primaryMode());
        try {
            // Map Ramgos account type to Stripe Identity required document types.
            // 'driving_license' | 'passport' | 'id_card' — all are valid for consumers.
            // For business/influencer, also request proof of address.
            const verificationSession = await stripe.identity.verificationSessions.create({
                type: "document",
                metadata: {
                    userId: actor.idString,
                    accountType: args.accountType,
                },
                options: {
                    document: {
                        // Allow all common document types
                        allowed_types: ["driving_license", "passport", "id_card"],
                        require_id_number: args.accountType === "business",
                        require_live_capture: true,
                        require_matching_selfie: true,
                    },
                },
            });

            return {
                success: true,
                url: verificationSession.url,
                sessionId: verificationSession.id,
                isMock: false,
            };
        } catch (error: any) {
            console.error("Stripe Identity session error:", error);
            throw new Error(`No se pudo iniciar la verificación de identidad: ${error.message}`);
        }
    },
});
