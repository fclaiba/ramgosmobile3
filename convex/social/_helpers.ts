// Shared utilities for the social module — kept apart from `social.ts` so
// they can be unit-tested in isolation and imported by future split files
// (e.g. `social/feed.ts`, `social/dm.ts`).

import { ConvexError } from "convex/values";
import { AuthActor, checkRateLimit, requireActor } from "../authHelpers";

/**
 * Presupuestos de escritura social, por hora y por usuario. No son
 * anti-DoS: son anti-spam y anti-granja de puntos. Los números están
 * holgados respecto del uso humano real y ajustados respecto del automatizado.
 */
export const SOCIAL_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
    createPost: { max: 10, windowMs: 60 * 60 * 1000 },
    addComment: { max: 40, windowMs: 60 * 60 * 1000 },
    toggleLike: { max: 200, windowMs: 60 * 60 * 1000 },
    follow: { max: 100, windowMs: 60 * 60 * 1000 },
    createStory: { max: 20, windowMs: 60 * 60 * 1000 },
    report: { max: 20, windowMs: 24 * 60 * 60 * 1000 },
    createCommunity: { max: 5, windowMs: 24 * 60 * 60 * 1000 },
    joinCommunity: { max: 30, windowMs: 60 * 60 * 1000 },
    createInvite: { max: 20, windowMs: 24 * 60 * 60 * 1000 },
    submitJoinRequest: { max: 20, windowMs: 24 * 60 * 60 * 1000 },
    redeemInvite: { max: 30, windowMs: 60 * 60 * 1000 },
    // Los DMs NO están acá: `social/dm.ts` ya tiene su propio presupuesto
    // (`dm:send`, 60/min) aplicado dentro de `deliverMessage`, que cubre
    // todos los caminos de envío (directo, compartir listing, compartir post).
};

export const assertSocialRate = async (
    ctx: any,
    actor: AuthActor,
    action: keyof typeof SOCIAL_RATE_LIMITS | string,
): Promise<void> => {
    const budget = SOCIAL_RATE_LIMITS[action];
    if (!budget) return;
    await checkRateLimit(ctx, `social:${action}:${actor.idString}`, budget.max, budget.windowMs);
};

/**
 * Puerta única del módulo social.
 *
 * `requireActor` ya rechaza cuentas baneadas (ban total). Acá se suma la
 * moderación parcial, que es lo que la cola de reportes necesita para no
 * tener que elegir entre "no hacer nada" y "banear la cuenta entera":
 *
 *   - `suspended` + `socialSuspendedUntil` futuro ⇒ no puede escribir nada
 *     social, pero sigue pudiendo comprar, cobrar y usar el resto de la app.
 *   - `shadowbanned` ⇒ **no lanza**. Escribe normal y ve su propio contenido;
 *     es el feed el que lo esconde de terceros. Si lanzara, el shadowban
 *     dejaría de ser shadow.
 *
 * `opts.write: true` aplica además el presupuesto de escritura.
 */
export const assertSocialActor = async (
    ctx: any,
    sessionToken?: string,
    opts?: { write?: keyof typeof SOCIAL_RATE_LIMITS | string },
): Promise<AuthActor> => {
    const actor = await requireActor(ctx, sessionToken);

    if (actor.socialStatus === 'suspended') {
        const until = actor.socialSuspendedUntil;
        const stillActive = !until || new Date(until).getTime() > Date.now();
        if (stillActive) {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'SOCIAL_SUSPENDED',
                until: until ?? null,
            });
        }
    }

    if (opts?.write) await assertSocialRate(ctx, actor, opts.write);

    return actor;
};

/** `true` si el contenido de este autor sólo debe verlo él mismo. */
export const isShadowbanned = (actor: AuthActor | null | undefined): boolean =>
    actor?.socialStatus === 'shadowbanned';

/**
 * Versión DEGRADANTE de `assertSocialActor`, para queries.
 *
 * Convención del módulo (documentada en `social/dm.ts`): las **queries
 * degradan** y las **mutations tiran**. El motivo no es estético:
 * `useQuery` re-lanza el error durante el render, así que una query que
 * tira con un token vencido —o con una cuenta baneada, desde la Fase 0—
 * atraviesa el árbol y la agarra el `CrashHandler`, tumbando la app entera
 * en vez de mostrar una lista vacía.
 *
 * Devuelve `null` en vez de lanzar; el llamador decide con qué valor vacío
 * responder (`[]`, `{ items: [], nextCursor: null }`, `null`…).
 */
export const socialViewer = async (
    ctx: any,
    sessionToken?: string,
): Promise<AuthActor | null> => {
    try {
        return await assertSocialActor(ctx, sessionToken);
    } catch {
        return null;
    }
};

