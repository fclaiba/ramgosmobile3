/**
 * Borradores y publicación programada.
 *
 * Se guardan en `socialPostDrafts`, NO en `socialPosts`: un borrador no es
 * un post con un flag "todavía no publicado" — es otra cosa entera, y
 * modelarlo así evita que `getFeed`, `decoratePosts`, el ranker y la
 * gamificación tengan que aprender a ignorar estados intermedios. Al
 * publicar (a mano o por el cron), se llama a `createPostImpl` — el mismo
 * camino que usa una publicación en vivo — así que un post programado
 * dispara sus hashtags/menciones/gamificación recién en ese momento, nunca
 * antes. Eso también cierra un vector de abuso: programar 50 posts no
 * acredita puntos hasta que de verdad se publican, uno por vez y con su
 * propio tope diario.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query, internalMutation } from '../_generated/server';
import { requireActor } from '../authHelpers';
import { assertSocialActor, socialViewer } from './_helpers';
import { createPostArgsValidator, createPostImpl, SOCIAL_POST_MAX_LENGTH } from '../social';

const assertDraftLength = (content: string) => {
    if (content.length > SOCIAL_POST_MAX_LENGTH) {
        throw new ConvexError({
            code: 'CONTENT_TOO_LONG',
            message: `Los posts no pueden superar los ${SOCIAL_POST_MAX_LENGTH} caracteres.`,
        });
    }
};

const NOW = () => new Date().toISOString();

export const saveDraft = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        payload: v.object(createPostArgsValidator),
        /** Si se pasa, queda `scheduled`; si no, `draft` (sin fecha). */
        scheduledFor: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        assertDraftLength(args.payload.content);

        if (args.scheduledFor) {
            const when = Date.parse(args.scheduledFor);
            if (!Number.isFinite(when) || when <= Date.now()) {
                throw new ConvexError({ code: 'FORBIDDEN', message: 'La fecha programada tiene que ser futura.' });
            }
        }

        const now = NOW();
        return await ctx.db.insert('socialPostDrafts', {
            authorUserId: actor.idString,
            payload: args.payload,
            status: args.scheduledFor ? 'scheduled' : 'draft',
            scheduledFor: args.scheduledFor,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const updateDraft = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        draftId: v.id('socialPostDrafts'),
        payload: v.optional(v.object(createPostArgsValidator)),
        scheduledFor: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const draft = await ctx.db.get(args.draftId);
        if (!draft || draft.authorUserId !== actor.idString) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Borrador no encontrado.' });
        }
        const patch: Record<string, any> = { updatedAt: NOW() };
        if (args.payload) {
            assertDraftLength(args.payload.content);
            patch.payload = args.payload;
        }
        if (args.scheduledFor !== undefined) {
            patch.scheduledFor = args.scheduledFor;
            patch.status = args.scheduledFor ? 'scheduled' : 'draft';
        }
        await ctx.db.patch(args.draftId, patch);
        return { success: true };
    },
});

export const listMyDrafts = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        return await ctx.db
            .query('socialPostDrafts')
            .withIndex('by_author', (q: any) => q.eq('authorUserId', actor.idString))
            .order('desc')
            .take(100);
    },
});

export const deleteDraft = mutation({
    args: { sessionToken: v.optional(v.string()), draftId: v.id('socialPostDrafts') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const draft = await ctx.db.get(args.draftId);
        if (!draft || draft.authorUserId !== actor.idString) return { success: false };
        await ctx.db.delete(args.draftId);
        return { success: true };
    },
});

/** Publica un borrador YA, sin esperar a la fecha programada (si tenía una). */
export const publishDraftNow = mutation({
    args: { sessionToken: v.optional(v.string()), draftId: v.id('socialPostDrafts') },
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, args.sessionToken, { write: 'createPost' });
        const draft = await ctx.db.get(args.draftId);
        if (!draft || draft.authorUserId !== actor.idString) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Borrador no encontrado.' });
        }
        const postId = await createPostImpl(ctx, actor, draft.payload);
        await ctx.db.delete(args.draftId);
        return String(postId);
    },
});

/**
 * Cron cada 5 min (`convex/crons.ts`): publica lo que ya venció. Reconstruye
 * un `actor` mínimo desde `users` — no hay sesión real del usuario en un
 * cron, así que se arma la forma que `createPostImpl`/`assertSocialActor`
 * necesitan a mano en vez de pasar por `requireActor`.
 */
export const internalPublishDueScheduled = internalMutation({
    args: {},
    handler: async (ctx) => {
        const nowIso = NOW();
        const due = await ctx.db
            .query('socialPostDrafts')
            .withIndex('by_status_scheduled', (q: any) => q.eq('status', 'scheduled').lt('scheduledFor', nowIso))
            .take(50);

        let published = 0;
        let skipped = 0;
        for (const draft of due) {
            const userId = ctx.db.normalizeId('users', draft.authorUserId);
            const user = userId ? await ctx.db.get(userId) : null;
            // El autor puede haber sido baneado entre que programó y ahora —
            // no publicar en su nombre, y no reintentar en el próximo tick.
            if (!user || user.isBanned) {
                await ctx.db.delete(draft._id);
                skipped += 1;
                continue;
            }
            try {
                await createPostImpl(
                    ctx,
                    { idString: draft.authorUserId, role: user.role },
                    draft.payload,
                );
                published += 1;
            } catch (e) {
                console.warn('[social.drafts] scheduled publish failed', draft._id, e);
                skipped += 1;
            }
            await ctx.db.delete(draft._id);
        }
        return { published, skipped };
    },
});
