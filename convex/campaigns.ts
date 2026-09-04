/**
 * Influencer ↔ Business campaigns — first-class backend.
 *
 * Replaces the legacy `WalletContext.campaigns` / `.contracts` mock that
 * lived in a JSON blob on `economyState.walletState`. Each row models a
 * relationship between one influencer and one business, with an explicit
 * `commissionRate` and lifecycle (`pending` → `active` → `paused`/`ended`/
 * `rejected`). The Stripe PaymentIntent validator (in `convex/stripe.ts`)
 * consults this table via `internalFindActiveCampaign` to decide whether
 * a `referralCode` actually earns the influencer a commission.
 *
 * Bidirectional flow:
 *   - Influencer proposes → `proposeCampaign` (initiatedBy='influencer',
 *     status='pending') → business accepts/rejects via `respondToCampaign`.
 *   - Business invites    → `inviteInfluencer`  (initiatedBy='business',
 *     status='pending') → influencer accepts/rejects via `respondToCampaign`.
 *
 * Authorization model:
 *   - Both parties (and admin/developer) can read campaigns they belong to.
 *   - Only the OTHER party can transition `pending → active|rejected`.
 *   - Either party can `pause` / `end` an active campaign.
 *
 * One-active-campaign-per-pair invariant: we reject creating a new campaign
 * when an active or pending one already exists for the same
 * (influencerId, businessId) tuple. Use `endCampaign` first to start fresh.
 */

import { v } from 'convex/values';
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from './_generated/server';
import { internal } from './_generated/api';
import {
    assertAdminOrDeveloper,
    assertSelfOrAdmin,
    getActorOrNull,
    requireActor,
} from './authHelpers';
import {
    findUserByHandleOrCode,
    isInfluencer,
    toInfluencerLookupDto,
} from './userLookup';
import { toUserCardById } from './userCard';
import { checkPromotionRights } from './promotionEligibility';
import { findUserByReferralInput, preferredShareCode } from './referralHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_OR_PENDING = ['active', 'pending'] as const;

const isFinal = (status: string) =>
    status === 'ended' || status === 'rejected';

const findExistingPair = async (
    ctx: any,
    influencerId: string,
    businessId: string,
): Promise<any | null> => {
    // Only one (influencer, business) row should be active or pending at
    // any time. We scan the composite index and pick the first non-final.
    const rows = await ctx.db
        .query('influencerCampaigns')
        .withIndex('by_influencer_business', (q: any) =>
            q.eq('influencerId', influencerId).eq('businessId', businessId),
        )
        .collect();
    return rows.find((r: any) => !isFinal(r.status)) ?? null;
};

const assertBusinessRole = async (ctx: any, businessId: string) => {
    const normId = ctx.db.normalizeId('users', businessId);
    if (!normId) throw new Error('Negocio inválido.');
    const business = await ctx.db.get(normId);
    if (!business) throw new Error('Negocio no encontrado.');
    if ((business as any).role !== 'business') {
        throw new Error('El destinatario debe tener rol business.');
    }
    return business;
};

const assertInfluencerRole = async (ctx: any, influencerId: string) => {
    const normId = ctx.db.normalizeId('users', influencerId);
    if (!normId) throw new Error('Influencer inválido.');
    const influencer = await ctx.db.get(normId);
    if (!influencer) throw new Error('Influencer no encontrado.');
    if ((influencer as any).role !== 'influencer') {
        throw new Error('El destinatario debe tener rol influencer.');
    }
    return influencer;
};

