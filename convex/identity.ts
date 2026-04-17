import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireActor } from "./authHelpers";

/**
 * Initializes a session for Identity Verification (KYC/KYB).
 * In production, this would make an authenticated HTTP request to 
 * Jumio/Truora/Stripe Identity and return a short-lived URL for the client WebView.
 */
export const initiateKYCSession = action({
    args: {
        actorId: v.optional(v.id("users")),
        accountType: v.union(v.literal("consumer"), v.literal("business"), v.literal("influencer")),
        // Additional metadata could be passed here (e.g. email, locale).
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.actorId);

        // Fetch API KEYS from ENV inside Convex
        const providerApiKey = process.env.KYC_PROVIDER_API_KEY;

        if (!providerApiKey) {
            console.log(`[Mock KYC] Generando una URL de simulación local para el usuario ${actor.idString}`);
            
            // Mock URL params representing the session details
            const mockSessionId = `kyc_sim_${Date.now()}_${actor.idString}`;
            const mockUrl = `https://ramgos.app/kyc-simulator-en-webview?sessionId=${mockSessionId}&type=${args.accountType}&userId=${actor.idString}`;

            return {
                success: true,
                url: mockUrl,
                sessionId: mockSessionId,
                isMock: true
            };
        }

        try {
            // Placeholder network request to a real provider
            /*
            const response = await fetch("https://api.truora.com/v1/checks", {
                method: "POST",
                headers: {
                    "Truora-API-Key": providerApiKey,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    type: "identity-verify",
                    user_authorized: "true",
                })
            });
            const data = await response.json();
            return { success: true, url: data.check.url, sessionId: data.check.check_id };
            */
            
            throw new Error("Producción real no implementada: Falta fetch logic.");
        } catch (error: any) {
            console.error("KYC Session generation failed:", error);
            throw new Error("No se pudo contactar al proveedor de identidad.");
        }
    }
});
