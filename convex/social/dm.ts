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
import { resolveMediaUrl } from '../mediaUrl';
import { toUserCard, socialProfileOf } from '../userCard';
import { assertTextAllowed } from './moderationText';

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
        // Respuesta a una historia (Fase 7): reusa este mismo transporte en
        // vez de un sistema de reacciones-a-stories aparte.
        v.literal('story'),
    ),
    url: v.string(),
    metadata: v.optional(v.any()),
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

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
 * Permiso de LECTURA sobre un chat. Las queries no pueden escribir, así que
 * no hacen el backfill perezoso de `requireMembership`: si no hay fila de
 * membresía (chat anterior a `socialChatMembers`) se cae a `participantIds`.
 *
 * Lo que NO hace es confiar en `participantIds` cuando la membresía existe:
 * al rechazar una solicitud o salir de un grupo la fila queda en `'left'`
 * pero el id sigue en `participantIds`, así que gatear por el array dejaba
 * seguir leyendo el hilo —incluidos los mensajes nuevos— a alguien que ya
 * no está en la conversación.
 */
const canRead = async (ctx: any, chat: any, chatId: any, userId: string) => {
    if (!chat) return { allowed: false, member: null as any };
    const member = await getMembership(ctx, chatId, userId);
    if (member) return { allowed: member.state !== 'left', member };
    return { allowed: chat.participantIds.includes(userId), member: null as any };
};

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

/**
 * Tarjeta del participante. Lee `users` (que SIEMPRE existe) además del
 * perfil social: antes miraba sólo `socialUsers`, así que cualquiera que no
 * hubiera posteado ni seguido a nadie aparecía en el chat como "Usuario" sin
 * @, aunque tuviera nombre y handle desde el registro.
 */
