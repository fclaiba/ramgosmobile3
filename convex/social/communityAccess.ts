/**
 * Acceso a comunidades: invitaciones, cuestionario de ingreso y solicitudes.
 *
 * Vive aparte de `communities.ts` (que ya son 700 líneas de CRUD, feed y
 * catálogo) porque es un dominio con sus propias reglas de seguridad: acá
 * están las únicas funciones que pueden revelar una comunidad SECRETA, y
 * conviene poder leerlas todas juntas.
 *
 * Modelo de privacidad:
 *   - `public`  — aparece en el directorio, entra cualquiera.
 *   - `private` — aparece en el directorio, pero hay que solicitar (y quizá
 *                 responder un cuestionario). `getCommunity` devuelve una
 *                 ficha reducida para que se pueda decidir.
 *   - `secret`  — NO aparece en ninguna búsqueda y `getCommunity` devuelve
 *                 `null` incluso con el id correcto. La ÚNICA puerta es
 *                 `previewInvite` con un token válido.
 *
 * El token de invitación es un secreto propio, no el `_id` de la fila: con el
 * `_id` en la URL cualquiera podría enumerar comunidades secretas probando
 * ids. Ver `newInviteToken` en `_helpers.ts`.
 */

import { v, ConvexError } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { createMediaResolver } from '../mediaUrl';
import { recordActivity } from './activity';
import { awardSocialAction } from './gamification';
import {
    adjustMemberCount,
    assertSocialActor,
    assertSocialRate,
    newInviteToken,
    requireCommunityAdmin,
    resolveJoinPolicy,
    socialViewer,
} from './_helpers';
import {
    firstMissingRequired,
    INVITE_CODE_ERRORS,
    inviteErrorMessage,
    inviteState,
    normalizeInviteCode,
    validateInviteCode,
    type InviteState,
} from './_communityPolicy';

const NOW = () => new Date().toISOString();

/** Máximo de preguntas del cuestionario. Más que esto no lo completa nadie. */
const MAX_QUESTIONS = 5;

/** Estado de una invitación, sin efectos secundarios. Ver `_communityPolicy`. */
const stateOf = (invite: any | null) => inviteState(invite, NOW());

async function loadCommunity(ctx: any, communityId: string) {
    const id = ctx.db.normalizeId('commercialCommunities', communityId);
    if (!id) return null;
    const community = await ctx.db.get(id);
    if (!community || community.deletedAt) return null;
    return community;
}

async function loadMembership(ctx: any, communityId: string, userId: string) {
    return await ctx.db
        .query('communityMembers')
        .withIndex('by_community_user', (q: any) =>
            q.eq('communityId', communityId).eq('userId', userId),
        )
        .first();
}

/* ─── Invitaciones ─────────────────────────────────────────────────── */

export const createInvite = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        kind: v.optional(v.union(v.literal('link'), v.literal('direct'))),
        targetUserId: v.optional(v.string()),
        role: v.optional(v.union(v.literal('member'), v.literal('admin'))),
        bypassApproval: v.optional(v.boolean()),
        maxUses: v.optional(v.number()),
        /** ISO. Ausente = no vence. */
        expiresAt: v.optional(v.string()),
        /**
         * Código a medida ("verano2026") en vez del aleatorio. Sirve para
         * links que se dictan o se imprimen. Es MENOS secreto por definición
         * —alguien puede adivinar "verano2026"— así que no se permite en
         * comunidades secretas, donde el token ES la única barrera.
         */
        customCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const membership = await requireCommunityAdmin(ctx, String(args.communityId), actor.idString);
        await assertSocialRate(ctx, actor, 'createInvite');

        let token: string;
        if (args.customCode) {
            const community = await loadCommunity(ctx, String(args.communityId));
            if (community?.visibility === 'secret') {
                throw new ConvexError({
                    code: 'FORBIDDEN',
                    message: 'Una comunidad secreta no admite códigos personalizados: son adivinables.',
                });
            }
            const normalized = normalizeInviteCode(args.customCode);
            const problem = validateInviteCode(normalized);
            if (problem) {
                throw new ConvexError({ code: 'FORBIDDEN', message: INVITE_CODE_ERRORS[problem] });
            }
            const taken = await ctx.db
                .query('communityInvites')
                .withIndex('by_token', (q: any) => q.eq('token', normalized))
                .first();
            if (taken) {
                throw new ConvexError({ code: 'FORBIDDEN', message: 'Ese código ya está en uso.' });
            }
            token = normalized;
        } else {
            token = newInviteToken();
        }

        // Sólo el dueño puede repartir el rol de admin: si un admin pudiera,
        // cualquiera con ese rol podría fabricarse pares y tomar la comunidad.
        if (args.role === 'admin' && membership.role !== 'owner') {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Sólo el dueño puede invitar administradores.',
            });
        }

        const now = NOW();
        const inviteId = await ctx.db.insert('communityInvites', {
            communityId: String(args.communityId),
            createdByUserId: actor.idString,
            token,
            kind: args.kind ?? 'link',
            targetUserId: args.targetUserId,
            role: args.role ?? 'member',
            bypassApproval: args.bypassApproval ?? false,
            maxUses: args.maxUses,
            useCount: 0,
            expiresAt: args.expiresAt,
            createdAt: now,
        });

        // Invitación dirigida: se avisa al destinatario en su bandeja.
        if (args.kind === 'direct' && args.targetUserId) {
            await recordActivity(ctx, {
                userId: args.targetUserId,
                type: 'community_invite',
                actorUserId: actor.idString,
                targetType: 'community',
                targetId: String(args.communityId),
            });
        }

        const invite = await ctx.db.get(inviteId);
        return { inviteId, token: invite?.token };
    },
});

