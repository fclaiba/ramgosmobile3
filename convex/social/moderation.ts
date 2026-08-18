/**
 * Moderación: reportes, mute, ocultar posts, filtro de términos, y las
 * acciones de admin (remover contenido, shadowban, suspender). Antes de esto
 * no existía NADA de esto: ni reportar, ni silenciar, ni un filtro de
 * palabras — un usuario baneado con token vivo seguía posteando, y no había
 * ninguna cola para que un admin actuara sobre contenido tóxico.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query, internalMutation } from './../_generated/server';
import { internal } from './../_generated/api';
import { assertAdminOrDeveloper, requireActor } from '../authHelpers';
import { assertSocialActor, assertSocialRate, paginateQuery, socialViewer } from './_helpers';
import { revokeAllSessions } from '../authHelpers';

const NOW = () => new Date().toISOString();

/**
 * Igual que `socialViewer` pero además exige rol admin. Degrada a `null` en
 * vez de lanzar: estas queries alimentan pantallas que se montan antes de
 * saber el rol, y una excepción en `useQuery` sube al render (ver la
 * convención en `social/dm.ts`). No hay riesgo de fuga: sin actor admin el
 * llamador devuelve el valor vacío y nunca llega a leer nada.
 */
const adminViewer = async (ctx: any, sessionToken?: string) => {
    try {
        const actor = await requireActor(ctx, sessionToken);
        assertAdminOrDeveloper(actor);
        return actor;
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// Usuario
// ---------------------------------------------------------------------------

export const reportContent = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetType: v.union(
            v.literal('post'),
            v.literal('comment'),
            v.literal('user'),
            v.literal('message'),
            v.literal('story'),
        ),
        targetId: v.string(),
        targetUserId: v.optional(v.string()),
        reason: v.union(
            v.literal('spam'),
            v.literal('harassment'),
            v.literal('nudity'),
            v.literal('violence'),
            v.literal('hate'),
            v.literal('scam'),
            v.literal('selfharm'),
            v.literal('ip'),
            v.literal('other'),
        ),
        details: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'report');

        const existing = await ctx.db
            .query('socialReports')
            .withIndex('by_reporter_target', (q: any) =>
                q
                    .eq('reporterUserId', actor.idString)
                    .eq('targetType', args.targetType)
                    .eq('targetId', args.targetId),
            )
            .first();
        if (existing) return { success: false, message: 'Ya reportaste este contenido.' };

        await ctx.db.insert('socialReports', {
            reporterUserId: actor.idString,
            targetType: args.targetType,
            targetId: args.targetId,
            targetUserId: args.targetUserId,
            reason: args.reason,
            details: args.details?.slice(0, 500),
            status: 'open',
            createdAt: NOW(),
        });

        // Auto-escalada: 3+ reportes distintos sobre el mismo contenido lo
        // marca `flagged` sin esperar a que un admin lo mire.
        if (args.targetType === 'post' || args.targetType === 'comment') {
            const reports = await ctx.db
                .query('socialReports')
                .withIndex('by_target', (q: any) => q.eq('targetType', args.targetType).eq('targetId', args.targetId))
                .collect();
            if (reports.length >= 3) {
                const table = args.targetType === 'post' ? 'socialPosts' : 'socialComments';
                const nid = ctx.db.normalizeId(table, args.targetId);
                const doc = nid ? await ctx.db.get(nid) : null;
                if (nid && doc && doc.moderationStatus !== 'removed') {
                    await ctx.db.patch(nid, { moderationStatus: 'flagged' });
                }
            }
        }

        return { success: true };
    },
});

export const muteUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.string(),
        scope: v.optional(v.union(v.literal('posts'), v.literal('stories'), v.literal('all'))),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        if (actor.idString === args.targetUserId) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No podés silenciarte a vos mismo.' });
        }
        const existing = await ctx.db
            .query('socialMutes')
            .withIndex('by_pair', (q: any) => q.eq('muterUserId', actor.idString).eq('mutedUserId', args.targetUserId))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { scope: args.scope ?? 'all' });
            return { muted: true };
        }
        await ctx.db.insert('socialMutes', {
            muterUserId: actor.idString,
            mutedUserId: args.targetUserId,
            scope: args.scope ?? 'all',
            createdAt: NOW(),
        });
        return { muted: true };
    },
});

