/**
 * Directorio de personas: buscar usuarios de verdad por su @handle.
 *
 * Por qué vive sobre `users` y no sobre `socialUsers`: toda persona ES una
 * fila de `users` por construcción, mientras que `socialUsers` sólo se creaba
 * de forma perezosa al postear, seguir a alguien o guardar el perfil social.
 * Quien nunca hizo ninguna de esas tres cosas era invisible para el buscador.
 * Backfillear `socialUsers` habría exigido además un invariante permanente
 * ("nunca insertar un user sin insertar un socialUser") — que es exactamente
 * el invariante que ya se había roto. Sobre `users` no hay nada que romper.
 *
 * Por qué DOS estrategias de búsqueda unidas:
 *
 *  - Rama A, escaneo por prefijo sobre `by_username`. Es la que hace que
 *    escribir "fkl" encuentre a `fklaisse`. El índice de texto completo NO
 *    puede: tokeniza por palabras y sólo hace prefijo sobre el último token,
 *    así que un prefijo que no arranca una palabra nunca matchea.
 *  - Rama B, `search_directory` sobre el corpus denormalizado. Es la que
 *    encuentra por nombre para mostrar, que la rama A no ve.
 *
 * Las queries DEGRADAN (devuelven `[]` con sesión inválida) porque `useQuery`
 * re-lanza en render y un token vencido no puede tumbar la pantalla.
 */

import { v } from 'convex/values';
import { query, internalQuery } from './_generated/server';
import { getActorOrNull } from './authHelpers';
import { normalizeSearchTerm } from './users/identity';
import { toUserCard, socialProfileOf, userCardValidator, type UserCardDto } from './userCard';

const MIN_TERM_LENGTH = 2;
const MAX_LIMIT = 50;

/** Los ids que el actor no puede ver, en cualquiera de las dos direcciones. */
const blockedIdsFor = async (ctx: any, actorId: string): Promise<Set<string>> => {
    // Dos queries en total, no dos por resultado: llamar a `isBlockedBetween`
    // por fila serían 2 lecturas × 50 candidatos.
    const [iBlocked, blockedMe] = await Promise.all([
        ctx.db
            .query('socialBlocks')
            .withIndex('by_blocker', (q: any) => q.eq('blockerUserId', actorId))
            .take(500),
        ctx.db
            .query('socialBlocks')
            .withIndex('by_blocked', (q: any) => q.eq('blockedUserId', actorId))
            .take(500),
    ]);
    const set = new Set<string>();
    for (const b of iBlocked) set.add(b.blockedUserId);
    for (const b of blockedMe) set.add(b.blockerUserId);
    return set;
};

export async function searchDirectoryImpl(
    ctx: any,
    sessionToken: string | undefined,
    rawTerm: string,
    cap: number,
    opts?: { excludeSelf?: boolean; role?: string },
): Promise<UserCardDto[]> {
    const actor = await getActorOrNull(ctx, sessionToken);
    if (!actor) return [];

    const term = normalizeSearchTerm(rawTerm);
    if (term.length < MIN_TERM_LENGTH) return [];
    const limit = Math.max(1, Math.min(cap, MAX_LIMIT));

    const merged: any[] = [];
    const seen = new Set<string>();
    const push = (u: any) => {
        const id = String(u._id);
        if (seen.has(id)) return;
        seen.add(id);
        merged.push(u);
    };

    // Rama A — prefijo exacto de handle. Sólo tiene sentido sin espacios.
    if (!term.includes(' ')) {
        const byPrefix = await ctx.db
            .query('users')
            .withIndex('by_username', (q: any) =>
                q.gte('username', term).lt('username', `${term}\uffff`),
            )
            .take(limit * 2);
        // Coincidencia exacta primero, después el resto de los prefijos.
        for (const u of byPrefix) if (u.username === term) push(u);
        for (const u of byPrefix) push(u);
    }

    // Rama B — texto completo sobre el corpus denormalizado.
    const byText = await ctx.db
        .query('users')
        .withSearchIndex('search_directory', (q: any) =>
            opts?.role
                ? q.search('searchText', term).eq('role', opts.role)
                : q.search('searchText', term),
        )
        .take(limit * 2);
    for (const u of byText) push(u);

    const blocked = await blockedIdsFor(ctx, actor.idString);
    const visible = merged.filter((u) => {
        const id = String(u._id);
        if (u.isBanned === true || u.directoryHidden === true) return false;
        if (opts?.excludeSelf && id === actor.idString) return false;
        if (blocked.has(id)) return false;
        if (opts?.role && u.role !== opts.role) return false;
        return true;
    });

    return await Promise.all(
        visible.slice(0, limit).map(async (u) => toUserCard(ctx, u, await socialProfileOf(ctx, String(u._id)))),
    );
}

/** Buscador de personas. Encuentra por @handle y por nombre. */
export const search = query({
    args: {
        sessionToken: v.optional(v.string()),
        term: v.string(),
        limit: v.optional(v.number()),
        excludeSelf: v.optional(v.boolean()),
        role: v.optional(v.string()),
    },
    returns: v.array(userCardValidator),
    handler: async (ctx, args): Promise<UserCardDto[]> =>
        await searchDirectoryImpl(ctx, args.sessionToken, args.term, args.limit ?? 20, {
            excludeSelf: args.excludeSelf !== false,
            role: args.role,
        }),
});

/**
 * Resolución pública de un @handle (deep links, perfiles compartidos).
 * Devuelve una tarjeta, jamás el documento del usuario.
 */
export const getByHandle = query({
    args: { handle: v.string() },
    returns: v.union(userCardValidator, v.null()),
    handler: async (ctx, args): Promise<UserCardDto | null> => {
        const handle = normalizeSearchTerm(args.handle).replace(/ /g, '');
        if (!handle) return null;
        const user = await ctx.db
            .query('users')
            .withIndex('by_username', (q: any) => q.eq('username', handle))
            .first();
        if (!user || user.isBanned === true || user.directoryHidden === true) return null;
        return await toUserCard(ctx, user, await socialProfileOf(ctx, String(user._id)));
    },
});

/**
 * Sondeo por CLI. `search` exige un `sessionToken` válido, así que sin esto
 * no se puede verificar el buscador con `npx convex run`.
 */
export const searchDebug = internalQuery({
    args: { term: v.string(), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const term = normalizeSearchTerm(args.term);
        if (term.length < MIN_TERM_LENGTH) return { term, prefix: [], text: [] };
        const limit = Math.min(args.limit ?? 10, MAX_LIMIT);

        const prefix = term.includes(' ')
            ? []
            : await ctx.db
                  .query('users')
                  .withIndex('by_username', (q: any) =>
                      q.gte('username', term).lt('username', `${term}\uffff`),
                  )
                  .take(limit);
        const text = await ctx.db
            .query('users')
            .withSearchIndex('search_directory', (q: any) => q.search('searchText', term))
            .take(limit);

        const brief = (u: any) => ({
            userId: String(u._id),
            username: u.username ?? null,
            name: u.name,
            role: u.role,
            hidden: u.directoryHidden === true || u.isBanned === true,
        });
        return { term, prefix: prefix.map(brief), text: text.map(brief) };
    },
});