const hydrateParticipant = async (ctx: any, userId: string) => {
    const [social, presence] = await Promise.all([
        socialProfileOf(ctx, userId),
        presenceOf(ctx, userId),
    ]);
    const ref = ctx.db.normalizeId('users', userId);
    const user = ref ? await ctx.db.get(ref) : null;

    if (!user) {
        return {
            userId,
            username: social?.username ?? null,
            displayName: social?.displayName ?? 'Usuario',
            avatar: (await resolveMediaUrl(ctx, social?.avatar)) ?? null,
            verified: social?.verified === true,
            isInfluencer: social?.isInfluencer === true,
            ...presence,
        };
    }
    const card = await toUserCard(ctx, user, social);
    return { ...card, userId, ...presence };
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

/** Tipos de adjunto que el cliente puede mandar tal cual. */
const CLIENT_ATTACHMENT_TYPES = new Set(['image', 'video', 'document']);
const MAX_ATTACHMENTS = 10;

/**
 * Un `convex-storage:<id>` sólo se acepta de quien lo subió.
 *
 * `attachments[].url` es un string libre y `resolveMediaUrl` le firma una URL
 * de descarga a lo que sea: sin esta comprobación, cualquiera podía adjuntar
 * el id de un archivo ajeno en su propio chat y minar una URL para bajarlo.
 * Se valida al ESCRIBIR, no al leer, así los adjuntos ya guardados —subidos
 * antes de que existiera `mediaAssets`— siguen resolviendo.
 */
const assertOwnsMedia = async (ctx: any, actorId: string, raw?: string | null) => {
    if (!raw || !raw.startsWith('convex-storage:')) return;
    const storageId = raw.replace('convex-storage:', '').trim();
    const asset = await ctx.db
        .query('mediaAssets')
        .withIndex('by_storage', (q: any) => q.eq('storageId', storageId))
        .first();
    if (!asset || asset.ownerUserId !== actorId) {
        throw authError('FORBIDDEN', 'Ese archivo no es tuyo.');
    }
};

/**
 * Adjuntos que vienen del cliente. `listing` y `post` quedan prohibidos acá:
 * su `metadata` es `v.any()`, así que un cliente podía armar a mano una
 * tarjeta de producto con precio falso y con `sharedByUserId` apuntando a
 * quien quisiera —y `commerce.internalGetDmListingAttribution` le pagaba la
 * comisión a ese id—. La única vía es `shareListingInChat`/`sharePostInChat`,
 * que arman el snapshot en el servidor.
 */
const assertClientAttachments = async (ctx: any, actorId: string, attachments?: any[]) => {
    if (!attachments?.length) return;
    if (attachments.length > MAX_ATTACHMENTS) {
        throw authError('FORBIDDEN', 'Demasiados adjuntos en un mensaje.');
    }
    for (const a of attachments) {
        if (!CLIENT_ATTACHMENT_TYPES.has(a.type)) {
            throw authError(
                'FORBIDDEN',
                'Los productos y las publicaciones se comparten desde su propia pantalla.',
            );
        }
        await assertOwnsMedia(ctx, actorId, a.url);
    }
};

/**
 * Normaliza y valida una lista de ids de miembros: deduplica, saca al propio
 * actor, exige que cada id sea un usuario que existe de verdad y respeta los
 * bloqueos. Sin esto entraban ids inventados, que quedaban en
 * `participantIds` inflando el contador de integrantes con gente fantasma.
 */
const resolveMemberIds = async (ctx: any, actorId: string, rawIds: string[]) => {
    const unique = Array.from(new Set(rawIds.filter((id) => id && id !== actorId)));
    const resolved: string[] = [];
    for (const id of unique) {
        const ref = ctx.db.normalizeId('users', id);
        const user = ref ? await ctx.db.get(ref) : null;
        if (!user) throw authError('FORBIDDEN', 'Alguna de las personas no existe.');
        await assertNotBlocked(ctx, actorId, id);
        resolved.push(String(user._id));
    }
    return resolved;
};

/**
 * Evento del hilo ("Fulana salió del grupo"). No suma no-leídos ni dispara
 * push: es contexto, no un mensaje que alguien tenga que responder. Sin esto
 * un grupo ganaba y perdía integrantes en silencio.
 */
const systemMessage = async (ctx: any, chatId: any, text: string) => {
    const now = NOW();
    await ctx.db.insert('socialMessages', {
        chatId: String(chatId),
        senderUserId: 'system',
        kind: 'system' as const,
        body: text,
        createdAt: now,
    });
    await ctx.db.patch(chatId, { lastMessageAt: now, lastMessagePreview: text });
};

/** Nombre para mostrar en los mensajes de sistema. */
const nameOf = async (ctx: any, userId: string) => {
    const profile = await profileOf(ctx, userId);
    if (profile?.displayName && !profile.displayName.includes('@')) return profile.displayName;
    const ref = ctx.db.normalizeId('users', userId);
    const user = ref ? await ctx.db.get(ref) : null;
    return user?.nickname || user?.name || profile?.username || 'Alguien';
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
        folder: v.optional(
            v.union(v.literal('inbox'), v.literal('requests'), v.literal('archived')),
        ),
        cursor: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await getActorOrNull(ctx, args.sessionToken);
        if (!actor) return { items: [], nextCursor: null };

        const state =
            args.folder === 'requests'
                ? 'request'
                : args.folder === 'archived'
                  ? 'archived'
                  : 'active';
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

        // Con tope: esto corre en cada foreground de la app y un usuario con
        // miles de conversaciones no puede hacerle leer la tabla entera.
        const UNREAD_SCAN_CAP = 500;
        const active = await ctx.db
            .query('socialChatMembers')
            .withIndex('by_user_state_last', (q: any) =>
                q.eq('userId', actor.idString).eq('state', 'active'),
            )
            .order('desc')
            .take(UNREAD_SCAN_CAP);
        const requests = await ctx.db
            .query('socialChatMembers')
            .withIndex('by_user_state_last', (q: any) =>
                q.eq('userId', actor.idString).eq('state', 'request'),
            )
            .take(UNREAD_SCAN_CAP);

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
        const { allowed, member } = await canRead(ctx, chat, args.chatId, actor.idString);
        if (!chat || !allowed) return null;

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
        const { allowed } = await canRead(ctx, chat, args.chatId, actor.idString);
        if (!chat || !allowed) {
            return { items: [], nextCursor: null, readerLastReadAt: null };
        }

        const cap = Math.min(args.limit ?? 40, 100);
        const page = await ctx.db
            .query('socialMessages')
            .withIndex('by_chat_created', (q: any) => q.eq('chatId', String(args.chatId)))
            .order('desc')
            .paginate({ cursor: args.cursor ?? null, numItems: cap });

        // En grupos hay que poder ver quién mandó cada mensaje. Se resuelve
        // una vez por emisor distinto, no una vez por mensaje.
        const senderCards = new Map<string, any>();
        if (chat.kind === 'group') {
            for (const msg of page.page) {
                if (msg.senderUserId === 'system' || senderCards.has(msg.senderUserId)) continue;
                const social = await socialProfileOf(ctx, msg.senderUserId);
                const ref = ctx.db.normalizeId('users', msg.senderUserId);
                const u = ref ? await ctx.db.get(ref) : null;
                senderCards.set(
                    msg.senderUserId,
                    u
                        ? await toUserCard(ctx, u, social)
                        : { displayName: social?.displayName ?? 'Alguien', avatar: null },
                );
            }
        }

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
                    // El padre TIENE que ser de este mismo chat. `sendMessage`
                    // ya lo valida al escribir; esto es defensa en profundidad
                    // para las filas guardadas antes de esa validación, que
                    // podían citar un mensaje de una conversación ajena y
                    // filtrar su texto acá.
                    if (parent && parent.chatId === String(args.chatId)) {
                        replyTo = {
                            messageId: String(parent._id),
                            senderUserId: parent.senderUserId,
                            body: parent.deletedAt
                                ? 'Mensaje eliminado'
                                : previewFor(parent.body, parent.attachments),
                        };
                    }
                }

                const sender = senderCards.get(msg.senderUserId);
                return {
                    _id: String(msg._id),
                    senderUserId: msg.senderUserId,
                    senderName: sender?.displayName ?? null,
                    senderAvatar: sender?.avatar ?? null,
                    kind: msg.kind ?? 'user',
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

        // Sin este chequeo, cualquier usuario autenticado pasaba un chatId
        // ajeno y obtenía el userId y el nombre de quienes escriben ahí.
        const member = await getMembership(ctx, args.chatId, actor.idString);
        if (!member || member.state === 'left') return [];

        const rows = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_chat', (q: any) => q.eq('chatId', String(args.chatId)))
            .take(GROUP_MAX_MEMBERS);

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
 * Resuelve (o crea) el hilo 1:1 entre dos personas. Extraído de la mutation
 * para que compartir con alguien a quien nunca le escribiste sea UNA sola
 * transacción: resolver-crear-y-enviar. Hacerlo en dos llamadas desde el
 * cliente deja una conversación vacía colgada si el envío falla.
 */
const resolveDirectChat = async (ctx: any, actorId: string, participantId: string) => {
    if (actorId === participantId) {
        throw authError('FORBIDDEN', 'No podés abrir un chat con vos mismo.');
    }

    const target = ctx.db.normalizeId('users', participantId);
    if (!target || !(await ctx.db.get(target))) {
        throw authError('FORBIDDEN', 'Ese usuario no existe.');
    }
    await assertNotBlocked(ctx, actorId, participantId);

    const key = sortedKey([actorId, participantId]);
    const existing = await ctx.db
        .query('socialChats')
        .withIndex('by_participants_key', (q: any) => q.eq('participantsKey', key))
        .first();
    if (existing) {
        await requireMembership(ctx, existing._id, actorId);
        return existing._id;
    }

    const now = NOW();
    const chatId = await ctx.db.insert('socialChats', {
        kind: 'direct',
        participantIds: [actorId, participantId],
        participantsKey: key,
        createdByUserId: actorId,
        lastMessageAt: now,
        createdAt: now,
    });

    // El que abre el chat siempre lo ve en su bandeja; el receptor recién
    // aparece cuando llega el primer mensaje (ver `sendMessage`).
    await ctx.db.insert('socialChatMembers', {
        chatId,
        userId: actorId,
        state: 'active',
        unreadCount: 0,
        lastReadAt: now,
        lastMessageAt: now,
        joinedAt: now,
    });

    return chatId;
};

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
        return String(await resolveDirectChat(ctx, actor.idString, args.participantId));
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

        const unique = await resolveMemberIds(ctx, actor.idString, args.participantIds);
        if (unique.length < 2) {
            throw authError('FORBIDDEN', 'Un grupo necesita al menos 3 personas.');
        }
        if (unique.length + 1 > GROUP_MAX_MEMBERS) {
            throw authError('FORBIDDEN', `Máximo ${GROUP_MAX_MEMBERS} integrantes.`);
        }
        const title = args.title.trim();
        if (!title) throw authError('FORBIDDEN', 'El grupo necesita un nombre.');
        await assertOwnsMedia(ctx, actor.idString, args.avatar);

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
 * Entrega de un mensaje ya validado: inserta, actualiza el hilo, hace el
 * fan-out de no-leídos y programa el push.
 *
 * Vive aparte de la mutation pública para que compartir un producto o una
 * publicación no tenga que pasar por `sendMessage` —que ahora rechaza esos
 * tipos de adjunto— y para evitar el `ctx.runMutation` de ida y vuelta.
 */
const deliverMessage = async (
    ctx: any,
    actor: { idString: string },
    args: {
        chatId: any;
        body?: string;
        attachments?: any[];
        replyToId?: string;
        clientId?: string;
    },
): Promise<string> => {
    {
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

        // Filtro de palabras (Fase 2). En DMs sólo corta si es `block`; un
        // `flag` en un mensaje privado no genera reporte automático (a
        // diferencia de posts/comentarios) porque no hay nadie más que un
        // admin pueda revisar sin violar la privacidad de la conversación.
        if (body) await assertTextAllowed(ctx, body, 'dm');

        // El mensaje citado tiene que ser de ESTE chat. Sin este chequeo se
        // podía citar cualquier id del sistema y `getChatMessages` devolvía
        // el emisor y los primeros 60 caracteres de un mensaje ajeno.
        if (args.replyToId) {
            const parentRef = ctx.db.normalizeId('socialMessages', args.replyToId);
            const parent = parentRef ? await ctx.db.get(parentRef) : null;
            if (!parent || parent.chatId !== String(args.chatId)) {
                throw authError('FORBIDDEN', 'No podés citar un mensaje de otra conversación.');
            }
        }

        // En 1:1 el bloqueo corta el envío. En grupos no: bloquear a una
        // persona no puede silenciarte el grupo entero — se filtra al leer.
        if (chat.kind !== 'group') {
            for (const other of chat.participantIds) {
                if (other !== actor.idString) await assertNotBlocked(ctx, actor.idString, other);
            }
        }

        // `checkRateLimit` ya tira un ConvexError con `code: 'RATE_LIMITED'`,
        // así que se deja propagar tal cual. Envolverlo acá volvería a
        // aplanar el código que el cliente necesita para distinguirlo.
        await checkRateLimit(ctx, `dm:send:${actor.idString}`, 60, 60_000);

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
        // Sólo en 1:1 — en un grupo `participantIds[0]` no significa nada y
        // cualquier integrante contaminaba `sellerResponseTimeHours`.
        if (chat.kind !== 'group' && !chat.firstRepliedAt && chat.participantIds[0] !== actor.idString) {
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
            // Las solicitudes no notifican: son de gente con la que todavía no
            // aceptaste hablar, y sonaban igual que un chat aceptado.
            if (member?.state === 'request') continue;

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
    }
};

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
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await assertClientAttachments(ctx, actor.idString, args.attachments);
        return await deliverMessage(ctx, actor, args);
    },
});

