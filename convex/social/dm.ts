/**
 * Mensajería directa (DM) — bandeja estilo Instagram.
 *
 * Vive aparte de `social.ts` (que ya pasaba las 1800 líneas) tal como
 * anticipaba el comentario de `social/_helpers.ts`. `social.ts` re-exporta
 * los nombres viejos para no romper los call sites existentes.
 *
 * Modelo: `socialChats` (el hilo) + `socialChatMembers` (una fila por
 * chat×usuario). Esa segunda tabla es la que hace que la bandeja sea O(log n):
 * sin ella hay que escanear todos los chats del sistema para saber en cuáles
 * está un usuario. También guarda el estado por-usuario (solicitud, mute,
 * archivado) y `lastReadAt`, con lo que el "visto" se calcula comparando
 * timestamps en vez de escribir un documento por mensaje.
 *
 * Convención de errores: las **queries degradan** (`getActorOrNull` →
 * `null`/`[]`) porque `useQuery` re-lanza en render y un token vencido no
 * puede tumbar la app; las **mutations tiran** `ConvexError` con `code`.
 */

import { v } from 'convex/values';
import { mutation, query, internalMutation } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { getActorOrNull, authError, checkRateLimit } from '../authHelpers';
import { assertSocialActor, assertNotBlocked } from './_helpers';

const NOW = () => new Date().toISOString();
const sortedKey = (ids: string[]) => [...ids].sort().join(':');

/** Ventana en la que un heartbeat cuenta como "activo ahora". */
export const PRESENCE_WINDOW_MS = 60 * 1000;
/** Vida de un "escribiendo…" sin refresco. */
const TYPING_TTL_MS = 6 * 1000;
/** Un push por chat cada 2 minutos: una ráfaga de mensajes no spamea. */
const DM_PUSH_THROTTLE_MS = 2 * 60 * 1000;
const PREVIEW_MAX = 60;
const BODY_MAX = 4000;
const GROUP_MAX_MEMBERS = 32;

