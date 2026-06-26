import { mutation } from "./_generated/server";

export const run = mutation({
    args: {},
    handler: async (ctx) => {
        let count = 0;
        const users = await ctx.db.query("users").collect();
        for (const u of users) {
            if (u.kycStatus === "verified") {
                await ctx.db.patch(u._id, { kycStatus: "approved" });
                count++;
            }
        }
        return `Migrados ${count} usuarios de 'verified' a 'approved'`;
    }
});
