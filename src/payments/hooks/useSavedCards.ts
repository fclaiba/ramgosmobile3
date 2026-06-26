export function useSavedCards() {
    return {
        savedCards: [],
        chargeWithSavedCard: async (cardId: string, amount: number, customerId: string, currency: string): Promise<{ success: boolean; error: string; paymentIntentId?: string }> => ({ success: false, error: 'Not implemented' }),
        loadingState: {} as Record<string, boolean>,
    };
}