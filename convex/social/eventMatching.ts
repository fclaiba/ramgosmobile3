/**
 * Matching de eventos — el "Tinder interno" del doc (Sprint 5), diferido
 * hasta el final por decisión explícita del usuario. El schema
 * (`eventMatches`, `eventMatchOptIns`) ya existía con cero lógica.
 *
 * Reglas de privacidad, no negociables:
 *   1. Opt-out por default: sin fila en `eventMatchOptIns` con `enabled:
 *      true`, sos invisible. Nadie te ve, no aparecés en ningún candidato.
 *   2. Gate de asistencia: SÓLO puede activar matching quien tiene una
 *      `eventReservations` en estado `confirmed` o `checked_in` para ese
 *      evento (`listingId` = `eventId`). Sin entrada, no hay matching.
 *   3. Perfil espejo: los candidatos exponen SÓLO el `displayName`/`avatar`/
 *      `bio` que la persona cargó en su opt-in — nunca el perfil social real
 *      ni el handle — hasta que hay match mutuo.
 *   4. Bloqueos/mutes se respetan: nunca aparecés como candidato de alguien
 *      que bloqueaste o que te bloqueó.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query, internalMutation } from '../_generated/server';
import { api } from '../_generated/api';
import { assertSocialActor, isBlockedBetween, socialViewer } from './_helpers';
import { recordActivity } from './activity';
import { createMediaResolver } from '../mediaUrl';

const NOW = () => new Date().toISOString();

/** ¿Tiene una reserva válida (asistencia real) para este evento? */
const hasValidReservation = async (ctx: any, listingId: string, userId: string): Promise<boolean> => {
    const reservations = await ctx.db
        .query('eventReservations')
        .withIndex('by_listing', (q: any) => q.eq('listingId', listingId))
        .collect();
    return reservations.some(
        (r: any) => r.userId === userId && (r.status === 'confirmed' || r.status === 'checked_in'),
    );
};

export const setMatchOptIn = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        eventId: v.string(),
        enabled: v.boolean(),
        intent: v.union(v.literal('dating'), v.literal('networking')),
        displayName: v.optional(v.string()),
        avatar: v.optional(v.string()),
        bio: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);

        if (args.enabled && !(await hasValidReservation(ctx, args.eventId, actor.idString))) {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Necesitás una entrada confirmada para este evento para activar el matching.',
            });
        }

        const existing = await ctx.db
            .query('eventMatchOptIns')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userId', actor.idString))
            .first();

        const patch = {
            enabled: args.enabled,
            intent: args.intent,
            displayName: args.displayName,
            avatar: args.avatar,
            bio: args.bio,
            updatedAt: NOW(),
        };

        if (existing) {
            await ctx.db.patch(existing._id, patch);
        } else {
            await ctx.db.insert('eventMatchOptIns', { eventId: args.eventId, userId: actor.idString, ...patch });
        }
        return { success: true };
    },
});

export const getMyOptIn = query({
    args: { sessionToken: v.optional(v.string()), eventId: v.string() },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return null;
        return await ctx.db
            .query('eventMatchOptIns')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userId', actor.idString))
            .first();
    },
});

/** Ventana de matching: desde 24h antes del evento hasta 24h después. */
const withinMatchingWindow = (eventDate?: string): boolean => {
    if (!eventDate) return true; // sin fecha registrada, no restringe
    const eventMs = Date.parse(eventDate);
    if (!Number.isFinite(eventMs)) return true;
    const nowMs = Date.now();
    return nowMs > eventMs - 24 * 3_600_000 && nowMs < eventMs + 24 * 3_600_000;
};

export const getMatchCandidates = query({
    args: {
        sessionToken: v.optional(v.string()),
        eventId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        const cap = Math.min(args.limit ?? 20, 50);

        const myOptIn = await ctx.db
            .query('eventMatchOptIns')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userId', actor.idString))
            .first();
        if (!myOptIn?.enabled) return [];

        // Fuera de la ventana horaria del evento, no hay candidatos.
        const listingRef = ctx.db.normalizeId('listings', args.eventId);
        const listing = listingRef ? await ctx.db.get(listingRef) : null;
        if (!withinMatchingWindow(listing?.eventDate)) return [];

        const enabled = await ctx.db
            .query('eventMatchOptIns')
            .withIndex('by_event_enabled', (q: any) => q.eq('eventId', args.eventId).eq('enabled', true))
            .take(200);

        // Ya swipeados (en cualquier sentido) — no repetir candidatos.
        const mySwipes = await ctx.db
            .query('eventMatches')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userA', actor.idString))
            .collect();
        const swipedIds = new Set(mySwipes.map((m: any) => m.userB));

        const candidates: any[] = [];
        const media = createMediaResolver(ctx);
        for (const c of enabled) {
            if (candidates.length >= cap) break;
            if (c.userId === actor.idString) continue;
            if (c.intent !== myOptIn.intent) continue;
            if (swipedIds.has(c.userId)) continue;
            if (await isBlockedBetween(ctx, actor.idString, c.userId)) continue;

            candidates.push({
                userId: c.userId,
                // Perfil espejo: SÓLO lo que la persona cargó en su opt-in.
                displayName: c.displayName ?? 'Alguien en el evento',
                avatar: await media(c.avatar),
                bio: c.bio,
                intent: c.intent,
            });
        }
        return candidates;
    },
});