/**
 * Snapshot de un producto, armado ENTERAMENTE en el servidor: título, precio,
 * imagen y `sharedByUserId` salen de la base. Si vinieran del cliente,
 * cualquiera podría inventar un precio o atribuirse la recomendación —y con
 * ella la comisión— porque `attachments[].metadata` es `v.any()`.
 */
const buildListingAttachment = async (ctx: any, actorId: string, listingId: string) => {
    const listingRef = ctx.db.normalizeId('listings', listingId);
    const listing: any = listingRef ? await ctx.db.get(listingRef) : null;
    if (!listing) throw authError('FORBIDDEN', 'Ese producto no existe.');

    const rawImage =
        listing.images?.find((i: any) => i.isPrimary)?.url ??
        listing.images?.[0]?.url ??
        listing.image ??
        listing.gallery?.[0];

    return {
        type: 'listing' as const,
        url: String(listing._id),
        metadata: {
            listingId: String(listing._id),
            sharedByUserId: actorId,
            title: listing.title,
            price: listing.price,
            discountPercent: listing.discountPercent ?? 0,
            image: await resolveMediaUrl(ctx, rawImage),
            sellerId: listing.sellerId,
            listingType: listing.type,
        },
    };
};

/** Ídem para una publicación del feed: la vista previa sale del post real. */
const buildPostAttachment = async (ctx: any, actorId: string, postId: string) => {
    const postRef = ctx.db.normalizeId('socialPosts', postId);
    const post: any = postRef ? await ctx.db.get(postRef) : null;
    if (!post) throw authError('FORBIDDEN', 'Esa publicación no existe.');

    const authorProfile = await profileOf(ctx, post.authorUserId);
    const rawImage = post.images?.[0] ?? post.commercialProduct?.image;
    const text = (post.content ?? '').trim();

    return {
        type: 'post' as const,
        url: String(post._id),
        metadata: {
            postId: String(post._id),
            sharedByUserId: actorId,
            authorUserId: post.authorUserId,
            authorUsername: authorProfile?.username ?? null,
            preview: text ? text.slice(0, 140) : (post.commercialProduct?.name ?? 'Publicación'),
            image: await resolveMediaUrl(ctx, rawImage),
        },
    };
};