const attachmentValidator = v.object({
    type: v.union(
        v.literal('image'),
        v.literal('video'),
        v.literal('document'),
        v.literal('post'),
        v.literal('listing'),
    ),
    url: v.string(),
    metadata: v.optional(v.any()),
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Los uploads se guardan como `convex-storage:<id>`; el cliente necesita URL. */
const resolveMediaUrl = async (ctx: any, raw?: string | null) => {
    if (!raw) return raw ?? undefined;
    if (!raw.startsWith('convex-storage:')) return raw;
    try {
        const url = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
        return url ?? raw;
    } catch {
        return raw;
    }
};

const getMembership = async (ctx: any, chatId: string, userId: string) =>
    await ctx.db
        .query('socialChatMembers')
        .withIndex('by_chat_user', (q: any) => q.eq('chatId', chatId).eq('userId', userId))
        .first();

const listMemberships = async (ctx: any, chatId: string) =>
    await ctx.db
        .query('socialChatMembers')
        .withIndex('by_chat', (q: any) => q.eq('chatId', chatId))
        .collect();

/**
 * Devuelve la membresía del actor o tira FORBIDDEN. Las filas creadas antes
 * de que existiera `socialChatMembers` no tienen membresía: si el usuario
 * figura en `participantIds` se la creamos al vuelo (backfill perezoso) para
 * que los chats viejos sigan funcionando sin correr la migración.
 */
const requireMembership = async (ctx: any, chatId: any, userId: string) => {
    const existing = await getMembership(ctx, chatId, userId);
    if (existing && existing.state !== 'left') return existing;

    const chat = await ctx.db.get(chatId);
    if (!chat || !chat.participantIds.includes(userId)) {
        throw authError('FORBIDDEN', 'No tenés acceso a esta conversación.');
    }
    if (existing) return existing; // state === 'left': sigue leyendo pero no escribe

    const legacyUnread = (chat.unreadCounts ?? {})[userId] ?? 0;
    const id = await ctx.db.insert('socialChatMembers', {
        chatId,
        userId,
        state: 'active',
        role: chat.kind === 'group' ? 'member' : undefined,
        unreadCount: legacyUnread,
        lastMessageAt: chat.lastMessageAt,
        joinedAt: chat.createdAt ?? NOW(),
    });
    return await ctx.db.get(id);
};

const profileOf = async (ctx: any, userId: string) =>
    await ctx.db
        .query('socialUsers')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();

/**
 * Devuelve el `lastSeenAt` CRUDO (epoch ms), no un booleano `online`.
 * Una query de Convex solo se re-ejecuta cuando cambian los datos que leyó,
 * nunca por el paso del tiempo: si calculáramos `online` acá, el punto verde
 * quedaría congelado hasta el próximo heartbeat. El cliente compara contra su
 * propio reloj con un tick local.
 */
const presenceOf = async (ctx: any, userId: string) => {
    const row = await ctx.db
        .query('socialPresence')
        .withIndex('by_user', (q: any) => q.eq('userId', userId))
        .first();
    return { lastSeenAt: row?.lastSeenAt ?? null };
};

const hydrateParticipant = async (ctx: any, userId: string) => {
    const profile = await profileOf(ctx, userId);
    const presence = await presenceOf(ctx, userId);
    return {
        userId,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? 'Usuario',
        avatar: await resolveMediaUrl(ctx, profile?.avatar),
        verified: profile?.verified === true,
        isInfluencer: profile?.isInfluencer === true,
        ...presence,
    };
};

/**
 * ¿El primer mensaje de `senderId` a `recipientId` entra a la bandeja o a
 * Solicitudes? Entra directo si el receptor ya sigue al emisor, o si el
 * receptor es un negocio/influencer (las consultas de clientes no pueden
 * caer en una carpeta que nadie mira).
 */
const shouldLandInInbox = async (ctx: any, senderId: string, recipientId: string) => {
    const follows = await ctx.db
        .query('socialFollows')
        .withIndex('by_pair', (q: any) =>
            q.eq('followerUserId', recipientId).eq('followeeUserId', senderId),
        )
        .first();
    if (follows) return true;

    const normalized = ctx.db.normalizeId('users', recipientId);
    const user = normalized ? await ctx.db.get(normalized) : null;
    return user?.role === 'business' || user?.role === 'influencer';
};

const previewFor = (body: string, attachments?: any[]) => {
    const text = body.trim();
    if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
    const first = attachments?.[0]?.type;
    if (first === 'image') return '📷 Foto';
    if (first === 'video') return '🎥 Video';
    if (first === 'listing') return '🛍️ Producto';
    if (first === 'post') return '📎 Publicación';
    if (first === 'document') return '📄 Documento';
    return 'Nuevo mensaje';
};

// ---------------------------------------------------------------------------
// Queries — bandeja
// ---------------------------------------------------------------------------

/**
 * Bandeja paginada. `folder: 'inbox'` trae los chats aceptados y
 * `'requests'` las solicitudes pendientes. Ambas salen del mismo índice
 * `by_user_state_last`, ya ordenadas por actividad.
 */
export const listChats = query({
    args: {
        sessionToken: v.optional(v.string()),
        folder: v.optional(v.union(v.literal('inbox'), v.literal('requests'))),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };

        const state = args.folder === 'requests' ? 'request' : 'active';
        const limit = Math.max(1, Math.min(args.limit ?? 25, 50));

        const page = await ctx.db
            .query('socialChatMembers')
            .withIndex('by_user_state_last', (q: any) =>
                q.eq('userId', actor.idString).eq('state', state),
            )
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: limit });

        const items = await Promise.all(
            page.page.map(async (member: any) => {
                // `member.chatId` es `any` acá, así que `db.get` devuelve la
                // unión de todas las tablas; anotamos el destino.
                const chat: any = await ctx.db.get(member.chatId);
                if (!chat) return null;

                const otherIds = chat.participantIds.filter((id: string) => id !== actor.idString);
                const isGroup = chat.kind === 'group';
                const others = await Promise.all(
                    (isGroup ? otherIds.slice(0, 3) : otherIds).map((id: string) =>
                        hydrateParticipant(ctx, id),
                    ),
                );

                return {
                    chatId: String(chat._id),
                    kind: isGroup ? 'group' : 'direct',
                    title: isGroup ? chat.title ?? 'Grupo' : others[0]?.displayName ?? 'Usuario',
                    avatar: isGroup
                        ? await resolveMediaUrl(ctx, chat.avatar)
                        : others[0]?.avatar ?? null,
                    participants: others,
                    memberCount: chat.participantIds.length,
                    lastMessagePreview: chat.lastMessagePreview ?? null,
                    lastMessageAt: chat.lastMessageAt,
                    lastMessageMine: chat.lastMessageSenderId === actor.idString,
                    unreadCount: member.unreadCount ?? 0,
                    muted: !!member.mutedUntil && member.mutedUntil > NOW(),
                    state: member.state,
                };
            }),
        );

        return {
            items: items.filter(Boolean),
            nextCursor: page.isDone ? null : page.continueCursor,
        };
    },
});

/** Badge global. Suma barata sobre el mismo índice de la bandeja. */
export const getUnreadTotal = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { total: 0, requests: 0 };

        const active = await ctx.db
            .query('socialChatMembers')
            .withIndex('by_user_state_last', (q: any) =>
                q.eq('userId', actor.idString).eq('state', 'active'),
            )
            .collect();
        const requests = await ctx.db
            .query('socialChatMembers')
            .withIndex('by_user_state_last', (q: any) =>
                q.eq('userId', actor.idString).eq('state', 'request'),
            )
            .collect();

        const total = active.reduce(
            (sum: number, m: any) =>
                sum + (m.mutedUntil && m.mutedUntil > NOW() ? 0 : m.unreadCount ?? 0),
            0,
        );
        return { total, requests: requests.length };
    },
});

