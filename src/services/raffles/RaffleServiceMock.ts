export class RaffleServiceMock {
    static calculateChances(baseEntries: number, isPro: boolean): number {
        if (isPro) {
            console.log(`[RaffleSystem] PRO User detected. Doubling chances from ${baseEntries} to ${baseEntries * 2}`);
            return baseEntries * 2;
        }
        return baseEntries;
    }

    static async enterRaffle(userId: string, raffleId: string, subscriptionTier: string): Promise<{ success: boolean; entries: number }> {
        // Mock backend call
        return new Promise((resolve) => {
            setTimeout(() => {
                const base = 1;
                const finalEntries = this.calculateChances(base, subscriptionTier === 'pro' || subscriptionTier === 'business');
                resolve({ success: true, entries: finalEntries });
            }, 800);
        });
    }
}