export const revokeInvite = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        inviteId: v.id('communityInvites'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const invite = await ctx.db.get(args.inviteId);
        if (!invite) return { success: false };
        await requireCommunityAdmin(ctx, invite.communityId, actor.idString);
        if (!invite.revokedAt) await ctx.db.patch(args.inviteId, { revokedAt: NOW() });
        return { success: true };
    },
});

export const listInvites = query({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
    },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        try {
            await requireCommunityAdmin(ctx, String(args.communityId), actor.idString);
        } catch {
            // Las queries degradan en vez de lanzar: `useQuery` re-lanza en
            // render y tumbaría la app vía CrashHandler.
            return [];
        }

        const rows = await ctx.db
            .query('communityInvites')
            .withIndex('by_community_created', (q: any) => q.eq('communityId', String(args.communityId)))
            .order('desc')
            .take(50);

        return rows.map((invite: any) => ({
            ...invite,
            state: stateOf(invite),
        }));
    },
});

/**
 * La puerta del deep link.
 *
 * Es la única función que revela una comunidad secreta, y sólo contra un token
 * válido. Degrada con `socialViewer` porque alimenta un `useQuery` que se monta
 * apenas se abre el modal, antes de saber si el token sirve.
 */
export const previewInvite = query({
    args: {
        sessionToken: v.optional(v.string()),
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);

        const invite = await ctx.db
            .query('communityInvites')
            .withIndex('by_token', (q: any) => q.eq('token', args.token))
            .first();

        const state = stateOf(invite);
        if (!invite || state === 'notfound') {
            return { state: 'notfound' as const, community: null, questions: [], alreadyMember: false };
        }

        const community = await loadCommunity(ctx, invite.communityId);
        if (!community) {
            return { state: 'notfound' as const, community: null, questions: [], alreadyMember: false };
        }

        const membership = actor ? await loadMembership(ctx, invite.communityId, actor.idString) : null;
        const media = createMediaResolver(ctx);
        const policy = resolveJoinPolicy(community);

        // Sólo la ficha, nunca el feed ni la lista de miembros: el token
        // habilita a DECIDIR si entrar, no a leer la comunidad desde afuera.
        const preview = {
            _id: community._id,
            name: community.name,
            description: community.description,
            coverImage: await media(community.coverImage),
            bannerImage: await media(community.bannerImage),
            memberCount: community.memberCount,
            visibility: community.visibility,
            joinPolicy: policy,
            topic: community.topic,
            rules: community.rules ?? [],
        };

        const needsQuestionnaire = policy === 'questionnaire' && !invite.bypassApproval;
        const questions = needsQuestionnaire
            ? await loadActiveQuestions(ctx, invite.communityId, community.questionnaireVersion ?? 1)
            : [];

        return {
            state,
            community: preview,
            questions,
            needsQuestionnaire,
            bypassApproval: invite.bypassApproval,
            alreadyMember: membership?.status === 'active',
            pending: membership?.status === 'pending',
            banned: membership?.status === 'banned',
            requiresAuth: !actor,
        };
    },
});