/** Cabecera de la conversación: participantes, presencia, rol y estado. */
export const getChat = query({
    args: { sessionToken: v.optional(v.string()), chatId: v.id('socialChats') },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return null;

        const chat = await ctx.db.get(args.chatId);
        if (!chat || !chat.participantIds.includes(actor.idString)) return null;

        const member = await getMembership(ctx, args.chatId, actor.idString);
        const isGroup = chat.kind === 'group';
        const otherIds = chat.participantIds.filter((id: string) => id !== actor.idString);
        const participants = await Promise.all(
            otherIds.map((id: string) => hydrateParticipant(ctx, id)),
        );

        return {
            chatId: String(chat._id),
            kind: isGroup ? 'group' : 'direct',
            title: isGroup ? chat.title ?? 'Grupo' : participants[0]?.displayName ?? 'Usuario',
            avatar: isGroup
                ? await resolveMediaUrl(ctx, chat.avatar)
                : participants[0]?.avatar ?? null,
            participants,
            memberCount: chat.participantIds.length,
            myRole: member?.role ?? (chat.createdByUserId === actor.idString ? 'owner' : 'member'),
            state: member?.state ?? 'active',
            muted: !!member?.mutedUntil && member.mutedUntil > NOW(),
        };
    },
});

/**
 * Página de mensajes en orden cronológico. Hidrata adjuntos (URL firmada),
 * reacciones, el mensaje citado y el estado de "visto" del otro lado.
 */
export const getChatMessages = query({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null, readerLastReadAt: null };

        const chat = await ctx.db.get(args.chatId);
        if (!chat || !chat.participantIds.includes(actor.idString)) {
            return { items: [], nextCursor: null, readerLastReadAt: null };
        }

        const cap = Math.min(args.limit ?? 40, 100);
        const page = await ctx.db
            .query('socialMessages')
            .withIndex('by_chat_created', (q: any) => q.eq('chatId', String(args.chatId)))
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: cap });

        const items = await Promise.all(
            [...page.page].reverse().map(async (msg: any) => {
                const attachments = msg.attachments
                    ? await Promise.all(
                          msg.attachments.map(async (a: any) => ({
                              ...a,
                              url: await resolveMediaUrl(ctx, a.url),
                          })),
                      )
                    : undefined;

                const reactions = await ctx.db
                    .query('socialMessageReactions')
                    .withIndex('by_message', (q: any) => q.eq('messageId', String(msg._id)))
                    .collect();

                let replyTo = null;
                if (msg.replyToId) {
                    const normalized = ctx.db.normalizeId('socialMessages', msg.replyToId);
                    const parent = normalized ? await ctx.db.get(normalized) : null;
                    if (parent) {
                        replyTo = {
                            messageId: String(parent._id),
                            senderUserId: parent.senderUserId,
                            body: parent.deletedAt
                                ? 'Mensaje eliminado'
                                : previewFor(parent.body, parent.attachments),
                        };
                    }
                }

                return {
                    _id: String(msg._id),
                    senderUserId: msg.senderUserId,
                    body: msg.deletedAt ? '' : msg.body,
                    deleted: !!msg.deletedAt,
                    attachments: msg.deletedAt ? undefined : attachments,
                    replyTo,
                    createdAt: msg.createdAt,
                    mine: msg.senderUserId === actor.idString,
                    reactions: reactions.map((r: any) => ({
                        emoji: r.emoji,
                        userId: r.userId,
                        mine: r.userId === actor.idString,
                    })),
                };
            }),
        );

        // "Visto": el lastReadAt más viejo entre los demás miembros. El
        // cliente pinta doble check en todo mensaje propio anterior a eso.
        const others = (await listMemberships(ctx, args.chatId)).filter(
            (m: any) => m.userId !== actor.idString,
        );
        const readerLastReadAt = others.length
            ? others
                  .map((m: any) => m.lastReadAt ?? '')
                  .sort()[0] || null
            : null;

        return {
            items,
            nextCursor: page.isDone ? null : page.continueCursor,
            readerLastReadAt,
        };
    },
});

/**
 * Quiénes están escribiendo. Devuelve `expiresAt` crudo y **no** filtra por
 * tiempo: igual que con la presencia, la query no se re-ejecuta sola cuando
 * el TTL vence. El componente corre un tick local de 1s y oculta lo vencido;
 * en el caso normal el emisor borra su fila al enviar y desaparece al toque.
 */
export const getTyping = query({
    args: { sessionToken: v.optional(v.string()), chatId: v.id('socialChats') },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];

        const rows = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_chat', (q: any) => q.eq('chatId', String(args.chatId)))
            .collect();

        return await Promise.all(
            rows
                .filter((r: any) => r.userId !== actor.idString)
                .map(async (r: any) => {
                    const profile = await profileOf(ctx, r.userId);
                    return {
                        userId: r.userId,
                        displayName: profile?.displayName ?? 'Alguien',
                        expiresAt: r.expiresAt,
                    };
                }),
        );
    },
});

// ---------------------------------------------------------------------------
// Mutations — crear chats
// ---------------------------------------------------------------------------

/**
 * Abre (o recupera) el chat 1:1 con `participantId`. Idempotente vía
 * `participantsKey`. No crea membresía de solicitud todavía: eso lo decide
 * el primer mensaje, así que abrir un chat y no escribir no le notifica nada
 * a nadie.
 */
