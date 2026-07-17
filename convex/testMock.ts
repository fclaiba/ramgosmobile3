import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const testPoints = mutation({
    handler: async (ctx) => {
        // Find user
        const state = await ctx.db.query("economyState").first();
        if (!state) return "No state";
        
        // Award points
        await ctx.db.patch(state._id, {
            rewardsState: {
                ...state.rewardsState,
                challenges: {
                    ...state.rewardsState?.challenges,
                    weekly_purchase: {
                        current: 1,
                        claimed: false,
                        weekKey: "2026-W29"
                    }
                }
            }
        });
        return "Patched!";
    }
});