export const unmuteUser = mutation({
    args: { sessionToken: v.optional(v.string()), targetUserId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const existing = await ctx.db
            .query('socialMutes')
            .withIndex('by_pair', (q: any) => q.eq('muterUserId', actor.idString).eq('mutedUserId', args.targetUserId))
            .first();
        if (existing) await ctx.db.delete(existing._id);
        return { muted: false };
    },
});

export const listMyMutes = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        return await ctx.db
            .query('socialMutes')
            .withIndex('by_muter', (q: any) => q.eq('muterUserId', actor.idString))
            .collect();
    },
});

/** "No me interesa" / ocultar un post. Alimenta también al ranker (Fase 5). */
export const hidePost = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        postId: v.id('socialPosts'),
        reason: v.optional(v.union(v.literal('not_interested'), v.literal('hidden'))),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const post = await ctx.db.get(args.postId);
        if (!post) return { hidden: true };

        const existing = await ctx.db
            .query('socialHiddenPosts')
            .withIndex('by_user_post', (q: any) => q.eq('userId', actor.idString).eq('postId', String(args.postId)))
            .first();
        if (existing) return { hidden: true };

        await ctx.db.insert('socialHiddenPosts', {
            userId: actor.idString,
            postId: String(args.postId),
            authorUserId: post.authorUserId,
            reason: args.reason ?? 'not_interested',
            createdAt: NOW(),
        });
        return { hidden: true };
    },
});

export const unhidePost = mutation({
    args: { sessionToken: v.optional(v.string()), postId: v.id('socialPosts') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const existing = await ctx.db
            .query('socialHiddenPosts')
            .withIndex('by_user_post', (q: any) => q.eq('userId', actor.idString).eq('postId', String(args.postId)))
            .first();
        if (existing) await ctx.db.delete(existing._id);
        return { hidden: false };
    },
});

export const listMyHiddenPosts = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        return await ctx.db
            .query('socialHiddenPosts')
            .withIndex('by_user_created', (q: any) => q.eq('userId', actor.idString))
            .order('desc')
            .take(200);
    },
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminListReports = query({
    args: {
        sessionToken: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal('open'),
            v.literal('reviewing'),
            v.literal('actioned'),
            v.literal('dismissed'),
        )),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await adminViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };
        const status = args.status ?? 'open';
        return await paginateQuery(
            ctx.db
                .query('socialReports')
                .withIndex('by_status_created', (q: any) => q.eq('status', status))
                .order('desc'),
            args.cursor,
            args.limit ?? 20,
        );
    },
});

export const adminGetReportDetail = query({
    args: { sessionToken: v.optional(v.string()), reportId: v.id('socialReports') },
    handler: async (ctx, args) => {
        const actor = await adminViewer(ctx, args.sessionToken);
        if (!actor) return null;
        const report = await ctx.db.get(args.reportId);
        if (!report) return null;

        let target: any = null;
        if (report.targetType === 'post' || report.targetType === 'comment') {
            const table = report.targetType === 'post' ? 'socialPosts' : 'socialComments';
            const nid = ctx.db.normalizeId(table, report.targetId);
            target = nid ? await ctx.db.get(nid) : null;
        } else if (report.targetType === 'user') {
            const nid = ctx.db.normalizeId('users', report.targetId);
            target = nid ? await ctx.db.get(nid) : null;
        }

        const priorActions = report.targetUserId
            ? await ctx.db
                  .query('moderationActions')
                  .withIndex('by_targetUser_created', (q: any) => q.eq('targetUserId', report.targetUserId))
                  .order('desc')
                  .take(20)
            : [];

        return { report, target, priorActions };
    },
});