export const acceptInvite = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        token: v.string(),
        answers: v.optional(
            v.array(
                v.object({
                    questionId: v.string(),
                    value: v.optional(v.string()),
                    optionIds: v.optional(v.array(v.string())),
                }),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'redeemInvite');

        const invite = await ctx.db
            .query('communityInvites')
            .withIndex('by_token', (q: any) => q.eq('token', args.token))
            .first();

        const state = stateOf(invite);
        if (state !== 'valid' || !invite) {
            throw new ConvexError({ code: 'FORBIDDEN', message: inviteErrorMessage(state) });
        }
        // Una invitación dirigida no es transferible: si el link se reenvía,
        // sólo sirve para quien fue emitido.
        if (invite.kind === 'direct' && invite.targetUserId && invite.targetUserId !== actor.idString) {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Esta invitación es para otra persona.' });
        }

        const community = await loadCommunity(ctx, invite.communityId);
        if (!community) throw new ConvexError({ code: 'FORBIDDEN', message: 'Comunidad no encontrada.' });

        const existing = await loadMembership(ctx, invite.communityId, actor.idString);
        if (existing?.status === 'active') return { status: 'active' as const };
        if (existing?.status === 'banned') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No podés unirte a esta comunidad.' });
        }

        const policy = resolveJoinPolicy(community);
        const needsApproval =
            !invite.bypassApproval && (policy === 'approval' || policy === 'questionnaire');
        const status = needsApproval ? 'pending' : 'active';
        const now = NOW();

        if (existing) {
            await ctx.db.patch(existing._id, {
                status,
                role: invite.role,
                createdAt: now,
                invitedByUserId: invite.createdByUserId,
                invitationId: String(invite._id),
                ...(status === 'active' ? { joinedAt: now } : {}),
            });
        } else {
            await ctx.db.insert('communityMembers', {
                communityId: invite.communityId,
                userId: actor.idString,
                role: invite.role,
                status,
                createdAt: now,
                invitedByUserId: invite.createdByUserId,
                invitationId: String(invite._id),
                ...(status === 'active' ? { joinedAt: now } : {}),
            });
        }

        // El uso se cuenta igual si queda pendiente: el link ya se gastó, y si
        // no se contara un link de un solo uso podría reciclarse rechazando.
        await ctx.db.patch(invite._id, { useCount: (invite.useCount ?? 0) + 1 });
        const alreadyRedeemed = await ctx.db
            .query('communityInviteRedemptions')
            .withIndex('by_invite_user', (q: any) =>
                q.eq('inviteId', String(invite._id)).eq('userId', actor.idString),
            )
            .first();
        if (!alreadyRedeemed) {
            await ctx.db.insert('communityInviteRedemptions', {
                inviteId: String(invite._id),
                communityId: invite.communityId,
                userId: actor.idString,
                createdAt: now,
            });
        }

        if (status === 'active') {
            await adjustMemberCount(ctx, invite.communityId, 1);
            await awardSocialAction(ctx, actor.idString, 'sp_community_join', invite.communityId);
        } else {
            await insertJoinRequest(ctx, {
                community,
                communityId: invite.communityId,
                userId: actor.idString,
                answers: args.answers ?? [],
                inviteId: String(invite._id),
            });
            await recordActivity(ctx, {
                userId: community.ownerUserId,
                type: 'community_join_request',
                actorUserId: actor.idString,
                targetType: 'community',
                targetId: invite.communityId,
            });
        }

        return { status, communityId: invite.communityId };
    },
});

/* ─── Cuestionario ─────────────────────────────────────────────────── */

async function loadActiveQuestions(ctx: any, communityId: string, version: number) {
    const rows = await ctx.db
        .query('communityQuestions')
        .withIndex('by_community_version_order', (q: any) =>
            q.eq('communityId', communityId).eq('version', version),
        )
        .collect();
    return rows
        .filter((r: any) => !r.deletedAt)
        .sort((a: any, b: any) => a.order - b.order)
        .map((r: any) => ({
            id: String(r._id),
            prompt: r.prompt,
            kind: r.kind,
            options: r.options ?? [],
            required: r.required,
            maxLength: r.maxLength,
        }));
}