export const swipe = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        eventId: v.string(),
        targetUserId: v.string(),
        direction: v.union(v.literal('like'), v.literal('pass')),
    },
    handler: async (ctx, args): Promise<{ matched: boolean; chatId?: string }> => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        if (actor.idString === args.targetUserId) return { matched: false };

        const myOptIn = await ctx.db
            .query('eventMatchOptIns')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userId', actor.idString))
            .first();
        if (!myOptIn?.enabled) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Activá el matching para este evento primero.' });
        }
        if (await isBlockedBetween(ctx, actor.idString, args.targetUserId)) {
            return { matched: false };
        }

        const now = NOW();
        const existing = await ctx.db
            .query('eventMatches')
            .withIndex('by_event_pair', (q: any) =>
                q.eq('eventId', args.eventId).eq('userA', actor.idString).eq('userB', args.targetUserId),
            )
            .first();

        const myStatus = args.direction === 'like' ? 'pending' : 'rejected';
        if (existing) {
            await ctx.db.patch(existing._id, { status: myStatus, updatedAt: now });
        } else {
            await ctx.db.insert('eventMatches', {
                eventId: args.eventId,
                userA: actor.idString,
                userB: args.targetUserId,
                intent: myOptIn.intent,
                status: myStatus,
                createdAt: now,
                updatedAt: now,
            });
        }

        if (args.direction === 'pass') return { matched: false };

        // ¿La otra persona ya me había dado like? Esa fila vive con
        // userA=target, userB=yo (cada swipe es direccional, un row por
        // dirección) — `by_event_pair` la busca directo.
        const reciprocal = await ctx.db
            .query('eventMatches')
            .withIndex('by_event_pair', (q: any) =>
                q.eq('eventId', args.eventId).eq('userA', args.targetUserId).eq('userB', actor.idString),
            )
            .first();

        if (!reciprocal || reciprocal.status === 'rejected') {
            return { matched: false };
        }

        // Match mutuo: crear (o reusar) el chat y flipear ambas filas.
        const chatId: string = await ctx.runMutation(api.social.dm.getOrCreateDirectChat, {
            sessionToken: args.sessionToken,
            participantId: args.targetUserId,
        });

        const myRow = await ctx.db
            .query('eventMatches')
            .withIndex('by_event_pair', (q: any) =>
                q.eq('eventId', args.eventId).eq('userA', actor.idString).eq('userB', args.targetUserId),
            )
            .first();
        if (myRow) await ctx.db.patch(myRow._id, { status: 'matched', chatId, updatedAt: now });
        await ctx.db.patch(reciprocal._id, { status: 'matched', chatId, updatedAt: now });

        // Ambos lados del match reciben la actividad — `recordActivity`
        // ignora `actorUserId === userId`, así que hay que llamarla dos
        // veces con los roles invertidos en vez de una sola.
        await Promise.all([
            recordActivity(ctx, {
                userId: args.targetUserId,
                type: 'match',
                actorUserId: actor.idString,
                targetType: 'event_match',
                targetId: args.eventId,
                preview: 'Hicieron match en un evento',
            }),
            recordActivity(ctx, {
                userId: actor.idString,
                type: 'match',
                actorUserId: args.targetUserId,
                targetType: 'event_match',
                targetId: args.eventId,
                preview: 'Hicieron match en un evento',
            }),
        ]);

        return { matched: true, chatId };
    },
});

export const getMyMatches = query({
    args: { sessionToken: v.optional(v.string()), eventId: v.string() },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        const rows = await ctx.db
            .query('eventMatches')
            .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userA', actor.idString))
            .collect();
        const matched = rows.filter((r: any) => r.status === 'matched');
        const media = createMediaResolver(ctx);
        return await Promise.all(
            matched.map(async (m: any) => {
                const optIn = await ctx.db
                    .query('eventMatchOptIns')
                    .withIndex('by_event_user', (q: any) => q.eq('eventId', args.eventId).eq('userId', m.userB))
                    .first();
                return {
                    userId: m.userB,
                    chatId: m.chatId,
                    displayName: optIn?.displayName ?? 'Alguien en el evento',
                    avatar: await media(optIn?.avatar),
                };
            }),
        );
    },
});

export const unmatch = mutation({
    args: { sessionToken: v.optional(v.string()), eventId: v.string(), targetUserId: v.string() },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const [mine, theirs] = await Promise.all([
            ctx.db
                .query('eventMatches')
                .withIndex('by_event_pair', (q: any) =>
                    q.eq('eventId', args.eventId).eq('userA', actor.idString).eq('userB', args.targetUserId),
                )
                .first(),
            ctx.db
                .query('eventMatches')
                .withIndex('by_event_pair', (q: any) =>
                    q.eq('eventId', args.eventId).eq('userA', args.targetUserId).eq('userB', actor.idString),
                )
                .first(),
        ]);
        if (mine) await ctx.db.patch(mine._id, { status: 'rejected', updatedAt: NOW() });
        if (theirs) await ctx.db.patch(theirs._id, { status: 'rejected', updatedAt: NOW() });
        return { success: true };
    },
});

/**
 * Cron diario: purga opt-ins y swipes `pending` 7 días después del evento.
 * Los `matched` sobreviven — ya tienen un chat real y borrarlos rompería la
 * conversación sin ningún beneficio.
 */
export const internalCleanupStaleMatching = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const staleOptIns = await ctx.db.query('eventMatchOptIns').collect();
        let removedOptIns = 0;
        for (const o of staleOptIns) {
            if (o.updatedAt < cutoff) {
                await ctx.db.delete(o._id);
                removedOptIns += 1;
            }
        }
        return { removedOptIns };
    },
});
