import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireActor } from "./authHelpers";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const allowKycMock = process.env.ALLOW_KYC_MOCK === "true";
const isMockMode = !stripeKey || allowKycMock;

const stripe = new Stripe(stripeKey ?? "sk_test_mock_fallback", {
    apiVersion: "2024-04-10" as any,
});

/**
 * Initializes a KYC/KYB session using Stripe Identity.
 *
 * Production:  requires STRIPE_SECRET_KEY in Convex env.
 * Development: set ALLOW_KYC_MOCK=true in Convex env to get a simulator URL.
 *
 * Webhook: Stripe sends `identity.verification_session.verified` /
 *          `identity.verification_session.requires_input` to /stripe-webhook
 *          (add those events in the Stripe dashboard).
 */
export const initiateKYCSession = action({
    args: {
        actorId: v.optional(v.id("users")),
        accountType: v.union(
            v.literal("consumer"),
            v.literal("business"),
            v.literal("influencer"),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);

        if (isMockMode) {
            if (!allowKycMock && !stripeKey) {
                throw new Error(
                    "KYC no configurado. Define STRIPE_SECRET_KEY en Convex o habilita ALLOW_KYC_MOCK=true para desarrollo.",
                );
            }
            console.log(`[Mock KYC] Generating simulator URL for user ${actor.idString}`);
            const mockSessionId = `kyc_sim_${Date.now()}_${actor.idString}`;
            const mockUrl = `https://ramgos.app/kyc-simulator-en-webview?sessionId=${mockSessionId}&type=${args.accountType}&userId=${actor.idString}`;
            return {
                success: true,
                url: mockUrl,
                sessionId: mockSessionId,
                isMock: true,
            };
        }

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