export const getOrCreateDirectChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        participantId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        if (actor.idString === args.participantId) {
            throw authError('FORBIDDEN', 'No podés abrir un chat con vos mismo.');
        }

        const target = ctx.db.normalizeId('users', args.participantId);
        if (!target || !(await ctx.db.get(target))) {
            throw authError('FORBIDDEN', 'Ese usuario no existe.');
        }
        await assertNotBlocked(ctx, actor.idString, args.participantId);

        const key = sortedKey([actor.idString, args.participantId]);
        const existing = await ctx.db
            .query('socialChats')
            .withIndex('by_participants_key', (q: any) => q.eq('participantsKey', key))
            .first();
        if (existing) {
            await requireMembership(ctx, existing._id, actor.idString);
            return String(existing._id);
        }

        const now = NOW();
        const chatId = await ctx.db.insert('socialChats', {
            kind: 'direct',
            participantIds: [actor.idString, args.participantId],
            participantsKey: key,
            createdByUserId: actor.idString,
            lastMessageAt: now,
            createdAt: now,
        });

        // El que abre el chat siempre lo ve en su bandeja; el receptor recién
        // aparece cuando llega el primer mensaje (ver `sendMessage`).
        await ctx.db.insert('socialChatMembers', {
            chatId,
            userId: actor.idString,
            state: 'active',
            unreadCount: 0,
            lastReadAt: now,
            lastMessageAt: now,
            joinedAt: now,
        });

        return String(chatId);
    },
});

/** Crea un grupo. El creador queda como `owner`. */
export const createGroupChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        participantIds: v.array(v.string()),
        title: v.string(),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);

        const unique = Array.from(new Set(args.participantIds.filter((id) => id !== actor.idString)));
        if (unique.length < 2) {
            throw authError('FORBIDDEN', 'Un grupo necesita al menos 3 personas.');
        }
        if (unique.length + 1 > GROUP_MAX_MEMBERS) {
            throw authError('FORBIDDEN', `Máximo ${GROUP_MAX_MEMBERS} integrantes.`);
        }
        const title = args.title.trim();
        if (!title) throw authError('FORBIDDEN', 'El grupo necesita un nombre.');

        const now = NOW();
        const chatId = await ctx.db.insert('socialChats', {
            kind: 'group',
            participantIds: [actor.idString, ...unique],
            title,
            avatar: args.avatar,
            createdByUserId: actor.idString,
            lastMessageAt: now,
            createdAt: now,
        });

        await ctx.db.insert('socialChatMembers', {
            chatId,
            userId: actor.idString,
            state: 'active',
            role: 'owner',
            unreadCount: 0,
            lastReadAt: now,
            lastMessageAt: now,
            joinedAt: now,
        });
        for (const id of unique) {
            await ctx.db.insert('socialChatMembers', {
                chatId,
                userId: id,
                state: 'active',
                role: 'member',
                unreadCount: 0,
                lastMessageAt: now,
                joinedAt: now,
            });
        }

        return String(chatId);
    },
});

// ---------------------------------------------------------------------------
// Mutations — mensajes
// ---------------------------------------------------------------------------

/**
 * Envía un mensaje. `clientId` lo genera el cliente: si el envío se reintenta
 * por un corte de red, el mensaje no se duplica.
 */