/** Comparte un producto en un chat en el que ya estás. */
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
        return await deliverMessage(ctx, actor, {
            chatId: args.chatId,
            body: args.note ?? '',
            clientId: args.clientId,
            attachments: [await buildListingAttachment(ctx, actor.idString, args.listingId)],
        });
    },
});

/** Comparte una publicación en un chat en el que ya estás. */
const buildStoryAttachment = async (ctx: any, actorId: string, storyId: string) => {
    const storyRef = ctx.db.normalizeId('socialStories', storyId);
    const story: any = storyRef ? await ctx.db.get(storyRef) : null;
    if (!story || story.deletedAt) throw authError('FORBIDDEN', 'Esa historia ya no existe.');

    const authorProfile = await profileOf(ctx, story.authorUserId);
    return {
        type: 'story' as const,
        url: String(story._id),
        metadata: {
            storyId: String(story._id),
            sharedByUserId: actorId,
            authorUserId: story.authorUserId,
            authorUsername: authorProfile?.username ?? null,
            preview: await resolveMediaUrl(ctx, story.url),
            storyType: story.type,
        },
    };
};

/** Responder a una historia = mandar un DM con la historia adjunta. Reusa
 *  TODO `deliverMessage` (rate limit, bloqueo, idempotencia) en vez de un
 *  sistema de reacciones a stories aparte. */
