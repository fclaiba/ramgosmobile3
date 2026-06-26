import { mutation } from "./_generated/server";

export const wipe = mutation({
    args: {},
    handler: async (ctx) => {
        let userCount = 0;
        const users = await ctx.db.query("users").collect();
        for (const u of users) {
            await ctx.db.delete(u._id);
            userCount++;
        }

        let listingCount = 0;
        const listings = await ctx.db.query("listings").collect();
        for (const l of listings) {
            await ctx.db.delete(l._id);
            listingCount++;
        }
        
        return `Base de datos reiniciada: se eliminaron ${userCount} usuarios y ${listingCount} productos.`;
    }
});
export const wipeListings = mutation({
    args: {},
    handler: async (ctx) => {
        let listingCount = 0;
        const listings = await ctx.db.query("listings").collect();
        for (const l of listings) {
            await ctx.db.delete(l._id);
            listingCount++;
        }
        return `Se eliminaron ${listingCount} productos/servicios.`;
    }
});
