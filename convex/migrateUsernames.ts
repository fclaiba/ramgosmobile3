import { internalQuery } from "./_generated/server";

export const dumpUsernames = internalQuery({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").take(10);
        return users.map(u => ({
            id: u._id,
            name: u.name,
            nickname: u.nickname,
            username: u.username
        }));
    }
});
