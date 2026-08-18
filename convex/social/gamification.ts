/**
 * Puntos por comportamiento social. Reusa el motor de `economy/pointsEngine`
 * (Fase 0): idempotencia y tope diario por `eventKey`, monto fijado del lado
 * del servidor. El cliente nunca decide cuánto vale una acción — sólo la
 * ejecuta (publicar, comentar) y el servidor decide si corresponde premio.
 *
 * Deliberadamente NO se premia recibir likes/seguidores: invita a granjas de
 * cuentas (crear alts para darse like a uno mismo). Los hitos de seguidores
 * son one-time y escalonados, que da la misma satisfacción sin ese vector.
 */

import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { awardPoints, buildEventKey, revokePoints } from '../economy/pointsEngine';

type SocialRewardDef = {
    points: number;
    description: string;
    dailyMax: number;
};

export const SOCIAL_REWARDS: Record<string, SocialRewardDef> = {
    sp_post: { points: 10, description: 'Publicaste en la red social', dailyMax: 3 },
    sp_cmt: { points: 2, description: 'Comentaste en un post', dailyMax: 5 },
    sp_story: { points: 5, description: 'Publicaste una historia', dailyMax: 1 },
    sp_community_join: { points: 20, description: 'Te uniste a una comunidad', dailyMax: 3 },
    // One-time por post (el `eventKey` usa el propio postId como entidad, así
    // que da igual que el like 11, 12... vuelvan a disparar el chequeo).
    sp_post_milestone_10: { points: 15, description: 'Tu post llegó a 10 likes', dailyMax: 20 },
};

/** Umbral mínimo de calidad para que un post/comentario cobre puntos. */
export const qualifiesForReward = (content: string, hasMedia: boolean): boolean =>
    hasMedia || (content?.trim().length ?? 0) >= 10;

/**
 * Otorga un punto social. `entityId` es el id del post/story/comment — junto
 * con la fecha arma el `eventKey`, que es a la vez la idempotencia y el tope
 * diario (ver `pointsEngine.ts`). Nunca lanza: un fallo en la gamificación
 * jamás debe tumbar la mutation social que la disparó.
 */
export const awardSocialAction = async (
    ctx: any,
    userId: string,
    kind: keyof typeof SOCIAL_REWARDS,
    entityId: string,
): Promise<void> => {
    const def = SOCIAL_REWARDS[kind];
    if (!def) return;
    try {
        await awardPoints(ctx, {
            userId,
            eventKey: buildEventKey(kind, entityId),
            amount: def.points,
            description: def.description,
            source: 'bonus',
            dailyCapKind: kind,
            dailyCapMax: def.dailyMax,
        });
    } catch (e) {
        console.warn('[social.gamification] award failed', kind, e);
    }
};

/**
 * Clawback cuando un admin remueve contenido que ya había cobrado puntos
 * (Fase 2, `moderation.applyModerationAction`). Se agenda con el scheduler
 * porque `moderation.ts` corre dentro de una mutation y este archivo importa
 * `pointsEngine`, que a su vez es importado por `economy.ts` — para evitar
 * un ciclo de imports, el llamador usa `internal.social.gamification.*` en
 * vez de llamar la función directamente.
 */
export const internalRevokeContentReward = internalMutation({
    args: {
        userId: v.string(),
        kind: v.string(),
        entityId: v.string(),
        reason: v.string(),
        /**
         * Fecha (YYYY-MM-DD) en que se creó el contenido, NO la de hoy.
         * `eventKey` embebe el día para poder rankear el tope diario por
         * rango (`kind:día:`), así que reconstruirlo con la fecha de hoy en
         * vez de la original apuntaría a un `eventKey` que nunca existió y
         * el clawback sería un no-op silencioso. Obligatorio a propósito:
         * ningún llamador debe apoyarse en un default de "hoy".
         */
        day: v.string(),
    },
    handler: async (ctx, args) => {
        await revokePoints(ctx, {
            userId: args.userId,
            eventKey: buildEventKey(args.kind, args.entityId, args.day),
            reason: args.reason,
        });
    },
});