export const sendMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
        body: v.optional(v.string()),
        attachments: v.optional(v.array(attachmentValidator)),
        replyToId: v.optional(v.string()),
        clientId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const chat = await ctx.db.get(args.chatId);
        if (!chat) throw authError('FORBIDDEN', 'Chat no encontrado.');

        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        if (membership.state === 'left') {
            throw authError('FORBIDDEN', 'Ya no formás parte de esta conversación.');
        }

        const body = (args.body ?? '').trim();
        if (!body && !(args.attachments && args.attachments.length)) {
            throw authError('FORBIDDEN', 'El mensaje está vacío.');
        }
        if (body.length > BODY_MAX) {
            throw authError('FORBIDDEN', 'El mensaje es demasiado largo.');
        }

        // En 1:1 el bloqueo corta el envío. En grupos no: bloquear a una
        // persona no puede silenciarte el grupo entero — se filtra al leer.
        if (chat.kind !== 'group') {
            for (const other of chat.participantIds) {
                if (other !== actor.idString) await assertNotBlocked(ctx, actor.idString, other);
            }
        }

        // `checkRateLimit` tira Error plano; lo envolvemos para que el cliente
        // reciba un FORBIDDEN y no lo confunda con una sesión vencida.
        try {
            await checkRateLimit(ctx, `dm:send:${actor.idString}`, 60, 60_000);
        } catch (e: any) {
            throw authError('FORBIDDEN', e?.message ?? 'Demasiados mensajes. Esperá un momento.');
        }

        // Idempotencia: mismo clientId en el mismo chat = mismo mensaje.
        if (args.clientId) {
            const dup = await ctx.db
                .query('socialMessages')
                .withIndex('by_chat_client', (q: any) =>
                    q.eq('chatId', String(args.chatId)).eq('clientId', args.clientId),
                )
                .first();
            if (dup) return String(dup._id);
        }

        const now = NOW();
        const messageId = await ctx.db.insert('socialMessages', {
            chatId: String(args.chatId),
            senderUserId: actor.idString,
            body,
            attachments: args.attachments,
            replyToId: args.replyToId,
            clientId: args.clientId,
            createdAt: now,
        });

        const preview = previewFor(body, args.attachments);
        const patch: any = {
            lastMessageAt: now,
            lastMessagePreview: preview,
            lastMessageSenderId: actor.idString,
        };

        // Métrica de tiempo de respuesta de vendedores (se mantiene del
        // modelo anterior): primera respuesta de alguien que no abrió el chat.
        if (!chat.firstRepliedAt && chat.participantIds[0] !== actor.idString) {
            patch.firstRepliedAt = now;
            patch.firstReplierId = actor.idString;
            const diffHours =
                (new Date(now).getTime() - new Date(chat.createdAt).getTime()) / 3_600_000;
            const userRef = ctx.db.normalizeId('users', actor.idString);
            const user = userRef ? await ctx.db.get(userRef) : null;
            if (user && user.role === 'business') {
                const currentAvg = user.sellerResponseTimeHours || 0;
                await ctx.db.patch(user._id, {
                    sellerResponseTimeHours:
                        currentAvg === 0 ? diffHours : (currentAvg * 9 + diffHours) / 10,
                });
            }
        }
        await ctx.db.patch(args.chatId, patch);

        // El emisor deja de estar "escribiendo" en cuanto manda.
        const typing = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_chat_user', (q: any) =>
                q.eq('chatId', String(args.chatId)).eq('userId', actor.idString),
            )
            .first();
        if (typing) await ctx.db.delete(typing._id);

        await ctx.db.patch(membership._id, { lastMessageAt: now, lastReadAt: now, unreadCount: 0 });

        // Fan-out: una escritura por miembro, no por mensaje del historial.
        const senderProfile = await profileOf(ctx, actor.idString);
        const senderName = senderProfile?.displayName ?? 'Alguien';

        for (const participantId of chat.participantIds) {
            if (participantId === actor.idString) continue;

            let member = await getMembership(ctx, args.chatId, participantId);
            if (!member) {
                // Primer mensaje del hilo: acá se decide bandeja vs solicitud.
                const direct = chat.kind !== 'group';
                const inbox = direct
                    ? await shouldLandInInbox(ctx, actor.idString, participantId)
                    : true;
                const newId = await ctx.db.insert('socialChatMembers', {
                    chatId: args.chatId,
                    userId: participantId,
                    state: inbox ? 'active' : 'request',
                    role: chat.kind === 'group' ? 'member' : undefined,
                    unreadCount: 1,
                    lastMessageAt: now,
                    joinedAt: now,
                });
                member = await ctx.db.get(newId);
            } else if (member.state === 'left') {
                continue;
            } else {
                await ctx.db.patch(member._id, {
                    unreadCount: (member.unreadCount ?? 0) + 1,
                    lastMessageAt: now,
                    // Un chat archivado vuelve a la bandeja con un mensaje nuevo.
                    state: member.state === 'archived' ? 'active' : member.state,
                });
            }

            if (member?.mutedUntil && member.mutedUntil > NOW()) continue;

            // Agrupación por chat: si ya avisamos hace poco no mandamos otro
            // push, pero tampoco lo tiramos — programamos un único resumen.
            const sinceLastPush = member?.lastNotifiedAt
                ? Date.now() - Date.parse(member.lastNotifiedAt)
                : Infinity;
            if (sinceLastPush < DM_PUSH_THROTTLE_MS) {
                if (member && !member.digestScheduledFor) {
                    await ctx.db.patch(member._id, {
                        digestScheduledFor: new Date(Date.now() + DM_PUSH_THROTTLE_MS).toISOString(),
                    });
                    await ctx.scheduler.runAfter(
                        DM_PUSH_THROTTLE_MS,
                        internal.social.dm.internalSendChatDigest,
                        { chatId: args.chatId, userId: participantId },
                    );
                }
                continue;
            }

            if (member) await ctx.db.patch(member._id, { lastNotifiedAt: now });
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                // Nunca email por un DM: el chat se notifica por push.
                sendEmail: false,
                title: chat.kind === 'group' ? `${senderName} · ${chat.title ?? 'Grupo'}` : senderName,
                body: preview,
                category: 'social',
                data: { type: 'dm', chatId: String(args.chatId), messageId: String(messageId) },
                userId: participantId,
            });
        }

        return String(messageId);
    },
});

/**
 * Comparte un producto en el chat. El snapshot (título, precio, imagen) y el
 * `sharedByUserId` se resuelven en el servidor: si vinieran del cliente,
 * cualquiera podría inventar un precio o atribuirse la recomendación.
 */
export const shareListingInChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        listingId: v.string(),
        note: v.optional(v.string()),
        clientId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await requireMembership(ctx, args.chatId, actor.idString);

        const listingRef = ctx.db.normalizeId('listings', args.listingId);
        const listing: any = listingRef ? await ctx.db.get(listingRef) : null;
        if (!listing) throw authError('FORBIDDEN', 'Ese producto no existe.');

        const rawImage =
            listing.images?.find((i: any) => i.isPrimary)?.url ??
            listing.images?.[0]?.url ??
            listing.image ??
            listing.gallery?.[0];

        return await ctx.runMutation(api.social.dm.sendMessage, {
            sessionToken: (args as any).sessionToken,
            chatId: args.chatId,
            body: args.note ?? '',
            clientId: args.clientId,
            attachments: [
                {
                    type: 'listing' as const,
                    url: String(listing._id),
                    metadata: {
                        listingId: String(listing._id),
                        sharedByUserId: actor.idString,
                        title: listing.title,
                        price: listing.price,
                        discountPercent: listing.discountPercent ?? 0,
                        image: await resolveMediaUrl(ctx, rawImage),
                        sellerId: listing.sellerId,
                        listingType: listing.type,
                    },
                },
            ],
        });
    },
});