const assertInfluencerForInvite = (influencer: any) => {
    if (!isInfluencer(influencer)) {
        throw new Error('El destinatario debe tener rol influencer.');
    }
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Influencer proposes a campaign with a business. The business must
 * `respondToCampaign` to activate it.
 */
export const proposeCampaign = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        influencerId: v.id("users"),
        businessId: v.id("users"),
        commissionRate: v.number(),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<string> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        // Only the influencer themselves (or admin) can propose on their behalf.
        assertSelfOrAdmin(actor, String(args.influencerId));

        if (args.commissionRate <= 0 || args.commissionRate > 0.5) {
            throw new Error('Comisión inválida (0.01–0.50).');
        }

        await assertBusinessRole(ctx, String(args.businessId));
        // Verify the influencer exists with the right role too.
        await assertInfluencerRole(ctx, String(args.influencerId));

        const existing = await findExistingPair(
            ctx,
            String(args.influencerId),
            String(args.businessId),
        );
        if (existing) {
            throw new Error(
                'Ya existe una campaña activa o pendiente con este negocio.',
            );
        }

        const now = new Date().toISOString();
        const campaignId = await ctx.db.insert('influencerCampaigns', {
            influencerId: String(args.influencerId),
            businessId: String(args.businessId),
            commissionRate: args.commissionRate,
            initiatedBy: 'influencer',
            status: 'pending',
            notes: args.notes,
            createdAt: now,
            updatedAt: now,
        });

        // Notify the business that a new proposal landed.
        const influencerNorm = ctx.db.normalizeId('users', String(args.influencerId));
        const influencer = influencerNorm ? await ctx.db.get(influencerNorm) : null;
        const influencerName = (influencer as any)?.name ?? 'Un influencer';
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: String(args.businessId),
            title: 'Propuesta de colaboración',
            body: `${influencerName} te propuso una campaña con ${(args.commissionRate * 100).toFixed(0)}% de comisión.`,
            category: 'campaign',
            data: { type: 'campaign_proposed', campaignId: String(campaignId) },
        });

        return campaignId;
    },
});

/**
 * Business invites an influencer to promote its products. The influencer
 * must `respondToCampaign` to accept.
 */
export const inviteInfluencer = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        businessId: v.id("users"),
        influencerId: v.id("users"),
        commissionRate: v.number(),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<string> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        // Only the business themselves (or admin) can invite.
        assertSelfOrAdmin(actor, String(args.businessId));

        if (args.commissionRate <= 0 || args.commissionRate > 0.5) {
            throw new Error('Comisión inválida (0.01–0.50).');
        }

        await assertBusinessRole(ctx, String(args.businessId));
        const influencer = await assertInfluencerRole(
            ctx,
            String(args.influencerId),
        );
        assertInfluencerForInvite(influencer);

        const existing = await findExistingPair(
            ctx,
            String(args.influencerId),
            String(args.businessId),
        );
        if (existing) {
            throw new Error(
                'Ya existe una campaña activa o pendiente con este influencer.',
            );
        }

        const now = new Date().toISOString();
        const campaignId = await ctx.db.insert('influencerCampaigns', {
            influencerId: String(args.influencerId),
            businessId: String(args.businessId),
            commissionRate: args.commissionRate,
            initiatedBy: 'business',
            status: 'pending',
            notes: args.notes,
            createdAt: now,
            updatedAt: now,
        });

        const businessNorm = ctx.db.normalizeId('users', String(args.businessId));
        const business = businessNorm ? await ctx.db.get(businessNorm) : null;
        const businessName = (business as any)?.name ?? 'Un negocio';
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: String(args.influencerId),
            title: 'Invitación de colaboración',
            body: `${businessName} te invitó a promocionar sus productos con ${(args.commissionRate * 100).toFixed(0)}% de comisión.`,
            category: 'campaign',
            data: { type: 'campaign_invited', campaignId: String(campaignId) },
        });

        return campaignId;
    },
});

/**
 * Counterparty accepts / rejects a pending campaign. The party that did
 * NOT initiate the campaign is the only one allowed to respond.
 */
