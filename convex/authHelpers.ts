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

// FASE 1: server-issued session tokens.
// Sessions are created at login/register (see users.ts) and stored in the
// `sessions` table. The client sends the opaque token back with each call.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export const createSession = async (ctx: any, userId: Id<"users"> | string): Promise<string> => {
  const token = `ses_${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  await ctx.db.insert("sessions", {
    userId: String(userId),
    token,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
};

const getActorFromSessionToken = async (ctx: any, token: string): Promise<AuthActor | null> => {
  if (typeof token !== "string" || !token.startsWith("ses_")) return null;

  const session = ctx.db
    ? await ctx.db
        .query("sessions")
        .withIndex("by_token", (q: any) => q.eq("token", token))
        .first()
    : await ctx.runQuery(internal.users.internalGetSessionByToken, { token });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < Date.now()) return null;

  const user = ctx.db
    ? await (async () => {
        const normalizedId = ctx.db.normalizeId("users", session.userId);
        return normalizedId ? await ctx.db.get(normalizedId) : null;
      })()
    : await ctx.runQuery(internal.users.internalGetUserById, { id: session.userId });

  return user ? mapToActor(user) : null;
};

export const requireActor = async (
  ctx: any,
  sessionToken?: string,
): Promise<AuthActor> => {
  const fromAuth = await getActorFromAuth(ctx);
  if (fromAuth) return fromAuth;

  // SECURITY (Fase 1): the second argument is a server-issued session token.
  // Raw user ids are NOT accepted anymore — identity can't be spoofed by
  // sending someone else's id.
  if (sessionToken) {
    const fromSession = await getActorFromSessionToken(ctx, sessionToken);
    if (fromSession) return fromSession;
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

export const checkRateLimit = async (ctx: any, key: string, maxAttempts: number, windowMs: number) => {
    const now = Date.now();
    const existing = await ctx.db
        .query("rateLimits")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .first();

    if (existing) {
        if (existing.blockedUntil && now < existing.blockedUntil) {
            throw new Error(`Demasiados intentos. Inténtalo de nuevo más tarde.`);
        }
        
        if (now - existing.windowStart > windowMs) {
            // Reset window
            await ctx.db.patch(existing._id, {
                attempts: 1,
                windowStart: now,
                blockedUntil: undefined,
            });
        } else {
            // Increment
            const attempts = existing.attempts + 1;
            if (attempts > maxAttempts) {
                const blockedUntil = now + windowMs; // Block for the window duration
                await ctx.db.patch(existing._id, {
                    attempts,
                    blockedUntil,
                });
                throw new Error(`Demasiados intentos. Inténtalo de nuevo más tarde.`);
            } else {
                await ctx.db.patch(existing._id, {
                    attempts,
                });
            }
        }
    } else {
        await ctx.db.insert("rateLimits", {
            key,
            attempts: 1,
            windowStart: now,
        });
    }
};
