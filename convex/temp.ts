import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const makeAdmin = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
    if (!user) throw new Error("Usuario no encontrado");
    await ctx.db.patch(user._id, { role: "admin" as any });
    return { success: true, message: `Usuario ${args.email} ahora es admin.` };
  },
});