export const respondToCampaign = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        campaignId: v.id('influencerCampaigns'),
        decision: v.union(v.literal('accept'), v.literal('reject')),
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        const campaign: any = await ctx.db.get(args.campaignId);
        if (!campaign) throw new Error('Campaña no encontrada.');
        if (campaign.status !== 'pending') {
            throw new Error('La campaña ya no está pendiente.');
        }

        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        const expectedResponderId =
            campaign.initiatedBy === 'influencer'
                ? campaign.businessId
                : campaign.influencerId;

        if (!isAdmin && actor.idString !== expectedResponderId) {
            throw new Error(
                'Solo la contraparte puede responder a esta propuesta.',
            );
        }

        const now = new Date().toISOString();
        await ctx.db.patch(args.campaignId, {
            status: args.decision === 'accept' ? 'active' : 'rejected',
            startsAt: args.decision === 'accept' ? now : undefined,
            updatedAt: now,
        });

        // Notify the INITIATOR of the response.
        const initiatorId = campaign.initiatedBy === 'influencer'
            ? campaign.influencerId
            : campaign.businessId;
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: initiatorId,
            title: args.decision === 'accept' ? 'Campaña aceptada' : 'Campaña rechazada',
            body: args.decision === 'accept'
                ? `Tu propuesta de campaña fue aceptada. Ya podés empezar a promocionar.`
                : `La contraparte rechazó tu propuesta. Podés probar con otra negociación.`,
            category: 'campaign',
            data: { type: `campaign_${args.decision === 'accept' ? 'accepted' : 'rejected'}`, campaignId: String(args.campaignId) },
        });
    },
});

/**
 * Either party (or admin) can pause an active campaign.
 */
export const pauseCampaign = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        campaignId: v.id('influencerCampaigns'),
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const campaign: any = await ctx.db.get(args.campaignId);
        if (!campaign) throw new Error('Campaña no encontrada.');

        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        const isParty =
            actor.idString === campaign.influencerId ||
            actor.idString === campaign.businessId;
        if (!isAdmin && !isParty) {
            throw new Error('No autorizado.');
        }

        if (campaign.status !== 'active') {
            throw new Error('Solo se pueden pausar campañas activas.');
        }

        await ctx.db.patch(args.campaignId, {
            status: 'paused',
            updatedAt: new Date().toISOString(),
        });

        // Notify the OTHER party.
        const otherPartyId = actor.idString === campaign.influencerId
            ? campaign.businessId
            : campaign.influencerId;
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: otherPartyId,
            title: 'Campaña pausada',
            body: `La contraparte pausó la campaña. Las ventas no acreditan comisión hasta que se reanude.`,
            category: 'campaign',
            data: { type: 'campaign_paused', campaignId: String(args.campaignId) },
        });
    },
});

/**
 * Either party (or admin) can resume a paused campaign.
 */
export const resumeCampaign = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        campaignId: v.id('influencerCampaigns'),
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const campaign: any = await ctx.db.get(args.campaignId);
        if (!campaign) throw new Error('Campaña no encontrada.');

        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        const isParty =
            actor.idString === campaign.influencerId ||
            actor.idString === campaign.businessId;
        if (!isAdmin && !isParty) {
            throw new Error('No autorizado.');
        }

        if (campaign.status !== 'paused') {
            throw new Error('Solo se pueden reanudar campañas pausadas.');
        }

        await ctx.db.patch(args.campaignId, {
            status: 'active',
            updatedAt: new Date().toISOString(),
        });
    },
});

/**
 * Either party (or admin) can permanently end a campaign. Final state.
 */
export const endCampaign = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        campaignId: v.id('influencerCampaigns'),
    },
    handler: async (ctx, args): Promise<void> => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const campaign: any = await ctx.db.get(args.campaignId);
        if (!campaign) throw new Error('Campaña no encontrada.');

        const isAdmin = actor.role === 'admin' || actor.role === 'developer';
        const isParty =
            actor.idString === campaign.influencerId ||
            actor.idString === campaign.businessId;
        if (!isAdmin && !isParty) {
            throw new Error('No autorizado.');
        }

        if (isFinal(campaign.status)) {
            throw new Error('La campaña ya está finalizada.');
        }

        const now = new Date().toISOString();
        await ctx.db.patch(args.campaignId, {
            status: 'ended',
            endsAt: now,
            updatedAt: now,
        });

        // Notify the OTHER party.
        const otherPartyId = actor.idString === campaign.influencerId
            ? campaign.businessId
            : campaign.influencerId;
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: true,
            userId: otherPartyId,
            title: 'Campaña finalizada',
            body: `La contraparte finalizó la campaña. Las ventas con el código antiguo ya no acreditan comisión.`,
            category: 'campaign',
            data: { type: 'campaign_ended', campaignId: String(args.campaignId) },
        });
    },
});

// ---------------------------------------------------------------------------
// Queries — public
// ---------------------------------------------------------------------------

