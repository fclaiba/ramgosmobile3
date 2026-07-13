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
    internalQuery,
    mutation,
    query,
} from './_generated/server';
import { internal } from './_generated/api';
import {
    assertAdminOrDeveloper,
    assertSelfOrAdmin,
    requireActor,
} from './authHelpers';

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
        await assertInfluencerRole(ctx, String(args.influencerId));

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
 * Lookup helper used by the BusinessDashboard "invite influencer" modal:
 * resolve an email or referralCode to a user id (with role guard).
 */
export const lookupInfluencer = query({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        emailOrCode: v.string(),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, (args as any).sessionToken);
        const term = args.emailOrCode.trim();
        if (!term) return null;

        // Try referral code first (case-insensitive — codes are uppercase
        // by convention).
        const upper = term.toUpperCase();
        const byCode = await ctx.db
            .query('users')
            .withIndex('by_referral_code', (q) =>
                q.eq('referralCode', upper),
            )
            .first();
        if (byCode && (byCode as any).role === 'influencer') {
            return {
                _id: byCode._id,
                name: (byCode as any).name,
                email: (byCode as any).email,
                referralCode: (byCode as any).referralCode,
            };
        }

        // Then email.
        const byEmail = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', term.toLowerCase()))
            .first();
        if (byEmail && (byEmail as any).role === 'influencer') {
            return {
                _id: byEmail._id,
                name: (byEmail as any).name,
                email: (byEmail as any).email,
                referralCode: (byEmail as any).referralCode,
            };
        }

        return null;
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
export const internalResolveCartAttribution = internalQuery({
    args: {
        lineItems: v.array(v.object({
            listingId: v.optional(v.string()), // Added for listing lookup
            sellerId: v.optional(v.string()),
            referralCode: v.optional(v.string()),
            amountInCents: v.number(),
            quantity: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        let finalInfluencerId: string | undefined = undefined;
        let totalInfluencerAmount = 0;
        let finalInfluencerRate = 0;

        for (const item of args.lineItems) {
            if (!item.referralCode || !item.sellerId || !item.listingId) continue;
            
            const upperCode = item.referralCode.trim().toUpperCase();
            const influencer = await ctx.db
                .query('users')
                .withIndex('by_referral_code', (q) => q.eq('referralCode', upperCode))
                .first();
                
            if (!influencer || (influencer as any).role !== 'influencer') continue;

            // 1. Try Custom Active Campaign first
            const campaigns = await ctx.db
                .query('influencerCampaigns')
                .withIndex('by_influencer_business', (q) =>
                    q
                        .eq('influencerId', influencer._id)
                        .eq('businessId', item.sellerId as string)
                )
                .collect();
            
            const activeCampaign = campaigns.find((c: any) => c.status === 'active');
            let resolvedRate = 0;

            if (activeCampaign) {
                resolvedRate = activeCampaign.commissionRate;
            } else {
                // 2. Fallback to Open Promotion or Whitelist logic
                const normId = ctx.db.normalizeId('listings', item.listingId);
                const listing: any = normId ? await ctx.db.get(normId) : null;
                
                if (listing && listing.openCommissionRate && listing.openCommissionRate > 0) {
                    if (listing.openPromotion === true) {
                        // Inscription is free
                        resolvedRate = listing.openCommissionRate;
                    } else {
                        // Requires Whitelist
                        const whitelistEntry = await ctx.db
                            .query("influencerWhitelists")
                            .withIndex("by_business_and_influencer", (q) => 
                                q.eq("businessId", item.sellerId as string).eq("influencerId", influencer._id)
                            )
                            .first();
                            
                        if (whitelistEntry && whitelistEntry.status === 'active') {
                            resolvedRate = listing.openCommissionRate;
                        }
                    }
                }
            }

            if (resolvedRate > 0) {
                const itemTotal = item.amountInCents * item.quantity;
                totalInfluencerAmount += Math.round(itemTotal * resolvedRate);
                
                if (!finalInfluencerId) {
                    finalInfluencerId = influencer._id;
                    finalInfluencerRate = resolvedRate;
                }
            }
        }

        return {
            influencerId: finalInfluencerId,
            influencerAmount: totalInfluencerAmount,
            influencerRate: finalInfluencerRate,
        };
    }
});