export const getJoinQuestionnaire = query({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
    },
    handler: async (ctx, args) => {
        if (!(await socialViewer(ctx, args.sessionToken))) return { version: 0, questions: [] };
        const community = await loadCommunity(ctx, String(args.communityId));
        // Una secreta no confirma ni su existencia por este camino.
        if (!community || community.visibility === 'secret') return { version: 0, questions: [] };
        const version = community.questionnaireVersion ?? 1;
        return { version, questions: await loadActiveQuestions(ctx, String(args.communityId), version) };
    },
});

/**
 * Reemplaza el cuestionario entero subiendo la versión.
 *
 * No se editan las filas viejas: las solicitudes ya enviadas guardan su propia
 * copia del enunciado (`communityJoinRequests.answers[].prompt`), y las
 * preguntas anteriores quedan como historial de esa versión.
 */
export const setJoinQuestionnaire = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        questions: v.array(
            v.object({
                prompt: v.string(),
                kind: v.union(
                    v.literal('text'),
                    v.literal('single'),
                    v.literal('multi'),
                    v.literal('boolean'),
                ),
                options: v.optional(v.array(v.object({ id: v.string(), label: v.string() }))),
                required: v.optional(v.boolean()),
                maxLength: v.optional(v.number()),
            }),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await requireCommunityAdmin(ctx, String(args.communityId), actor.idString);

        if (args.questions.length > MAX_QUESTIONS) {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: `El cuestionario admite hasta ${MAX_QUESTIONS} preguntas.`,
            });
        }

        const community = await loadCommunity(ctx, String(args.communityId));
        if (!community) throw new ConvexError({ code: 'FORBIDDEN', message: 'Comunidad no encontrada.' });

        const nextVersion = (community.questionnaireVersion ?? 0) + 1;
        const now = NOW();

        for (let i = 0; i < args.questions.length; i++) {
            const q = args.questions[i];
            const prompt = q.prompt.trim();
            if (!prompt) continue;
            if ((q.kind === 'single' || q.kind === 'multi') && (q.options ?? []).length < 2) {
                throw new ConvexError({
                    code: 'FORBIDDEN',
                    message: 'Las preguntas de opciones necesitan al menos dos.',
                });
            }
            await ctx.db.insert('communityQuestions', {
                communityId: String(args.communityId),
                version: nextVersion,
                order: i,
                prompt,
                kind: q.kind,
                options: q.options,
                required: q.required ?? false,
                maxLength: q.maxLength,
                createdAt: now,
            });
        }

        const hasQuestionnaire = args.questions.length > 0;
        await ctx.db.patch(args.communityId, {
            questionnaireVersion: nextVersion,
            hasQuestionnaire,
            // Sin preguntas, `questionnaire` dejaría al usuario en un wizard
            // vacío que nunca se puede enviar: se degrada a solicitud simple.
            ...(resolveJoinPolicy(community) === 'questionnaire' && !hasQuestionnaire
                ? { joinPolicy: 'approval' as const }
                : {}),
            ...(hasQuestionnaire && resolveJoinPolicy(community) === 'approval'
                ? { joinPolicy: 'questionnaire' as const }
                : {}),
            updatedAt: now,
        });

        return { version: nextVersion, count: args.questions.length };
    },
});

/* ─── Solicitudes ──────────────────────────────────────────────────── */

async function insertJoinRequest(
    ctx: any,
    opts: {
        community: any;
        communityId: string;
        userId: string;
        answers: Array<{ questionId: string; value?: string; optionIds?: string[] }>;
        inviteId?: string;
    },
) {
    const version = opts.community.questionnaireVersion ?? 1;
    const questions = await loadActiveQuestions(ctx, opts.communityId, version);
    const byId = new Map(questions.map((q: any) => [q.id, q]));

    // Se guarda el enunciado junto a la respuesta. Si el admin edita el
    // cuestionario después, la solicitud sigue mostrando lo que la persona
    // realmente contestó y a qué pregunta.
    const answers = opts.answers
        .filter((a) => byId.has(a.questionId))
        .map((a) => {
            const q: any = byId.get(a.questionId);
            return {
                questionId: a.questionId,
                prompt: q.prompt,
                kind: q.kind,
                value: a.value,
                optionIds: a.optionIds,
            };
        });

    const existing = await ctx.db
        .query('communityJoinRequests')
        .withIndex('by_community_user', (q: any) =>
            q.eq('communityId', opts.communityId).eq('userId', opts.userId),
        )
        .filter((q: any) => q.eq(q.field('status'), 'pending'))
        .first();

    if (existing) {
        await ctx.db.patch(existing._id, {
            answers,
            questionnaireVersion: version,
            inviteId: opts.inviteId,
            createdAt: NOW(),
        });
        return existing._id;
    }

    return await ctx.db.insert('communityJoinRequests', {
        communityId: opts.communityId,
        userId: opts.userId,
        answers,
        questionnaireVersion: version,
        inviteId: opts.inviteId,
        status: 'pending',
        createdAt: NOW(),
    });
}