/**
 * Influencer-side dashboard query: all campaigns where I'm the influencer.
 * Excludes `ended` and `rejected` by default unless `includeFinal=true`.
 * Joins lightweight business info (name, avatar) for the UI.
 */
export const getMyCampaigns = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        influencerId: v.id("users"),
        includeFinal: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, String(args.influencerId));

        const rows = await ctx.db
            .query('influencerCampaigns')
            .withIndex('by_influencer', (q) =>
                q.eq('influencerId', String(args.influencerId)),
            )
            .order('desc')
            .collect();

        const filtered = args.includeFinal
            ? rows
            : rows.filter((r: any) => !isFinal(r.status));

        return await Promise.all(
            filtered.map(async (row: any) => {
                const businessId = ctx.db.normalizeId('users', row.businessId);
                const business = businessId ? await ctx.db.get(businessId) : null;
                return {
                    ...row,
                    businessName: (business as any)?.name ?? 'Negocio',
                    businessAvatar: (business as any)?.avatar,
                };
            }),
        );
    },
});

/**
 * Business-side dashboard query: all campaigns for my business.
 * Same shape as `getMyCampaigns` but joined with influencer info.
 */
export const getBusinessCampaigns = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        businessId: v.id("users"),
        includeFinal: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        let actor;
        try {
            actor = await requireActor(ctx, (args as any).sessionToken);
        } catch {
            return [];
        }
        assertSelfOrAdmin(actor, String(args.businessId));

        const rows = await ctx.db
            .query('influencerCampaigns')
            .withIndex('by_business', (q) =>
                q.eq('businessId', String(args.businessId)),
            )
            .order('desc')
            .collect();

        const filtered = args.includeFinal
            ? rows
            : rows.filter((r: any) => !isFinal(r.status));

        return await Promise.all(
            filtered.map(async (row: any) => {
                const influencerId = ctx.db.normalizeId(
                    'users',
                    row.influencerId,
                );
                const influencer = influencerId
                    ? await ctx.db.get(influencerId)
                    : null;
                return {
                    ...row,
                    influencerName: (influencer as any)?.name ?? 'Influencer',
                    influencerAvatar: (influencer as any)?.avatar,
                    influencerReferralCode:
                        (influencer as any)?.referralCode ?? null,
                };
            }),
        );
    },
});

/**
 * Exact resolve for BusinessDashboard whitelist / invite modal.
 * Uses the same identity path as referrals (`users.username` → alias → code).
 * Returns any user with role influencer; otherwise null.
 */
export const lookupInfluencer = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        /** @deprecated use `handleOrCode` — kept for older clients */
        emailOrCode: v.optional(v.string()),
        handleOrCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Return null instead of throwing — useQuery must not crash the dashboard.
        const actor = await getActorOrNull(ctx, (args as any).sessionToken);
        if (
            !actor ||
            (actor.role !== 'business' &&
                actor.role !== 'admin' &&
                actor.role !== 'developer')
        ) {
            return null;
        }

        const raw = (args.handleOrCode ?? args.emailOrCode ?? '').trim();
        if (!raw) return null;

        const user = await findUserByHandleOrCode(ctx, raw);
        if (!user || !isInfluencer(user)) return null;

        const social = await ctx.db
            .query('socialUsers')
            .withIndex('by_user', (q) => q.eq('userId', String(user._id)))
            .first();

        return toInfluencerLookupDto(user, social?.username);
    },
});

// ---------------------------------------------------------------------------
// Internal — used by the Stripe PI validator.
// ---------------------------------------------------------------------------

export const internalFindActiveCampaign = internalQuery({
    args: {
        influencerId: v.string(),
        businessId: v.string(),
    },
    handler: async (ctx, args): Promise<any | null> => {
        const rows = await ctx.db
            .query('influencerCampaigns')
            .withIndex('by_influencer_business', (q) =>
                q
                    .eq('influencerId', args.influencerId)
                    .eq('businessId', args.businessId),
            )
            .collect();
        return rows.find((r: any) => r.status === 'active') ?? null;
    },
});