/** Marca el chat como leído: una sola escritura, no una por mensaje. */
export const markChatRead = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.any()),
        chatId: v.id('socialChats'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        await ctx.db.patch(membership._id, { unreadCount: 0, lastReadAt: NOW() });
        return { success: true };
    },
});

/** Unsend: soft-delete para no romper los replies que citan el mensaje. */
export const deleteMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        messageId: v.id('socialMessages'),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const message = await ctx.db.get(args.messageId);
        if (!message) throw authError('FORBIDDEN', 'Mensaje no encontrado.');
        if (message.senderUserId !== actor.idString) {
            throw authError('FORBIDDEN', 'Solo podés eliminar tus mensajes.');
        }
        await ctx.db.patch(args.messageId, { deletedAt: NOW() });

        // Si era el último del chat, el preview tiene que reflejarlo.
        const chatId = ctx.db.normalizeId('socialChats', message.chatId);
        const chat = chatId ? await ctx.db.get(chatId) : null;
        if (chat && chat.lastMessageAt === message.createdAt) {
            await ctx.db.patch(chat._id, { lastMessagePreview: 'Mensaje eliminado' });
        }
        return { success: true };
    },
});

/** Toggle de reacción. Reaccionar con otro emoji reemplaza al anterior. */
export const reactToMessage = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        messageId: v.id('socialMessages'),
        emoji: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const message = await ctx.db.get(args.messageId);
        if (!message) throw authError('FORBIDDEN', 'Mensaje no encontrado.');

        const chatId = ctx.db.normalizeId('socialChats', message.chatId);
        if (!chatId) throw authError('FORBIDDEN', 'Chat no encontrado.');
        await requireMembership(ctx, chatId, actor.idString);

        const existing = await ctx.db
            .query('socialMessageReactions')
            .withIndex('by_message_user', (q: any) =>
                q.eq('messageId', String(args.messageId)).eq('userId', actor.idString),
            )
            .first();

        if (existing) {
            if (existing.emoji === args.emoji) {
                await ctx.db.delete(existing._id);
                return { reacted: false };
            }
            await ctx.db.patch(existing._id, { emoji: args.emoji, createdAt: NOW() });
            return { reacted: true };
        }

        await ctx.db.insert('socialMessageReactions', {
            messageId: String(args.messageId),
            chatId: message.chatId,
            userId: actor.idString,
            emoji: args.emoji,
            createdAt: NOW(),
        });
        return { reacted: true };
    },
});

// ---------------------------------------------------------------------------
// Mutations — estado del chat
// ---------------------------------------------------------------------------

/**
 * Heartbeat de "escribiendo…". Degrada en silencio: lo dispara un timer del
 * composer y nunca debe romper el UI si la sesión venció.
 */
export const setTyping = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        typing: v.boolean(),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { success: false };
        const member = await getMembership(ctx, args.chatId, actor.idString);
        if (!member || member.state === 'left') return { success: false };

        const now = Date.now();
        const existing = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_chat_user', (q: any) =>
                q.eq('chatId', String(args.chatId)).eq('userId', actor.idString),
            )
            .first();

        if (!args.typing) {
            if (existing) await ctx.db.delete(existing._id);
            return { success: true };
        }

        if (existing) {
            // Si todavía le queda vida al TTL no escribimos: cada patch
            // invalida la suscripción de todos los que miran el chat.
            if (existing.expiresAt - now > TYPING_TTL_MS / 2) return { success: true };
            await ctx.db.patch(existing._id, { expiresAt: now + TYPING_TTL_MS, updatedAt: now });
        } else {
            await ctx.db.insert('socialChatTyping', {
                chatId: String(args.chatId),
                userId: actor.idString,
                expiresAt: now + TYPING_TTL_MS,
                updatedAt: now,
            });
        }
        return { success: true };
    },
});

/**
 * Heartbeat de presencia (el cliente lo llama cada ~60s en foreground y al
 * volver del background). Si el último latido es muy reciente no escribe:
 * cada escritura invalida las suscripciones de todos los que te ven en su
 * bandeja, así que el techo es ~1 write/minuto/usuario activo.
 */
export const heartbeat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        state: v.optional(v.union(v.literal('foreground'), v.literal('background'))),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { success: false };

        const now = Date.now();
        const existing = await ctx.db
            .query('socialPresence')
            .withIndex('by_user', (q: any) => q.eq('userId', actor.idString))
            .first();

        if (existing) {
            const goingOffline = args.state === 'background';
            if (!goingOffline && now - existing.lastSeenAt < PRESENCE_WINDOW_MS * 0.75) {
                return { success: true };
            }
            // Al pasar a background retrocedemos el reloj fuera de la ventana
            // de "activo ahora" para que el otro lado lo vea offline enseguida.
            await ctx.db.patch(existing._id, {
                lastSeenAt: goingOffline ? now - PRESENCE_WINDOW_MS : now,
            });
        } else {
            await ctx.db.insert('socialPresence', { userId: actor.idString, lastSeenAt: now });
        }
        return { success: true };
    },
});

