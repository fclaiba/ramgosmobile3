import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

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
    let byToken;
    if (ctx.db) {
      byToken = await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
        .first();
    } else {
      byToken = await ctx.runQuery(internal.users.internalGetUserByToken, { tokenIdentifier });
    }
    if (byToken) return mapToActor(byToken);
  }

  const byEmail =
    identity.email &&
    (ctx.db
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q: any) => q.eq("email", identity.email))
          .first()
      : await ctx.runQuery(internal.users.internalGetUserByEmail, { email: identity.email }));

  if (byEmail) {
    if (tokenIdentifier && !byEmail.tokenIdentifier) {
      if (ctx.db) {
        await ctx.db.patch(byEmail._id, { tokenIdentifier });
      } else {
        await ctx.runMutation(internal.users.internalPatchUserToken, { userId: byEmail._id, tokenIdentifier });
      }
    }
    return mapToActor(byEmail);
  }

  return null;
};

export const requireActor = async (
  ctx: any,
  _unsafeFallbackActorId?: Id<"users"> | string,
): Promise<AuthActor> => {
  const fromAuth = await getActorFromAuth(ctx);
  if (fromAuth) return fromAuth;

  if (_unsafeFallbackActorId) {
    if (ctx.db && typeof ctx.db.normalizeId === 'function') {
      const normalizedId = ctx.db.normalizeId("users", _unsafeFallbackActorId);
      if (normalizedId) {
          const user = await ctx.db.get(normalizedId);
          if (user) return mapToActor(user);
      }
    } else if (ctx.runQuery) {
      const user = await ctx.runQuery(internal.users.internalGetUserById, { id: _unsafeFallbackActorId });
      if (user) return mapToActor(user);
    }
  }

  throw new Error("Sesión no válida o expirada. Por favor, inicie sesión nuevamente.");
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