// Admin helper: list every campaign (for AdminFinanceScreen / debugging).
export const listAllCampaigns = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        status: v.optional(
            v.union(
                v.literal('pending'),
                v.literal('active'),
                v.literal('paused'),
                v.literal('ended'),
                v.literal('rejected'),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertAdminOrDeveloper(actor);

        if (args.status) {
            const status = args.status;
            return await ctx.db
                .query('influencerCampaigns')
                .withIndex('by_status', (q) => q.eq('status', status))
                .order('desc')
                .take(500);
        }
        return await ctx.db
            .query('influencerCampaigns')
            .order('desc')
            .take(500);
    },
});

/**
 * Calculates cart-level influencer attribution based on active campaigns,
 * open promotion flags, and whitelists.
 */
/**
 * Atribución de UNA línea del checkout: ¿el `referralCode` corresponde a un
 * influencer con derecho a comisión sobre este listing/vendedor? Devuelve el
 * rate resuelto (campaña activa → promoción abierta → whitelist) o null.
 *
 * Helper puro sobre `ctx.db` para que `stripe.internalBuildCheckout` lo use
 * dentro de su propia transacción (sin llamadas anidadas).
 */
export async function resolveLineAttribution(
    ctx: any,
    line: { listingId: string; sellerId: string; referralCode?: string | null },
): Promise<{ influencerId: string; rate: number } | null> {
    if (!line.referralCode || !line.sellerId || !line.listingId) return null;

    // Resuelve handle, alias vanity y código legacy — las tres formas que
    // puede tomar un `?ref=`.
    const influencer: any = await findUserByReferralInput(ctx, line.referralCode);
    if (!influencer || influencer.role !== 'influencer') return null;
    if (String(influencer._id) === String(line.sellerId)) return null; // no auto-comisión

    // 1. Campaña activa entre influencer y negocio.
    const campaigns = await ctx.db
        .query('influencerCampaigns')
        .withIndex('by_influencer_business', (q: any) =>
            q.eq('influencerId', influencer._id).eq('businessId', line.sellerId),
        )
        .collect();
    const activeCampaign = campaigns.find((c: any) => c.status === 'active');
    if (activeCampaign && activeCampaign.commissionRate > 0) {
        return { influencerId: String(influencer._id), rate: activeCampaign.commissionRate };
    }

    // 2. Promoción abierta del listing o whitelist.
    const normId = ctx.db.normalizeId('listings', line.listingId);
    const listing: any = normId ? await ctx.db.get(normId) : null;
    if (!listing || !listing.openCommissionRate || listing.openCommissionRate <= 0) return null;
    if (listing.openPromotion === true) {
        return { influencerId: String(influencer._id), rate: listing.openCommissionRate };
    }
    const whitelistEntry = await ctx.db
        .query('influencerWhitelists')
        .withIndex('by_business_and_influencer', (q: any) =>
            q.eq('businessId', line.sellerId).eq('influencerId', influencer._id),
        )
        .first();
    if (whitelistEntry && whitelistEntry.status === 'active') {
        return { influencerId: String(influencer._id), rate: listing.openCommissionRate };
    }
    return null;
}

