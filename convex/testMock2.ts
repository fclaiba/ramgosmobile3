import { query } from "./_generated/server";

export const getLedger = query({
    handler: async (ctx) => {
        return await ctx.db.query("pointsLedger").order("desc").take(10);
    }
});
