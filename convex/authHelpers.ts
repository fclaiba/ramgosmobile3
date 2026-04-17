import { Id } from "./_generated/dataModel";

export type AuthActor = {
  id: Id<"users">;
  idString: string;
  role: string;
  email?: string;
  isTest?: boolean;
};

const mapToActor = (user: any): AuthActor => ({
  id: user._id,
  idString: String(user._id),
  role: user.role,
  email: user.email,
  isTest: user.isTest,
});

export const getActorFromAuth = async (ctx: any): Promise<AuthActor | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const tokenIdentifier = identity.tokenIdentifier ?? identity.subject;
  if (tokenIdentifier) {
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
      .first();
    if (byToken) return mapToActor(byToken);
  }

  const byEmail =
    identity.email &&
    (await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", identity.email))
      .first());

  if (byEmail) {
    if (tokenIdentifier && !byEmail.tokenIdentifier) {
      await ctx.db.patch(byEmail._id, { tokenIdentifier });
    }
    return mapToActor(byEmail);
  }

  return null;
};

export const requireActor = async (
  ctx: any,
  fallbackActorId?: Id<"users"> | string,
): Promise<AuthActor> => {
  const fromAuth = await getActorFromAuth(ctx);
  if (fromAuth) return fromAuth;

  if (!fallbackActorId) {
    throw new Error("No autorizado.");
  }
  const actor = await ctx.db.get(fallbackActorId);
  if (!actor) throw new Error("No autorizado.");
  return mapToActor(actor);
};

export const assertAdminOrDeveloper = (actor: AuthActor) => {
  if (actor.role !== "admin" && actor.role !== "developer") {
    throw new Error("No autorizado.");
  }
};

export const assertSelfOrAdmin = (actor: AuthActor, targetUserId: string) => {
  const isSelf = actor.idString === String(targetUserId);
  const isAdmin = actor.role === "admin" || actor.role === "developer";
  if (!isSelf && !isAdmin) {
    throw new Error("No autorizado.");
  }
};
