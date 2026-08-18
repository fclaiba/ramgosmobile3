/**
 * La tarjeta pública de una persona — una sola forma para toda la app.
 *
 * Antes había tres divergentes: el documento crudo de `socialUsers` que
 * devolvía `social.searchUsers`, el autor de story armado a mano en
 * `social.ts`, y el participante de DM de `social/dm.ts`. Cada pantalla leía
 * campos distintos y ninguna coincidía con las otras.
 *
 * IMPORTANTE: nunca devolver el documento de `users` tal cual. Trae
 * `password`, `otp`, `passwordHistory`, `kycProfile` y los ids de Stripe.
 * Todo endpoint público que devuelva personas tiene que declarar
 * `returns: userCardValidator` para que un cambio futuro no filtre eso.
 */

import { v } from 'convex/values';
import { resolveMediaUrl } from './mediaUrl';
import { looksLikePlaceholderName } from './users/identity';

export type UserCardDto = {
    userId: string;
    username: string | null;
    displayName: string;
    avatar: string | null;
    verified: boolean;
    isInfluencer: boolean;
    role: string;
    followerCount: number;
};

export const userCardValidator = v.object({
    userId: v.string(),
    username: v.union(v.string(), v.null()),
    displayName: v.string(),
    avatar: v.union(v.string(), v.null()),
    verified: v.boolean(),
    isInfluencer: v.boolean(),
    role: v.string(),
    followerCount: v.number(),
});

/**
 * Nombre para mostrar. El orden codifica dos bugs de datos reales: los
 * negocios guardan su nombre comercial en `nickname`, y `socialUsers.
 * displayName` puede tener el email crudo o el literal 'Usuario' porque así
 * lo sembraba `ensureSocialUser`. Por eso el perfil social sólo gana si lo
 * que tiene es un nombre de verdad.
 */
const pickDisplayName = (user: any, social: any): string => {
    if (user?.role === 'business' && user?.nickname?.trim()) return user.nickname.trim();
    if (!looksLikePlaceholderName(social?.displayName)) return social.displayName.trim();
    if (user?.nickname?.trim()) return user.nickname.trim();
    if (user?.name?.trim()) return user.name.trim();
    return 'Usuario';
};

export async function toUserCard(
    ctx: any,
    user: any,
    social?: any | null,
): Promise<UserCardDto> {
    const rawAvatar = social?.avatar ?? user?.avatar ?? null;
    return {
        userId: String(user._id),
        username: user.username ?? social?.username ?? null,
        displayName: pickDisplayName(user, social),
        avatar: (await resolveMediaUrl(ctx, rawAvatar)) ?? null,
        verified: social?.verified === true,
        isInfluencer: social?.isInfluencer === true || user?.role === 'influencer',
        role: user.role ?? 'consumer',
        followerCount: social?.followerCount ?? 0,
    };
}

/** Igual que `toUserCard` pero resolviendo las dos filas a partir del id. */
export async function toUserCardById(ctx: any, userId: string): Promise<UserCardDto | null> {
    const ref = ctx.db.normalizeId('users', userId);
    const user = ref ? await ctx.db.get(ref) : null;
    if (!user) return null;
    const social = await socialProfileOf(ctx, String(user._id));
    return await toUserCard(ctx, user, social);
}

export async function socialProfileOf(ctx: any, userId: string) {
    return await ctx.db
        .query('socialUsers')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();
}