export const internalResolveCartAttribution = internalQuery({
    args: {
        lineItems: v.array(v.object({
            listingId: v.optional(v.string()),
            sellerId: v.optional(v.string()),
            referralCode: v.optional(v.string()),
            amountInCents: v.number(),
            quantity: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        const influencerTotals = new Map<string, { amountInCents: number; maxRate: number; items: number }>();

        for (const item of args.lineItems) {
            if (!item.listingId || !item.sellerId) continue;
            const resolved = await resolveLineAttribution(ctx, {
                listingId: item.listingId,
                sellerId: item.sellerId,
                referralCode: item.referralCode,
            });
            if (!resolved) continue;
            const itemTotal = item.amountInCents * item.quantity;
            const current = influencerTotals.get(resolved.influencerId);
            const earned = Math.round(itemTotal * resolved.rate);
            influencerTotals.set(resolved.influencerId, {
                amountInCents: (current?.amountInCents || 0) + earned,
                maxRate: Math.max(current?.maxRate || 0, resolved.rate),
                items: (current?.items || 0) + 1,
            });
        }

        const influencerIds = Array.from(influencerTotals.keys());
        const breakdown = influencerIds.map((id) => ({
            influencerId: id,
            amountInCents: influencerTotals.get(id)?.amountInCents || 0,
            maxRate: influencerTotals.get(id)?.maxRate || 0,
            items: influencerTotals.get(id)?.items || 0,
        }));

        if (influencerIds.length > 1) {
            return {
                influencerId: undefined,
                influencerAmount: 0,
                influencerRate: 0,
                hasMixedInfluencers: true,
                attributionRejectedReason: "mixed_influencers_in_checkout",
                influencerBreakdown: breakdown,
            };
        }

        const winnerId = influencerIds[0];
        const winner = winnerId ? influencerTotals.get(winnerId) : undefined;
        return {
            influencerId: winnerId,
            influencerAmount: winner?.amountInCents || 0,
            influencerRate: winner?.maxRate || 0,
            hasMixedInfluencers: false,
            attributionRejectedReason: null,
            influencerBreakdown: breakdown,
        };
    }
});

/**
 * Dev seed: business@test.com → @influencer_test with an **active** campaign
 * so the influencer can create bonos. Safe to re-run (idempotent).
 *
 * Era `mutation` pública sin `requireActor`: cualquier cliente con la URL del
 * deployment podía invocarla y activar una campaña (con role patch incluido)
 * sobre `business@test.com`/`influencer_test` si esas cuentas existían
 * (E-149/TRV-01, mismo patrón que seedMockBonos/seed5Bonos).
 */
export const seedBusinessInviteInfluencer1 = internalMutation({
    args: {},
    handler: async (ctx) => {
        const business = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', 'business@test.com'))
            .first();
        if (!business) {
            throw new Error('business@test.com no existe. Corré seedTestUsers primero.');
        }
        if ((business as any).role !== 'business') {
            await ctx.db.patch(business._id, { role: 'business' });
        }

        let influencer =
            (await ctx.db
                .query('users')
                .withIndex('by_username', (q) =>
                    q.eq('username', 'influencer_test'),
                )
                .first()) ?? null;

        if (!influencer) {
            influencer =
                (await ctx.db
                    .query('users')
                    .withIndex('by_username', (q) =>
                        q.eq('username', 'influencer1'),
                    )
                    .first()) ?? null;
        }

        if (!influencer) {
            const profile = await ctx.db
                .query('socialUsers')
                .withIndex('by_username', (q) =>
                    q.eq('username', 'influencer_test'),
                )
                .first();
            if (profile) {
                const uid = ctx.db.normalizeId('users', String((profile as any).userId));
                influencer = uid ? await ctx.db.get(uid) : null;
            }
        }

        if (!influencer) {
            influencer = await ctx.db
                .query('users')
                .withIndex('by_email', (q) => q.eq('email', 'influencer@test.com'))
                .first();
        }

        if (!influencer) {
            throw new Error(
                'No encontré @influencer_test ni influencer@test.com. Corré seedUsers / ensureDemoInfluencerIdentity.',
            );
        }

        await ctx.db.patch(influencer._id, {
            role: 'influencer',
            influencerStatus: 'approved',
            kycStatus: 'approved',
            username: 'influencer_test',
            referralCode: 'INFLUENCER_TEST',
        } as any);

        const influencerId = String(influencer._id);
        const businessId = String(business._id);
        const existing = await findExistingPair(ctx, influencerId, businessId);
        const now = new Date().toISOString();

        if (existing) {
            if (existing.status === 'active') {
                return {
                    ok: true,
                    action: 'already_active',
                    campaignId: existing._id,
                    influencerId,
                    influencerEmail: (influencer as any).email,
                    businessEmail: (business as any).email,
                };
            }
            await ctx.db.patch(existing._id, {
                status: 'active',
                startsAt: existing.startsAt ?? now,
                updatedAt: now,
                commissionRate: existing.commissionRate || 0.1,
                notes:
                    existing.notes ||
                    'Seed: invitación business@test.com → @influencer1 (activa para crear bonos)',
            });
            return {
                ok: true,
                action: 'activated',
                campaignId: existing._id,
                influencerId,
                influencerEmail: (influencer as any).email,
                businessEmail: (business as any).email,
            };
        }

        const campaignId = await ctx.db.insert('influencerCampaigns', {
            influencerId,
            businessId,
            commissionRate: 0.1,
            initiatedBy: 'business',
            status: 'active',
            notes: 'Seed: invitación business@test.com → @influencer1 (activa para crear bonos)',
            startsAt: now,
            createdAt: now,
            updatedAt: now,
        });

        return {
            ok: true,
            action: 'created',
            campaignId,
            influencerId,
            influencerEmail: (influencer as any).email,
            businessEmail: (business as any).email,
        };
    },
});

/**
 * Los negocios con los que un influencer colabora, para su perfil PÚBLICO.
 *
 * A diferencia de `getMyCampaigns` (que exige ser el propio influencer o admin),
 * esta query la puede leer cualquiera: es la vitrina de "con qué marcas trabajo".
 * Por eso devuelve sólo la tarjeta pública del negocio y NUNCA `commissionRate`
 * ni `notes` — la letra chica del acuerdo es privada entre las dos partes.
 *
 * Unifica las dos vías de vínculo que reconoce el motor de comisiones
 * (`internalResolveCartAttribution`): campaña activa y whitelist activa.
 */
export const getPublicInfluencerCollabs = query({
    args: { influencerId: v.string() },
    handler: async (ctx, args) => {
        const campaigns = await ctx.db
            .query('influencerCampaigns')
            .withIndex('by_influencer', (q: any) => q.eq('influencerId', args.influencerId))
            .take(100);

        const whitelists = await ctx.db
            .query('influencerWhitelists')
            .withIndex('by_influencer', (q: any) => q.eq('influencerId', args.influencerId))
            .take(100);

        // Dedupe por negocio: si hay campaña y whitelist para el mismo business,
        // gana la campaña (es el vínculo explícito y con fecha de inicio).
        const byBusiness = new Map<string, { source: 'campaign' | 'whitelist'; since: string }>();

        for (const wl of whitelists) {
            if (wl.status !== 'active') continue;
            byBusiness.set(String(wl.businessId), { source: 'whitelist', since: wl.createdAt });
        }
        for (const campaign of campaigns) {
            if (campaign.status !== 'active') continue;
            byBusiness.set(String(campaign.businessId), {
                source: 'campaign',
                since: campaign.startsAt || campaign.createdAt,
            });
        }

        const items = [];
        for (const [businessId, meta] of byBusiness) {
            const card = await toUserCardById(ctx, businessId);
            if (!card) continue;
            items.push({
                businessId,
                name: card.displayName,
                username: card.username,
                avatar: card.avatar,
                source: meta.source,
                since: meta.since,
            });
        }

        items.sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime());
        return items;
    },
});

/**
 * Elegibilidad para promocionar productos de terceros: vive en
 * `convex/promotionEligibility.ts`, compartida con el etiquetado social y el
 * share con `?ref=`.
 */
export { eligibleBusinessIdsFor } from './promotionEligibility';

/**
 * ¿Este usuario puede compartir ESTE producto como referido, y con qué código?
 *
 * La usa el botón "compartir" del detalle de producto para decidir si el enlace
 * lleva `?ref=`. Devuelve `canRefer:false` para el dueño del listing a propósito:
 * la autorreferencia no paga comisión, así que un `?ref=` propio sería un enlace
 * que promete algo que el checkout no cumple.
 */
export const getMyShareEligibility = query({
    args: { sessionToken: v.optional(v.string()), listingId: v.string() },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { canRefer: false, shareCode: null };

        const listingRef = ctx.db.normalizeId('listings', args.listingId);
        const listing = listingRef ? await ctx.db.get(listingRef) : null;
        if (!listing) return { canRefer: false, shareCode: null };

        const check = await checkPromotionRights(ctx, actor, listing);
        if (!check.canRefer) return { canRefer: false, shareCode: null };

        const user = await ctx.db.get(actor.id);
        const shareCode = preferredShareCode(
            (user as any)?.username,
            (user as any)?.referralAlias,
        );

        return { canRefer: Boolean(shareCode), shareCode: shareCode || null };
    },
});