export const submitJoinRequest = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        answers: v.optional(
            v.array(
                v.object({
                    questionId: v.string(),
                    value: v.optional(v.string()),
                    optionIds: v.optional(v.array(v.string())),
                }),
            ),
        ),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        await assertSocialRate(ctx, actor, 'submitJoinRequest');

        const community = await loadCommunity(ctx, String(args.communityId));
        if (!community) throw new ConvexError({ code: 'FORBIDDEN', message: 'Comunidad no encontrada.' });

        const policy = resolveJoinPolicy(community);
        // Una secreta sólo se solicita con invitación en mano: si aceptara
        // solicitudes por id, bastaría con adivinar el id para saber que
        // existe, que es justo lo que "secreta" tiene que impedir.
        if (community.visibility === 'secret' || policy === 'invite') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'Esta comunidad es sólo por invitación.' });
        }
        if (policy === 'open') {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: 'Esta comunidad es abierta: entrá directamente.',
            });
        }

        const existing = await loadMembership(ctx, String(args.communityId), actor.idString);
        if (existing?.status === 'active') return { status: 'active' as const };
        if (existing?.status === 'banned') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No podés unirte a esta comunidad.' });
        }

        const version = community.questionnaireVersion ?? 1;
        const questions = await loadActiveQuestions(ctx, String(args.communityId), version);
        const missing = firstMissingRequired(questions as any, args.answers ?? []);
        if (missing) {
            throw new ConvexError({ code: 'FORBIDDEN', message: `Falta responder: ${missing.prompt}` });
        }

        const now = NOW();
        if (existing) {
            await ctx.db.patch(existing._id, { status: 'pending', createdAt: now });
        } else {
            await ctx.db.insert('communityMembers', {
                communityId: String(args.communityId),
                userId: actor.idString,
                role: 'member',
                status: 'pending',
                createdAt: now,
            });
        }

        await insertJoinRequest(ctx, {
            community,
            communityId: String(args.communityId),
            userId: actor.idString,
            answers: args.answers ?? [],
        });

        await recordActivity(ctx, {
            userId: community.ownerUserId,
            type: 'community_join_request',
            actorUserId: actor.idString,
            targetType: 'community',
            targetId: String(args.communityId),
        });

        return { status: 'pending' as const };
    },
});

export const listJoinRequests = query({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];
        try {
            await requireCommunityAdmin(ctx, String(args.communityId), actor.idString);
        } catch {
            return [];
        }

        const rows = await ctx.db
            .query('communityJoinRequests')
            .withIndex('by_community_status_created', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('status', 'pending'),
            )
            .order('desc')
            .take(Math.min(args.limit ?? 30, 100));

        const media = createMediaResolver(ctx);
        return await Promise.all(
            rows.map(async (row: any) => {
                const profile = await ctx.db
                    .query('socialUsers')
                    .withIndex('by_user', (q: any) => q.eq('userId', row.userId))
                    .first();
                return {
                    ...row,
                    user: profile
                        ? { ...profile, avatar: await media(profile.avatar) }
                        : null,
                };
            }),
        );
    },
});

