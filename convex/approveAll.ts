import { internalMutation } from './_generated/server';

export const run = internalMutation({
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    for (const u of users) {
      const isTestUser = u.email.endsWith('@ramgos.com') || u.email.endsWith('@test.com');
      await ctx.db.patch(u._id, { kycStatus: 'approved', ...(isTestUser ? { isTest: true } : {}) });
    }
    return 'Approved ' + users.length + ' users';
  }
});