export const shareStoryInChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        storyId: v.string(),
        note: v.optional(v.string()),
        clientId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await requireMembership(ctx, args.chatId, actor.idString);
        return await deliverMessage(ctx, actor, {
            chatId: args.chatId,
            body: args.note ?? '',
            clientId: args.clientId,
            attachments: [await buildStoryAttachment(ctx, actor.idString, args.storyId)],
        });
    },
});

export const sharePostInChat = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        chatId: v.id('socialChats'),
        postId: v.string(),
        note: v.optional(v.string()),
        clientId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<string> => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        await requireMembership(ctx, args.chatId, actor.idString);
        return await deliverMessage(ctx, actor, {
            chatId: args.chatId,
            body: args.note ?? '',
            clientId: args.clientId,
            attachments: [await buildPostAttachment(ctx, actor.idString, args.postId)],
        });
    },
});

/**
 * Compartir con alguien a quien nunca le escribiste. Resuelve-o-crea el hilo
 * y envía en la MISMA transacción: hacerlo en dos llamadas desde el cliente
 * deja una conversación vacía si el envío falla.
 */
export const shareToUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        participantId: v.string(),
        listingId: v.optional(v.string()),
        postId: v.optional(v.string()),
        body: v.optional(v.string()),
        clientId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ chatId: string; messageId: string }> => {
        const actor = await assertSocialActor(ctx, (args as any).sessionToken);
        if (!args.listingId && !args.postId && !args.body?.trim()) {
            throw authError('FORBIDDEN', 'No hay nada para enviar.');
        }

        const chatId = await resolveDirectChat(ctx, actor.idString, args.participantId);
        const attachments = args.listingId
            ? [await buildListingAttachment(ctx, actor.idString, args.listingId)]
            : args.postId
              ? [await buildPostAttachment(ctx, actor.idString, args.postId)]
              : undefined;

        const messageId = await deliverMessage(ctx, actor, {
            chatId,
            body: args.body ?? '',
            clientId: args.clientId,
            attachments,
        });
        return { chatId: String(chatId), messageId };
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
        if (message.deletedAt) return { success: true };
        await ctx.db.patch(args.messageId, { deletedAt: NOW() });

        const chatId = ctx.db.normalizeId('socialChats', message.chatId);
        const chat = chatId ? await ctx.db.get(chatId) : null;

        // Si era el último del chat, el preview tiene que reflejarlo.
        if (chat && chat.lastMessageAt === message.createdAt) {
            await ctx.db.patch(chat._id, { lastMessagePreview: 'Mensaje eliminado' });
        }

        // El no-leído tiene que bajar para quien todavía no lo había abierto:
        // si no, queda un badge apuntando a un mensaje que ya no existe.
        if (chatId) {
            for (const m of await listMemberships(ctx, chatId)) {
                if (m.userId === actor.idString || m.state === 'left') continue;
                const unseen = !m.lastReadAt || m.lastReadAt < message.createdAt;
                if (unseen && (m.unreadCount ?? 0) > 0) {
                    await ctx.db.patch(m._id, { unreadCount: m.unreadCount - 1 });
                }
            }
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
        const membership = await requireMembership(ctx, chatId, actor.idString);
        if (membership.state === 'left') {
            throw authError('FORBIDDEN', 'Ya no formás parte de esta conversación.');
        }
        if (message.kind === 'system') {
            throw authError('FORBIDDEN', 'No se puede reaccionar a un aviso del grupo.');
        }
        // No se le puede reaccionar a alguien que te bloqueó.
        if (message.senderUserId !== actor.idString) {
            await assertNotBlocked(ctx, actor.idString, message.senderUserId);
        }

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
        if (membership.state !== 'request') {
            throw authError('FORBIDDEN', 'Esta conversación no es una solicitud.');
        }
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

            // Bloquear tiene que desmontar lo que ya existe, no sólo impedir
            // lo nuevo: el chat 1:1 compartido sale de las dos bandejas.
            const pairKey = sortedKey([actor.idString, args.userId]);
            const shared = await ctx.db
                .query('socialChats')
                .withIndex('by_participants_key', (q: any) => q.eq('participantsKey', pairKey))
                .first();
            if (shared) {
                for (const m of await listMemberships(ctx, shared._id)) {
                    if (m.state !== 'left') {
                        await ctx.db.patch(m._id, { state: 'left', unreadCount: 0 });
                    }
                }
            }
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
            .take(200);
        return await Promise.all(
            rows.map(async (r: any) => {
                // Sin `lastSeenAt`: a quien bloqueaste no le tenés que estar
                // publicando tu estado de conexión desde tu propia lista.
                const { lastSeenAt, ...card } = await hydrateParticipant(ctx, r.blockedUserId);
                return card;
            }),
        );
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
        if (args.archived) {
            if (membership.state === 'left') {
                throw authError('FORBIDDEN', 'Ya no formás parte de esta conversación.');
            }
            await ctx.db.patch(membership._id, { state: 'archived' });
        } else if (membership.state === 'archived') {
            // Desarchivar no puede ascender una solicitud a la bandeja, así
            // que sólo actúa sobre lo que está efectivamente archivado.
            await ctx.db.patch(membership._id, { state: 'active' });
        }
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
        await ctx.db.patch(membership._id, { state: 'left', unreadCount: 0, role: undefined });

        const remaining = chat.participantIds.filter((id: string) => id !== actor.idString);
        const chatPatch: any = { participantIds: remaining };

        // Sucesión: si se va quien administraba, el grupo quedaba sin nadie
        // que pudiera agregar, sacar o renombrar — `requireGroupOwner` fallaba
        // para todos porque `createdByUserId` seguía apuntando al que se fue.
        const wasOwner = membership.role === 'owner' || chat.createdByUserId === actor.idString;
        if (wasOwner) {
            const heir = (await listMemberships(ctx, args.chatId))
                .filter((m: any) => m.state !== 'left' && m.userId !== actor.idString)
                .sort((a: any, b: any) => a.joinedAt.localeCompare(b.joinedAt))[0];
            if (heir) {
                await ctx.db.patch(heir._id, { role: 'owner' });
                chatPatch.createdByUserId = heir.userId;
            }
        }
        await ctx.db.patch(args.chatId, chatPatch);
        await systemMessage(ctx, args.chatId, `${await nameOf(ctx, actor.idString)} salió del grupo`);
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

        const candidates = await resolveMemberIds(ctx, actor.idString, args.userIds);
        const toAdd = candidates.filter((id) => !chat.participantIds.includes(id));
        if (!toAdd.length) return { added: 0 };
        if (chat.participantIds.length + toAdd.length > GROUP_MAX_MEMBERS) {
            throw authError('FORBIDDEN', `Máximo ${GROUP_MAX_MEMBERS} integrantes.`);
        }

        const now = NOW();
        for (const id of toAdd) {
            const existing = await getMembership(ctx, args.chatId, id);
            if (existing) {
                // Vuelve a entrar: el badge no puede arrastrar los no-leídos
                // que quedaron de antes de que lo sacaran.
                await ctx.db.patch(existing._id, {
                    state: 'active',
                    role: 'member',
                    unreadCount: 0,
                    joinedAt: now,
                });
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

        const names = await Promise.all(toAdd.map((id) => nameOf(ctx, id)));
        await systemMessage(
            ctx,
            args.chatId,
            `${await nameOf(ctx, actor.idString)} agregó a ${names.join(', ')}`,
        );
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
        if (membership) {
            await ctx.db.patch(membership._id, { state: 'left', unreadCount: 0, role: undefined });
        }
        await ctx.db.patch(args.chatId, {
            participantIds: chat.participantIds.filter((id: string) => id !== args.userId),
        });
        await systemMessage(
            ctx,
            args.chatId,
            `${await nameOf(ctx, actor.idString)} sacó a ${await nameOf(ctx, args.userId)}`,
        );
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
        let renamedTo: string | null = null;
        if (args.title !== undefined) {
            const title = args.title.trim();
            if (!title) throw authError('FORBIDDEN', 'El grupo necesita un nombre.');
            patch.title = title;
            renamedTo = title;
        }
        if (args.avatar !== undefined) {
            await assertOwnsMedia(ctx, actor.idString, args.avatar);
            patch.avatar = args.avatar;
        }
        await ctx.db.patch(args.chatId, patch);
        if (renamedTo) {
            await systemMessage(
                ctx,
                args.chatId,
                `${await nameOf(ctx, actor.idString)} cambió el nombre del grupo a "${renamedTo}"`,
            );
        }
        return { success: true };
    },
});

// ---------------------------------------------------------------------------
// Internals — migración y limpieza
// ---------------------------------------------------------------------------

/**
 * Backfill del modelo viejo: una fila de `socialChatMembers` por participante,
 * tomando el unread del `unreadCounts` deprecado.
 *
 * Dos cosas que la versión anterior hacía mal:
 *
 * 1. Leía la tabla entera con `.collect()`. Va por lotes con marca de agua
 *    sobre `_creationTime`, así es resumible y no revienta el límite de
 *    lectura cuando `socialChats` crece.
 * 2. No escribía `participantsKey`. `getOrCreateDirectChat` busca por ese
 *    índice, así que cada chat 1:1 viejo quedaba invisible y al reabrirlo se
 *    creaba un hilo NUEVO, partiendo el historial en dos.
 *
 * Idempotente: correrlo de nuevo devuelve todos los contadores en cero.
 * `npx convex run social/dm:backfillMembers '{"chain":true}'`
 */
export const backfillMembers = internalMutation({
    args: {
        cursor: v.optional(v.number()),
        batchSize: v.optional(v.number()),
        chain: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));
        const chats = await ctx.db
            .query('socialChats')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        let membersCreated = 0;
        let keysBackfilled = 0;
        let kindsBackfilled = 0;

        for (const chat of chats) {
            const patch: any = {};
            const isDirect = (chat.kind ?? (chat.participantIds.length > 2 ? 'group' : 'direct')) === 'direct';
            if (!chat.kind) {
                patch.kind = isDirect ? 'direct' : 'group';
                kindsBackfilled += 1;
            }
            if (isDirect && !chat.participantsKey && chat.participantIds.length === 2) {
                patch.participantsKey = sortedKey(chat.participantIds);
                keysBackfilled += 1;
            }
            if (Object.keys(patch).length) await ctx.db.patch(chat._id, patch);

            for (const userId of chat.participantIds) {
                const existing = await getMembership(ctx, chat._id, userId);
                if (existing) continue;
                await ctx.db.insert('socialChatMembers', {
                    chatId: chat._id,
                    userId,
                    state: 'active',
                    role: isDirect ? undefined : 'member',
                    unreadCount: (chat.unreadCounts ?? {})[userId] ?? 0,
                    lastMessageAt: chat.lastMessageAt,
                    joinedAt: chat.createdAt ?? NOW(),
                });
                membersCreated += 1;
            }
        }

        const isDone = chats.length < batchSize;
        const cursor = chats.length ? chats[chats.length - 1]._creationTime : (args.cursor ?? null);

        if (!isDone && args.chain) {
            await ctx.scheduler.runAfter(0, internal.social.dm.backfillMembers, {
                cursor: cursor ?? undefined,
                batchSize,
                chain: true,
            });
        }

        return { scanned: chats.length, membersCreated, keysBackfilled, kindsBackfilled, cursor, isDone };
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
        // Con tope: sin él, un backlog tras una caída del cron hace que el
        // barrido supere el límite de lectura y falle SIEMPRE — y como este
        // es el único que limpia, nunca se recupera solo. Con tope, cada
        // corrida avanza un poco y el sistema se cura en unos ciclos.
        const SWEEP_CAP = 500;

        const staleTyping = await ctx.db
            .query('socialChatTyping')
            .withIndex('by_expires', (q: any) => q.lt('expiresAt', now))
            .take(SWEEP_CAP);
        for (const row of staleTyping) await ctx.db.delete(row._id);

        // Presencia más vieja que 30 días no aporta nada al "activo hace X".
        const cutoff = now - 30 * 24 * 3_600_000;
        const stalePresence = await ctx.db
            .query('socialPresence')
            .withIndex('by_lastSeen', (q: any) => q.lt('lastSeenAt', cutoff))
            .take(SWEEP_CAP);
        for (const row of stalePresence) await ctx.db.delete(row._id);

        return { typing: staleTyping.length, presence: stalePresence.length };
    },
});
