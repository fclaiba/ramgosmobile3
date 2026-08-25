/**
 * Backfills de comunidades. Se corren A MANO una vez, no por cron.
 *
 * Ninguno es obligatorio para que la feature funcione: el schema es
 * widen-only y todo lo nuevo es opcional o se deriva en runtime
 * (`resolveJoinPolicy`). Estos dos arreglan datos que ya estaban torcidos
 * antes de la feature.
 *
 *   npx convex run social/communityMigrations:recountCommunityMembers
 *   npx convex run social/communityMigrations:backfillCommunitySlugs
 */

import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

const NOW = () => new Date().toISOString();

/**
 * Recalcula `memberCount` contra las filas reales de `communityMembers`.
 *
 * El contador se parcheaba a mano en cinco lugares distintos y `rejectMember`
 * borraba la fila en vez de marcarla, así que cualquier interrupción a mitad
 * de camino lo dejaba desalineado. Ahora todo pasa por `adjustMemberCount`,
 * pero las comunidades que ya derivaron siguen mal hasta correr esto.
 *
 * Idempotente: recalcula desde cero, no incrementa. Correrlo dos veces da lo
 * mismo que correrlo una.
 */
export const recountCommunityMembers = internalMutation({
    args: { dryRun: v.optional(v.boolean()) },
    handler: async (ctx, args) => {
        const communities = await ctx.db.query('commercialCommunities').collect();
        const fixed: Array<{ id: string; name: string; from: number; to: number }> = [];

        for (const community of communities) {
            if (community.deletedAt) continue;
            const members = await ctx.db
                .query('communityMembers')
                .withIndex('by_community_status', (q: any) =>
                    q.eq('communityId', String(community._id)).eq('status', 'active'),
                )
                .collect();

            const actual = members.length;
            if (actual === community.memberCount) continue;

            fixed.push({
                id: String(community._id),
                name: community.name,
                from: community.memberCount,
                to: actual,
            });
            if (!args.dryRun) {
                await ctx.db.patch(community._id, { memberCount: actual, updatedAt: NOW() });
            }
        }

        return { scanned: communities.length, fixed: fixed.length, details: fixed };
    },
});

const slugify = (input: string): string =>
    input
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

const RESERVED_SLUGS = new Set([
    'welcome', 'home', 'signup', 'login', 'item', 'ref', 'bono', 'p', 'c', 'comunidades',
]);

/**
 * Da slug a las comunidades que no lo tienen, derivándolo del nombre.
 *
 * Sin slug la comunidad sigue siendo alcanzable por `/c/{id}`; esto sólo
 * habilita la URL linda. Idempotente: saltea las que ya tienen uno.
 */
export const backfillCommunitySlugs = internalMutation({
    args: { dryRun: v.optional(v.boolean()) },
    handler: async (ctx, args) => {
        const communities = await ctx.db.query('commercialCommunities').collect();
        const assigned: Array<{ id: string; slug: string }> = [];

        // Se arma en memoria para no pagar una query por candidato dentro del
        // loop; el volumen de comunidades es chico y esto corre una sola vez.
        const taken = new Set<string>(
            communities.map((c: any) => c.slug).filter(Boolean) as string[],
        );

        for (const community of communities) {
            if (community.slug || community.deletedAt) continue;
            const base = slugify(community.name);
            if (!base) continue;

            let slug: string | undefined;
            for (let attempt = 0; attempt < 50; attempt++) {
                const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
                if (RESERVED_SLUGS.has(candidate) || taken.has(candidate)) continue;
                slug = candidate;
                break;
            }
            if (!slug) continue;

            taken.add(slug);
            assigned.push({ id: String(community._id), slug });
            if (!args.dryRun) {
                await ctx.db.patch(community._id, { slug, updatedAt: NOW() });
            }
        }

        return { scanned: communities.length, assigned: assigned.length, details: assigned };
    },
});
