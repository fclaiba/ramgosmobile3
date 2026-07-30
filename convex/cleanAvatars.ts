import { mutation } from './_generated/server';

export const cleanAvatars = mutation(async (ctx) => {
  const users = await ctx.db.query('users').collect();
  for (const user of users) {
    if (user.avatar && user.avatar.startsWith('blob:')) {
      await ctx.db.patch(user._id, { avatar: '' });
    }
  }
  const profiles = await ctx.db.query('socialUsers').collect();
  for (const profile of profiles) {
    if (profile.avatar && profile.avatar.startsWith('blob:')) {
      await ctx.db.patch(profile._id, { avatar: '' });
    }
  }
});
