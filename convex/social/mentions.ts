/**
 * @menciones: resuelve handles contra el handle canónico (`users.username`,
 * NO `socialUsers.username` — ese es sólo un espejo, ver `users/identity.ts`),
 * registra la mención y avisa al mencionado por actividad + push, con
 * throttle y respetando bloqueos/mutes.
 */

import { internal } from '../_generated/api';
import { isBlockedBetween } from './_helpers';
import { recordActivity } from './activity';
import { wasNotifiedRecently } from './_helpers';

const NOW = () => new Date().toISOString();
const MENTION_PUSH_THROTTLE_MS = 60 * 60 * 1000;

export const attachMentions = async (
    ctx: any,
    args: {
        sourceType: 'post' | 'comment';
        sourceId: string;
        actorUserId: string;
        handles: string[];
        preview?: string;
    },
): Promise<void> => {
    if (args.handles.length === 0) return;

    for (const handle of args.handles) {
        const user = await ctx.db
            .query('users')
            .withIndex('by_username', (q: any) => q.eq('username', handle))
            .first();
        if (!user) continue;
        if (String(user._id) === args.actorUserId) continue;
        if (await isBlockedBetween(ctx, args.actorUserId, String(user._id))) continue;

        const muted = await ctx.db
            .query('socialMutes')
            .withIndex('by_pair', (q: any) => q.eq('muterUserId', String(user._id)).eq('mutedUserId', args.actorUserId))
            .first();
        if (muted) continue;

        await ctx.db.insert('socialMentions', {
            sourceType: args.sourceType,
            sourceId: args.sourceId,
            mentionedUserId: String(user._id),
            actorUserId: args.actorUserId,
            createdAt: NOW(),
        });

        await recordActivity(ctx, {
            userId: String(user._id),
            type: 'mention',
            actorUserId: args.actorUserId,
            targetType: args.sourceType,
            targetId: args.sourceId,
            preview: args.preview,
        });

        const throttled = await wasNotifiedRecently(
            ctx,
            String(user._id),
            'social',
            'te mencionó',
            MENTION_PUSH_THROTTLE_MS,
        );
        if (!throttled) {
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: String(user._id),
                title: 'Te mencionaron',
                body: 'Alguien te mencionó en la red social.',
                category: 'social',
                data: { type: 'mention', targetType: args.sourceType, targetId: args.sourceId },
            });
        }
    }
};
