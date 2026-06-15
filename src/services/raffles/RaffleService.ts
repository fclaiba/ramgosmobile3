import { api } from "../../../convex/_generated/api";

export class RaffleService {
    /**
     * Calculates the chances / entries based on subscription tier.
     */
    static calculateChances(baseEntries: number, isPro: boolean): number {
        if (isPro) {
            console.log(`[RaffleSystem] PRO User detected. Doubling chances from ${baseEntries} to ${baseEntries * 2}`);
            return baseEntries * 2;
        }
        return baseEntries;
    }

    /**
     * Enters a raffle by registering points participation on the backend.
     */
    static async enterRaffle(
        convexClient: any, 
        userId: string, 
        raffleId: string, 
        subscriptionTier: string
    ): Promise<{ success: boolean; entries: number }> {
        const base = 1;
        const finalEntries = this.calculateChances(base, subscriptionTier === 'pro' || subscriptionTier === 'business');
        
        try {
            // Apply a "challenge" or "game" points event in convex to represent the raffle entry
            await convexClient.mutation(api.economy.applyPointsEvent, {
                userId,
                eventKey: `raffle_entry_${raffleId}_${Date.now()}`,
                type: "challenge",
                source: "game",
                amount: finalEntries, // we log entries as points or simply track participation
                description: `Entered raffle ${raffleId} with ${finalEntries} entries`,
            });
            return { success: true, entries: finalEntries };
        } catch (error) {
            console.error("[RaffleService] Error entering raffle", error);
            return { success: false, entries: 0 };
        }
    }
}