const applyModerationAction = async (
    ctx: any,
    actorId: string,
    args: {
        targetType: 'post' | 'comment' | 'user' | 'story' | 'message';
        targetId: string;
        targetUserId?: string;
        action:
            | 'remove_content'
            | 'restore_content'
            | 'warn'
            | 'shadowban'
            | 'unshadowban'
            | 'suspend'
            | 'unsuspend'
            | 'dismiss';
        reason: string;
        reportId?: string;
        suspendDays?: number;
    },
) => {
    if (args.action === 'remove_content' || args.action === 'restore_content') {
        const table = args.targetType === 'post' ? 'socialPosts' : 'socialComments';
        const nid = ctx.db.normalizeId(table, args.targetId);
        if (nid) {
            await ctx.db.patch(nid, {
                moderationStatus: args.action === 'remove_content' ? 'removed' : 'visible',
                removedAt: args.action === 'remove_content' ? NOW() : undefined,
                removedReason: args.action === 'remove_content' ? args.reason : undefined,
            });
            if (args.action === 'remove_content') {
                // Clawback: si el contenido cobró puntos sociales, se revierte.
                // El `day` tiene que ser el de creación del contenido, no el
                // de hoy: `eventKey` embebe esa fecha (ver el comentario en
                // `gamification.internalRevokeContentReward`).
                const doc = await ctx.db.get(nid);
                if (doc) {
                    const kind = args.targetType === 'post' ? 'sp_post' : 'sp_cmt';
                    await ctx.scheduler.runAfter(0, internal.social.gamification.internalRevokeContentReward, {
                        userId: doc.authorUserId,
                        kind,
                        entityId: args.targetId,
                        day: String(doc.createdAt).slice(0, 10),
                        reason: 'Contenido removido por moderación',
                    });
                }
            }
        }
    }

    if (args.targetUserId) {
        const userId = ctx.db.normalizeId('users', args.targetUserId);
        if (userId) {
            if (args.action === 'shadowban') {
                await ctx.db.patch(userId, { socialStatus: 'shadowbanned' });
            } else if (args.action === 'unshadowban') {
                await ctx.db.patch(userId, { socialStatus: 'active' });
            } else if (args.action === 'suspend') {
                const days = Math.max(1, Math.min(args.suspendDays ?? 3, 90));
                await ctx.db.patch(userId, {
                    socialStatus: 'suspended',
                    socialSuspendedUntil: new Date(Date.now() + days * 86_400_000).toISOString(),
                });
            } else if (args.action === 'unsuspend') {
                await ctx.db.patch(userId, { socialStatus: 'active', socialSuspendedUntil: undefined });
            } else if (args.action === 'warn') {
                const user = await ctx.db.get(userId);
                await ctx.db.patch(userId, { strikeCount: (user?.strikeCount ?? 0) + 1 });
            }
        }
    }

    await ctx.db.insert('moderationActions', {
        actorUserId: actorId,
        targetType: args.targetType,
        targetId: args.targetId,
        targetUserId: args.targetUserId,
        action: args.action,
        reason: args.reason,
        reportId: args.reportId,
        createdAt: NOW(),
    });
};

export const adminResolveReport = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        reportId: v.id('socialReports'),
        action: v.union(
            v.literal('remove_content'),
            v.literal('restore_content'),
            v.literal('warn'),
            v.literal('shadowban'),
            v.literal('suspend'),
            v.literal('dismiss'),
        ),
        reason: v.string(),
        suspendDays: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);

        const report = await ctx.db.get(args.reportId);
        if (!report) throw new ConvexError({ code: 'FORBIDDEN', message: 'Reporte no encontrado.' });

        if (args.action !== 'dismiss') {
            await applyModerationAction(ctx, actor.idString, {
                targetType: report.targetType as any,
                targetId: report.targetId,
                targetUserId: report.targetUserId,
                action: args.action,
                reason: args.reason,
                reportId: args.reportId,
                suspendDays: args.suspendDays,
            });
        } else {
            await ctx.db.insert('moderationActions', {
                actorUserId: actor.idString,
                targetType: report.targetType,
                targetId: report.targetId,
                targetUserId: report.targetUserId,
                action: 'dismiss',
                reason: args.reason,
                reportId: args.reportId,
                createdAt: NOW(),
            });
        }

        await ctx.db.patch(args.reportId, {
            status: args.action === 'dismiss' ? 'dismissed' : 'actioned',
            resolvedByUserId: actor.idString,
            resolutionAction: args.action,
            resolvedAt: NOW(),
        });

        return { success: true };
    },
});

export const adminRemovePost = mutation({
    args: { sessionToken: v.optional(v.string()), postId: v.id('socialPosts'), reason: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        const post = await ctx.db.get(args.postId);
        if (!post) return { success: false };
        await applyModerationAction(ctx, actor.idString, {
            targetType: 'post',
            targetId: String(args.postId),
            targetUserId: post.authorUserId,
            action: 'remove_content',
            reason: args.reason,
        });
        return { success: true };
    },
});

