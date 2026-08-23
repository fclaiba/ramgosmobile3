/**
 * Quién puede promocionar qué — una sola regla para toda la app.
 *
 * La app tiene tres lugares donde alguien "recomienda" un producto ajeno:
 * etiquetarlo en un post, compartirlo con `?ref=`, y cobrarlo en el checkout.
 * El tercero ya decidía por su cuenta (`campaigns.internalResolveCartAttribution`);
 * los dos primeros no decidían nada y dejaban etiquetar cualquier cosa. El
 * resultado era una promesa vacía: la UI ofrecía referir, y el pago después
 * atribuía comisión cero.
 *
 * Regla única:
 *   - Cualquiera puede promocionar SUS PROPIOS listings.
 *   - Sólo un `role:'influencer'` puede promocionar los de otro, y sólo si el
 *     negocio lo habilitó: campaña activa, whitelist activa, o el listing está
 *     en promoción abierta (`openPromotion`).
 *   - Un consumidor común nunca puede referir el producto de otro.
 *
 * Es el espejo exacto de `internalResolveCartAttribution` (campaña ∪
 * openPromotion ∪ whitelist). Si una de las dos cambia, la otra tiene que
 * cambiar en el mismo commit.
 */

import { ConvexError } from 'convex/values';

/** Los negocios por los que este influencer puede cobrar comisión hoy. */
export async function eligibleBusinessIdsFor(
    ctx: any,
    influencerId: string,
): Promise<Set<string>> {
    const eligible = new Set<string>();

    const campaigns = await ctx.db
        .query('influencerCampaigns')
        .withIndex('by_influencer', (q: any) => q.eq('influencerId', influencerId))
        .take(200);
    for (const campaign of campaigns) {
        if (campaign.status === 'active') eligible.add(String(campaign.businessId));
    }

    const whitelists = await ctx.db
        .query('influencerWhitelists')
        .withIndex('by_influencer', (q: any) => q.eq('influencerId', influencerId))
        .take(200);
    for (const wl of whitelists) {
        if (wl.status === 'active') eligible.add(String(wl.businessId));
    }

    return eligible;
}

export type PromotionCheck = {
    /** Puede publicarlo / etiquetarlo. */
    canPromote: boolean;
    /** Puede además cobrar comisión: es de otro y está habilitado. */
    canRefer: boolean;
    reason?: 'own' | 'campaign' | 'open_promotion' | 'not_influencer' | 'not_authorized';
};

/**
 * `actor` es el resultado de `requireActor` / `getActorOrNull`; `listing` es el
 * documento crudo. Devuelve las dos capacidades por separado porque no son lo
 * mismo: el dueño puede publicar su producto pero no auto-referirse (la
 * autorreferencia no paga comisión, así que ofrecerla sería mentir).
 */
export async function checkPromotionRights(
    ctx: any,
    actor: { idString: string; role?: string } | null,
    listing: any,
): Promise<PromotionCheck> {
    if (!actor || !listing) return { canPromote: false, canRefer: false, reason: 'not_authorized' };

    const sellerId = String(listing.sellerId ?? '');

    if (sellerId && sellerId === actor.idString) {
        return { canPromote: true, canRefer: false, reason: 'own' };
    }

    if (actor.role !== 'influencer') {
        return { canPromote: false, canRefer: false, reason: 'not_influencer' };
    }

    // Orden espejado de `internalResolveCartAttribution`, incluidas las
    // condiciones sobre la tasa. Si acá dijéramos que sí donde el checkout
    // paga cero, la app ofrecería un `?ref=` que no atribuye nada.
    //
    //   1. Campaña activa       → paga `campaign.commissionRate` (no depende
    //                             de la tasa del listing).
    //   2. `openCommissionRate > 0` y además:
    //        a. promoción abierta   → paga
    //        b. whitelist activa    → paga
    const campaigns = await ctx.db
        .query('influencerCampaigns')
        .withIndex('by_influencer_business', (q: any) =>
            q.eq('influencerId', actor.idString).eq('businessId', sellerId),
        )
        .collect();
    if (campaigns.some((c: any) => c.status === 'active')) {
        return { canPromote: true, canRefer: true, reason: 'campaign' };
    }

    const openRate = Number(listing.openCommissionRate ?? 0);
    if (openRate > 0) {
        if (listing.openPromotion === true) {
            return { canPromote: true, canRefer: true, reason: 'open_promotion' };
        }
        const whitelist = await ctx.db
            .query('influencerWhitelists')
            .withIndex('by_business_and_influencer', (q: any) =>
                q.eq('businessId', sellerId).eq('influencerId', actor.idString),
            )
            .first();
        if (whitelist?.status === 'active') {
            return { canPromote: true, canRefer: true, reason: 'campaign' };
        }
    }

    return { canPromote: false, canRefer: false, reason: 'not_authorized' };
}

/** Variante que corta el flujo, para las mutations que escriben. */
export async function assertCanPromoteListing(
    ctx: any,
    actor: { idString: string; role?: string } | null,
    listing: any,
): Promise<PromotionCheck> {
    const check = await checkPromotionRights(ctx, actor, listing);
    if (check.canPromote) return check;

    throw new ConvexError({
        code: 'FORBIDDEN',
        message:
            check.reason === 'not_influencer'
                ? 'Solo podés etiquetar tus propios productos. Para promocionar los de un negocio necesitás una cuenta de influencer y su autorización.'
                : 'Este negocio todavía no te autorizó a promocionar sus productos.',
    });
}