export const decideJoinRequest = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        requestId: v.id('communityJoinRequests'),
        approve: v.boolean(),
        note: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const request = await ctx.db.get(args.requestId);
        if (!request) return { success: false };
        await requireCommunityAdmin(ctx, request.communityId, actor.idString);

        // Idempotente: dos admins tocando el botón a la vez no duplican el
        // conteo de miembros ni reabren un trámite ya cerrado.
        if (request.status !== 'pending') return { success: true, alreadyDecided: true };

        const now = NOW();
        await ctx.db.patch(args.requestId, {
            status: args.approve ? 'approved' : 'rejected',
            decidedAt: now,
            decidedByUserId: actor.idString,
            decisionNote: args.note,
        });

        const membership = await loadMembership(ctx, request.communityId, request.userId);
        if (args.approve) {
            if (membership && membership.status !== 'active') {
                await ctx.db.patch(membership._id, { status: 'active', joinedAt: now });
                await adjustMemberCount(ctx, request.communityId, 1);
            } else if (!membership) {
                await ctx.db.insert('communityMembers', {
                    communityId: request.communityId,
                    userId: request.userId,
                    role: 'member',
                    status: 'active',
                    createdAt: now,
                    joinedAt: now,
                });
                await adjustMemberCount(ctx, request.communityId, 1);
            }
            await awardSocialAction(ctx, request.userId, 'sp_community_join', request.communityId);
            await recordActivity(ctx, {
                userId: request.userId,
                type: 'community_join_approved',
                actorUserId: actor.idString,
                targetType: 'community',
                targetId: request.communityId,
            });
        } else if (membership && membership.status === 'pending') {
            await ctx.db.patch(membership._id, { status: 'rejected' });
        }

        return { success: true };
    },
});

export const withdrawJoinRequest = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);

        const request = await ctx.db
            .query('communityJoinRequests')
            .withIndex('by_community_user', (q: any) =>
                q.eq('communityId', String(args.communityId)).eq('userId', actor.idString),
            )
            .filter((q: any) => q.eq(q.field('status'), 'pending'))
            .first();
        if (request) await ctx.db.patch(request._id, { status: 'withdrawn', decidedAt: NOW() });

        const membership = await loadMembership(ctx, String(args.communityId), actor.idString);
        if (membership?.status === 'pending') {
            await ctx.db.patch(membership._id, { status: 'left' });
        }
        return { success: true };
    },
});

/* ─── Comunidades fijadas como tabs del feed ───────────────────────── */

export const listPinnedCommunities = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await socialViewer(ctx, args.sessionToken);
        if (!actor) return [];

        const pinned = await ctx.db
            .query('communityMembers')
            .withIndex('by_user_pinned', (q: any) => q.eq('userId', actor.idString))
            .collect();

        const rows = pinned
            .filter((m: any) => m.pinnedAt && m.status === 'active')
            .sort((a: any, b: any) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0));

        const media = createMediaResolver(ctx);
        const out = await Promise.all(
            rows.map(async (m: any) => {
                const community = await loadCommunity(ctx, m.communityId);
                if (!community) return null;
                return {
                    communityId: m.communityId,
                    name: community.name,
                    coverImage: await media(community.coverImage),
                    pinnedOrder: m.pinnedOrder ?? 0,
                };
            }),
        );
        return out.filter(Boolean);
    },
});

/** Máximo de comunidades fijadas como tab. Más no entran en la barra. */
const MAX_PINNED = 5;

export const setCommunityPinned = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        communityId: v.id('commercialCommunities'),
        pinned: v.boolean(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, args.sessionToken);
        const membership = await loadMembership(ctx, String(args.communityId), actor.idString);
        if (!membership || membership.status !== 'active') {
            throw new ConvexError({ code: 'FORBIDDEN', message: 'No sos miembro de esta comunidad.' });
        }

        if (!args.pinned) {
            await ctx.db.patch(membership._id, { pinnedAt: undefined, pinnedOrder: undefined });
            return { success: true };
        }

        const current = await ctx.db
            .query('communityMembers')
            .withIndex('by_user_pinned', (q: any) => q.eq('userId', actor.idString))
            .collect();
        const alreadyPinned = current.filter((m: any) => m.pinnedAt && m.status === 'active');
        if (alreadyPinned.some((m: any) => String(m._id) === String(membership._id))) {
            return { success: true };
        }
        if (alreadyPinned.length >= MAX_PINNED) {
            throw new ConvexError({
                code: 'FORBIDDEN',
                message: `Podés fijar hasta ${MAX_PINNED} comunidades.`,
            });
        }

        const nextOrder = alreadyPinned.reduce(
            (max: number, m: any) => Math.max(max, (m.pinnedOrder ?? 0) + 1),
            0,
        );
        await ctx.db.patch(membership._id, { pinnedAt: NOW(), pinnedOrder: nextOrder });
        return { success: true };
    },
});