export const adminSetShadowban = mutation({
    args: { sessionToken: v.optional(v.string()), targetUserId: v.string(), shadowbanned: v.boolean(), reason: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        await applyModerationAction(ctx, actor.idString, {
            targetType: 'user',
            targetId: args.targetUserId,
            targetUserId: args.targetUserId,
            action: args.shadowbanned ? 'shadowban' : 'unshadowban',
            reason: args.reason,
        });
        return { success: true };
    },
});

export const adminSuspendUser = mutation({
    args: { sessionToken: v.optional(v.string()), targetUserId: v.string(), days: v.number(), reason: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        await applyModerationAction(ctx, actor.idString, {
            targetType: 'user',
            targetId: args.targetUserId,
            targetUserId: args.targetUserId,
            action: 'suspend',
            reason: args.reason,
            suspendDays: args.days,
        });
        return { success: true };
    },
});

export const adminUnsuspendUser = mutation({
    args: { sessionToken: v.optional(v.string()), targetUserId: v.string(), reason: v.string() },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        await applyModerationAction(ctx, actor.idString, {
            targetType: 'user',
            targetId: args.targetUserId,
            targetUserId: args.targetUserId,
            action: 'unsuspend',
            reason: args.reason,
        });
        return { success: true };
    },
});

export const adminListModerationActions = query({
    args: { sessionToken: v.optional(v.string()), targetUserId: v.optional(v.string()), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const actor = await adminViewer(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };
        if (args.targetUserId) {
            return await paginateQuery(
                ctx.db
                    .query('moderationActions')
                    .withIndex('by_targetUser_created', (q: any) => q.eq('targetUserId', args.targetUserId))
                    .order('desc'),
                args.cursor,
                args.limit ?? 20,
            );
        }
        return await paginateQuery(
            ctx.db.query('moderationActions').withIndex('by_created', (q: any) => q).order('desc'),
            args.cursor,
            args.limit ?? 20,
        );
    },
});

export const adminListTerms = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await adminViewer(ctx, args.sessionToken);
        if (!actor) return [];
        return await ctx.db.query('moderationTerms').collect();
    },
});

export const adminUpsertTerm = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        term: v.string(),
        severity: v.union(v.literal('block'), v.literal('flag')),
        scope: v.union(v.literal('post'), v.literal('comment'), v.literal('dm'), v.literal('all')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        const term = args.term.trim().toLowerCase();
        if (term.length < 2) throw new ConvexError({ code: 'FORBIDDEN', message: 'Término demasiado corto.' });

        const existing = await ctx.db
            .query('moderationTerms')
            .withIndex('by_term', (q: any) => q.eq('term', term))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, { severity: args.severity, scope: args.scope });
            return existing._id;
        }
        return await ctx.db.insert('moderationTerms', {
            term,
            severity: args.severity,
            scope: args.scope,
            createdByUserId: actor.idString,
            createdAt: NOW(),
        });
    },
});

export const adminDeleteTerm = mutation({
    args: { sessionToken: v.optional(v.string()), termId: v.id('moderationTerms') },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        assertAdminOrDeveloper(actor);
        await ctx.db.delete(args.termId);
        return { success: true };
    },
});

export const adminGetModerationStats = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await adminViewer(ctx, args.sessionToken);
        if (!actor) return { open: 0, reviewing: 0 };
        const open = await ctx.db.query('socialReports').withIndex('by_status_created', (q: any) => q.eq('status', 'open')).collect();
        const reviewing = await ctx.db.query('socialReports').withIndex('by_status_created', (q: any) => q.eq('status', 'reviewing')).collect();
        return { open: open.length, reviewing: reviewing.length };
    },
});

/** Cron diario: expira suspensiones vencidas. Registrado en `convex/crons.ts`. */
export const internalExpireSuspensions = internalMutation({
    args: {},
    handler: async (ctx) => {
        const nowIso = NOW();
        // `by_social_status` acota el recorrido a los suspendidos —un
        // subconjunto chico— en vez de escanear toda la tabla `users`.
        const suspended = await ctx.db
            .query('users')
            .withIndex('by_social_status', (q: any) => q.eq('socialStatus', 'suspended'))
            .collect();
        let expired = 0;
        for (const u of suspended) {
            if (u.socialSuspendedUntil && u.socialSuspendedUntil < nowIso) {
                await ctx.db.patch(u._id, { socialStatus: 'active', socialSuspendedUntil: undefined });
                expired += 1;
            }
        }
        return { expired };
    },
});
