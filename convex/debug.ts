import { query } from "./_generated/server";

export const getDebugState = query({
    handler: async (ctx) => {
        const economyStates = await ctx.db.query("economyState").collect();
        const payments = await ctx.db.query("payments").collect();
        
        return {
            economyStates: economyStates.map(e => ({
                userId: e.userId,
                challenges: e.rewardsState?.challenges,
                points: e.rewardsState?.points
            })),
            payments: payments.map(p => ({
                id: p._id,
                stripePaymentIntentId: p.stripePaymentIntentId,
                status: p.status,
                amount: p.amount
            }))
        };
    }
});
