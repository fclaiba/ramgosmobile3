import { mutation } from "./_generated/server";

export const fixSellerIds = mutation({
    args: {},
    handler: async (ctx) => {
        // 1. Get first valid user
        const firstUser = await ctx.db.query("users").first();
        if (!firstUser) {
            console.log("No users found to act as seller!");
            return "No users found";
        }
        
        // 2. Get all listings
        const listings = await ctx.db.query("listings").collect();
        let count = 0;
        
        // 3. Update all listings to use the valid sellerId
        for (const l of listings) {
            await ctx.db.patch(l._id, { sellerId: firstUser._id });
            count++;
        }
        
        console.log(`Updated ${count} listings to use sellerId ${firstUser._id}`);
        return `Updated ${count} listings`;
    }
});
