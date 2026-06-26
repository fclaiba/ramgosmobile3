import { query } from "./_generated/server";

export default query(async (ctx) => {
    const listings = await ctx.db.query("listings").collect();
    const users = await ctx.db.query("users").collect();
    
    return {
        listingsCount: listings.length,
        usersCount: users.length,
        listings: listings.map(l => ({ id: l._id, title: l.title, sellerId: l.sellerId, status: l.status, loc: l.location })),
        users: users.map(u => ({ id: u._id, email: u.email, role: u.role, kycStatus: u.kycStatus }))
    };
});