export const acceptRequest = mutation({
    args: { sessionToken: v.optional(v.string()), chatId: v.id('socialChats') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        await ctx.db.patch(membership._id, { state: 'active' });
        return { success: true };
    },
});

/**
 * Rechaza una solicitud: el usuario sale del chat y deja de recibir mensajes,
 * pero el hilo no se borra (el emisor conserva su copia, igual que en IG).
 * Con `block: true` además bloquea a la contraparte.
 */
export const declineRequest = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        block: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        await ctx.db.patch(membership._id, { state: 'left', unreadCount: 0 });

        if (args.block) {
            const chat = await ctx.db.get(args.chatId);
            for (const other of chat?.participantIds ?? []) {
                if (other === actor.idString) continue;
                const already = await ctx.db
                    .query('socialBlocks')
                    .withIndex('by_pair', (q: any) =>
                        q.eq('blockerUserId', actor.idString).eq('blockedUserId', other),
                    )
                    .first();
                if (!already) {
                    await ctx.db.insert('socialBlocks', {
                        blockerUserId: actor.idString,
                        blockedUserId: other,
                        createdAt: NOW(),
                    });
                }
            }
        }
        return { success: true };
    },
});

export const blockUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
        blocked: v.boolean(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        if (actor.idString === args.userId) {
            throw authError('FORBIDDEN', 'No podés bloquearte a vos mismo.');
        }

        const existing = await ctx.db
            .query('socialBlocks')
            .withIndex('by_pair', (q: any) =>
                q.eq('blockerUserId', actor.idString).eq('blockedUserId', args.userId),
            )
            .first();

        if (args.blocked && !existing) {
            await ctx.db.insert('socialBlocks', {
                blockerUserId: actor.idString,
                blockedUserId: args.userId,
                createdAt: NOW(),
            });
        } else if (!args.blocked && existing) {
            await ctx.db.delete(existing._id);
        }
        return { blocked: args.blocked };
    },
});

export const listBlockedUsers = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return [];
        const rows = await ctx.db
            .query('socialBlocks')
            .withIndex('by_blocker', (q: any) => q.eq('blockerUserId', actor.idString))
            .collect();
        return await Promise.all(rows.map((r: any) => hydrateParticipant(ctx, r.blockedUserId)));
    },
});

export const muteChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        muted: v.boolean(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        // 100 años ≈ "para siempre", sin agregar otro campo al schema.
        const until = new Date(Date.now() + 100 * 365 * 24 * 3_600_000).toISOString();
        await ctx.db.patch(membership._id, { mutedUntil: args.muted ? until : undefined });
        return { success: true };
    },
});

export const archiveChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        archived: v.boolean(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        await ctx.db.patch(membership._id, { state: args.archived ? 'archived' : 'active' });
        return { success: true };
    },
});

export const leaveChat = mutation({
    args: { sessionToken: v.optional(v.string()), chatId: v.id('socialChats') },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const chat = await ctx.db.get(args.chatId);
        if (!chat) throw authError('FORBIDDEN', 'Chat no encontrado.');
        if (chat.kind !== 'group') {
            throw authError('FORBIDDEN', 'Solo se puede salir de un grupo.');
        }
        const membership = await requireMembership(ctx, args.chatId, actor.idString);
        await ctx.db.patch(membership._id, { state: 'left', unreadCount: 0 });
        await ctx.db.patch(args.chatId, {
            participantIds: chat.participantIds.filter((id: string) => id !== actor.idString),
        });
        return { success: true };
    },
});

// ---------------------------------------------------------------------------
// Mutations — administración de grupos
// ---------------------------------------------------------------------------

const requireGroupOwner = async (ctx: any, chatId: any, userId: string) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.kind !== 'group') {
        throw authError('FORBIDDEN', 'Esta conversación no es un grupo.');
    }
    const membership = await requireMembership(ctx, chatId, userId);
    const isOwner = membership.role === 'owner' || chat.createdByUserId === userId;
    if (!isOwner) throw authError('FORBIDDEN', 'Solo el creador del grupo puede hacer esto.');
    return chat;
};

export const addGroupMembers = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        userIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const chat = await requireGroupOwner(ctx, args.chatId, actor.idString);

        const toAdd = args.userIds.filter((id) => !chat.participantIds.includes(id));
        if (chat.participantIds.length + toAdd.length > GROUP_MAX_MEMBERS) {
            throw authError('FORBIDDEN', `Máximo ${GROUP_MAX_MEMBERS} integrantes.`);
        }

        const now = NOW();
        for (const id of toAdd) {
            const existing = await getMembership(ctx, args.chatId, id);
            if (existing) {
                await ctx.db.patch(existing._id, { state: 'active', role: 'member' });
            } else {
                await ctx.db.insert('socialChatMembers', {
                    chatId: args.chatId,
                    userId: id,
                    state: 'active',
                    role: 'member',
                    unreadCount: 0,
                    lastMessageAt: chat.lastMessageAt,
                    joinedAt: now,
                });
            }
        }
        await ctx.db.patch(args.chatId, {
            participantIds: [...chat.participantIds, ...toAdd],
        });
        return { added: toAdd.length };
    },
});

