import { ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// Errores de auth con código legible por máquina: el cliente distingue
// "tu sesión murió" (UNAUTHENTICATED → deslogueo) de "no te corresponde"
// (FORBIDDEN → error a secas, sin tocar la sesión). El texto no cambia,
// así que cualquier match por string viejo sigue funcionando.
export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";
export type AuthErrorData = { code: AuthErrorCode; message: string };

export const authError = (code: AuthErrorCode, message: string) =>
  new ConvexError<AuthErrorData>({ code, message });

export type AuthActor = {
  id: Id<"users">;
  idString: string;
  role: string;
  email?: string;
  isTest?: boolean;
  /** Ban total de la cuenta. Lo chequea `requireActor`. */
  isBanned?: boolean;
  /** Suspensión parcial: sólo corta la red social, no la app entera. */
  socialStatus?: "active" | "shadowbanned" | "suspended";
  socialSuspendedUntil?: string;
};

// Estos tres campos viven en `users` y no en una tabla aparte a propósito:
// `mapToActor` ya lee ese documento, así que chequear el estado de moderación
// en cada mutation cuesta CERO lecturas extra.
const mapToActor = (user: any): AuthActor => ({
  id: user._id,
  idString: String(user._id),
  role: user.role,
  email: user.email,
  isTest: user.isTest,
  isBanned: user.isBanned === true,
  socialStatus: user.socialStatus,
  socialSuspendedUntil: user.socialSuspendedUntil,
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

export type ActorOpts = {
  /**
   * Deja pasar cuentas baneadas. Sólo para los endpoints que la cuenta
   * baneada TIENE que poder usar: ver su propio estado, cerrar sesión,
   * y contactar soporte. Todo lo demás usa el default seguro.
   */
  allowBanned?: boolean;
};

/**
 * Resolución de identidad.
 *
 * El ban se chequea acá y no en cada camino por separado. `banUser` revoca
 * las filas de `sessions`, pero eso **no alcanza**: `getActorFromAuth`
 * resuelve por `ctx.auth.getUserIdentity()` contra `users.by_tokenIdentifier`
 * y nunca toca la tabla `sessions`, así que un baneado que entró por OAuth
 * no tenía nada que revocarle. Ese era el bypass.
 */
export const getActorOrNull = async (
  ctx: any,
  sessionToken?: string,
  opts?: ActorOpts,
): Promise<AuthActor | null> => {
  let actor = await getActorFromAuth(ctx);

  if (!actor && sessionToken) {
    actor = await getActorFromSessionToken(ctx, sessionToken);
  }

  if (!actor) return null;
  if (actor.isBanned && opts?.allowBanned !== true) return null;

  return actor;
};

export const requireActor = async (
  ctx: any,
  sessionToken?: string,
  opts?: ActorOpts,
): Promise<AuthActor> => {
  // Se pide el actor crudo para poder distinguir "no hay sesión" de
  // "hay sesión pero la cuenta está baneada" — errores distintos en el
  // cliente: el primero desloguea, el segundo manda a BannedUserScreen.
  const actor = await getActorOrNull(ctx, sessionToken, { allowBanned: true });

  if (!actor) {
    throw authError(
      "UNAUTHENTICATED",
      "Sesión no válida o expirada. Por favor, inicie sesión nuevamente.",
    );
  }

  if (actor.isBanned && opts?.allowBanned !== true) {
    throw authError("FORBIDDEN", "ACCOUNT_BANNED");
  }

  return actor;
};

/**
 * Corta TODAS las sesiones vivas de un usuario. Estaba embebido dentro de
 * `users.banUser`, así que cualquier otro camino que seteara `isBanned`
 * (por ejemplo el admin vía `updateUser` → `writeUserIdentity`) dejaba las
 * sesiones abiertas. Ahora hay un solo lugar.
 */
export const revokeAllSessions = async (ctx: any, userId: Id<"users"> | string) => {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_user", (q: any) => q.eq("userId", String(userId)))
    .collect();
  const now = new Date().toISOString();
  let revoked = 0;
  for (const session of sessions) {
    if (!session.revokedAt) {
      await ctx.db.patch(session._id, { revokedAt: now });
      revoked += 1;
    }
  }
  return revoked;
};

export const assertAdminOrDeveloper = (actor: AuthActor) => {
  if (actor.role !== "admin" && actor.role !== "developer") {
    throw authError("FORBIDDEN", "No autorizado.");
  }
};

export const assertSelfOrAdmin = (actor: AuthActor, targetUserId: string) => {
  const isSelf = actor.idString === String(targetUserId);
  const isAdmin = actor.role === "admin" || actor.role === "developer";
  if (!isSelf && !isAdmin) {
    throw authError("FORBIDDEN", "No autorizado.");
  }
};

/**
 * Antes esto tiraba un `Error` con un string suelto, indistinguible en el
 * cliente de cualquier otra falla. Ahora es un ConvexError con código, para
 * que la UI pueda mostrar "esperá un momento" en vez de "algo salió mal".
 */
export const rateLimitError = () =>
  new ConvexError({
    code: "RATE_LIMITED",
    message: "Demasiados intentos. Inténtalo de nuevo más tarde.",
  });

export const checkRateLimit = async (ctx: any, key: string, maxAttempts: number, windowMs: number) => {
    const now = Date.now();
    const existing = await ctx.db
        .query("rateLimits")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .first();

    if (existing) {
        if (existing.blockedUntil && now < existing.blockedUntil) {
            throw rateLimitError();
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
                throw rateLimitError();
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