// Bloqueo real (antes era un stub no-op). Dos point-reads sobre `by_pair`:
// el bloqueo corta en las dos direcciones, así que da igual quién bloqueó a
// quién — ninguno de los dos puede escribirle al otro.
export const assertNotBlocked = async (
    ctx: any,
    byUserId: string,
    targetUserId: string,
): Promise<void> => {
    if (byUserId === targetUserId) return;
    const [aToB, bToA] = await Promise.all([
        ctx.db
            .query('socialBlocks')
            .withIndex('by_pair', (q: any) =>
                q.eq('blockerUserId', byUserId).eq('blockedUserId', targetUserId),
            )
            .first(),
        ctx.db
            .query('socialBlocks')
            .withIndex('by_pair', (q: any) =>
                q.eq('blockerUserId', targetUserId).eq('blockedUserId', byUserId),
            )
            .first(),
    ]);
    if (aToB || bToA) {
        throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'No es posible enviar mensajes a esta cuenta.',
        });
    }
};

export const isBlockedBetween = async (
    ctx: any,
    a: string,
    b: string,
): Promise<boolean> => {
    try {
        await assertNotBlocked(ctx, a, b);
        return false;
    } catch {
        return true;
    }
};

// Cursor-based pagination helper used across feed/comments/messages queries.
// Convex queries accept a string cursor; here we standardize the shape so
// the frontend can paginate every social list with the same UX.
export type PageResult<T> = {
    items: T[];
    nextCursor: string | null;
};

export const paginateQuery = async <T>(
    queryBuilder: any,
    cursor: string | null | undefined,
    limit: number,
): Promise<PageResult<T>> => {
    const safeLimit = Math.max(1, Math.min(limit ?? 20, 100));
    const result = await queryBuilder.paginate({
        cursor: cursor ?? null,
        numItems: safeLimit,
    });
    return {
        items: result.page as T[],
        nextCursor: result.isDone ? null : (result.continueCursor as string | null),
    };
};

/* ─── Comunidades ──────────────────────────────────────────────────── */

// Las reglas puras (política de ingreso, validez de invitación, slugs) viven
// en `_communityPolicy.ts`, que no importa nada de Convex y por eso se testea
// con Jest liso. Acá sólo queda lo que necesita `ctx`.
export type { CommunityJoinPolicy } from './_communityPolicy';
export { resolveJoinPolicy } from './_communityPolicy';

/**
 * Ajusta `memberCount` en un solo lugar.
 *
 * Estaba parcheado a mano en cinco sitios distintos de `communities.ts`, cada
 * uno con su propio `Math.max(0, ...)` (o sin él). Además deja `lastActivityAt`
 * fresco, que es lo que ordena el directorio.
 */
export const adjustMemberCount = async (ctx: any, communityId: string, delta: number) => {
    const id = ctx.db.normalizeId('commercialCommunities', communityId);
    if (!id) return;
    const community = await ctx.db.get(id);
    if (!community) return;
    await ctx.db.patch(id, {
        memberCount: Math.max(0, (community.memberCount ?? 0) + delta),
        updatedAt: new Date().toISOString(),
    });
};

/**
 * Exige que el actor sea owner o admin ACTIVO de la comunidad.
 *
 * Vive acá y no en `communities.ts` porque `communityAccess.ts` necesita la
 * misma puerta, y los módulos de Convex sólo pueden exportar funciones
 * registrables — este archivo empieza con `_`, así que Convex no lo registra y
 * puede exportar helpers comunes.
 */
export const requireCommunityAdmin = async (ctx: any, communityId: string, userId: string) => {
    const membership = await ctx.db
        .query('communityMembers')
        .withIndex('by_community_user', (q: any) =>
            q.eq('communityId', communityId).eq('userId', userId),
        )
        .first();
    if (
        !membership ||
        membership.status !== 'active' ||
        (membership.role !== 'owner' && membership.role !== 'admin')
    ) {
        throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos admin de esta comunidad.' });
    }
    return membership;
};

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Token de invitación url-safe.
 *
 * Sin caracteres ambiguos (I/l/1, O/0) porque estos links se dictan y se
 * tipean a mano.
 *
 * 10 caracteres sobre un alfabeto de 57 son ~58 bits (57^10 ≈ 3,6·10¹⁷). Eran
 * 24 (~140 bits), que es criptográficamente más fuerte pero producía un link
 * impronunciable — y el requisito real no es resistir un ataque offline sino
 * no ser adivinable online, donde además pega el rate limit de `redeemInvite`
 * (30/hora). A cambio, el link entra en un mensaje sin ocupar dos renglones.
 */
export const newInviteToken = (length = 10): string => {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    return out;
};

// Throttle helper: returns true if a "similar" notification was already
// dispatched within `windowMs` ms for the same (userId, category, key).
// Used in social to avoid spamming an author with one push per like.
export const wasNotifiedRecently = async (
    ctx: any,
    userId: string,
    category: string,
    titleSubstring: string,
    windowMs: number,
): Promise<boolean> => {
    try {
        const cutoff = new Date(Date.now() - windowMs).toISOString();
        const recent = await ctx.db
            .query('pushDeliveries')
            .withIndex('by_user_category', (q: any) => q.eq('userId', userId).eq('category', category))
            .filter((q: any) => q.gt(q.field('sentAt'), cutoff))
            .collect();
        return recent.some((r: any) => r.title?.includes(titleSubstring));
    } catch (e) {
        return false;
    }
};