export const removeGroupMember = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        const chat = await requireGroupOwner(ctx, args.chatId, actor.idString);
        if (args.userId === actor.idString) {
            throw authError('FORBIDDEN', 'Usá "salir del grupo" para irte vos.');
        }

        const membership = await getMembership(ctx, args.chatId, args.userId);
        if (membership) await ctx.db.patch(membership._id, { state: 'left', unreadCount: 0 });
        await ctx.db.patch(args.chatId, {
            participantIds: chat.participantIds.filter((id: string) => id !== args.userId),
        });
        return { success: true };
    },
});

export const updateGroup = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        title: v.optional(v.string()),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await requireGroupOwner(ctx, args.chatId, actor.idString);

        const patch: any = {};
        if (args.title !== undefined) {
            const title = args.title.trim();
            if (!title) throw authError('FORBIDDEN', 'El grupo necesita un nombre.');
            patch.title = title;
        }
        if (args.avatar !== undefined) patch.avatar = args.avatar;
        await ctx.db.patch(args.chatId, patch);
        return { success: true };
    },
});

// ---------------------------------------------------------------------------
// Internals — migración y limpieza
// ---------------------------------------------------------------------------

/**
 * Backfill del modelo viejo: una fila de `socialChatMembers` por participante,
 * tomando el unread del `unreadCounts` deprecado. Idempotente — se puede
 * correr las veces que haga falta con `npx convex run social/dm:backfillMembers`.
 */
export const backfillMembers = internalMutation({
    args: {},
    handler: async (ctx) => {
        const chats = await ctx.db.query('socialChats').collect();
        let created = 0;

        for (const chat of chats) {
            if (!chat.kind) {
                await ctx.db.patch(chat._id, {
                    kind: chat.participantIds.length > 2 ? 'group' : 'direct',
                });
            }
            for (const userId of chat.participantIds) {
                const existing = await getMembership(ctx, chat._id, userId);
                if (existing) continue;
                await ctx.db.insert('socialChatMembers', {
                    chatId: chat._id,
                    userId,
                    state: 'active',
                    unreadCount: (chat.unreadCounts ?? {})[userId] ?? 0,
                    lastMessageAt: chat.lastMessageAt,
                    joinedAt: chat.createdAt ?? NOW(),
                });
                created += 1;
            }
        }
        return { chats: chats.length, membersCreated: created };
    },
});

/**
 * Resumen diferido: se agenda cuando llegan mensajes mientras el push del
 * chat está en cooldown. Si el destinatario ya leyó, no manda nada.
 */
export const internalSendChatDigest = internalMutation({
    args: { chatId: v.id('socialChats'), userId: v.string() },
    handler: async (ctx, args) => {
        const member = await getMembership(ctx, args.chatId, args.userId);
        if (!member) return { sent: false };
        await ctx.db.patch(member._id, { digestScheduledFor: undefined });

        if (member.state === 'left') return { sent: false };
        if (member.mutedUntil && member.mutedUntil > NOW()) return { sent: false };
        if (!member.unreadCount) return { sent: false };

        const chat = await ctx.db.get(args.chatId);
        if (!chat) return { sent: false };
        // Ya lo leyó entre medio: nada que avisar.
        if (member.lastReadAt && member.lastReadAt >= chat.lastMessageAt) return { sent: false };

        const senderProfile = chat.lastMessageSenderId
            ? await profileOf(ctx, chat.lastMessageSenderId)
            : null;
        const who = chat.kind === 'group' ? chat.title ?? 'Grupo' : senderProfile?.displayName ?? 'Alguien';

        await ctx.db.patch(member._id, { lastNotifiedAt: NOW() });
        await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
            sendEmail: false,
            userId: args.userId,
            title: who,
            body:
                member.unreadCount === 1
                    ? chat.lastMessagePreview ?? 'Nuevo mensaje'
                    : `${member.unreadCount} mensajes nuevos`,
            category: 'social',
            data: { type: 'dm', chatId: String(args.chatId) },
        });
        return { sent: true };
    },
});

/** Cron: barre "escribiendo…" vencidos y presencia vieja. */
export const cleanupEphemeral = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const staleTyping = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_expires', (q: any) => q.lt('expiresAt', now))
            .collect();
        for (const row of staleTyping) await ctx.db.delete(row._id);

        // Presencia más vieja que 30 días no aporta nada al "activo hace X".
        const cutoff = now - 30 * 24 * 3_600_000;
        const stalePresence = await ctx.db
            .query('socialPresence')
            .withIndex('by_lastSeen', (q: any) => q.lt('lastSeenAt', cutoff))
            .collect();
        for (const row of stalePresence) await ctx.db.delete(row._id);

        return { typing: staleTyping.length, presence: stalePresence.length };
    },
});
