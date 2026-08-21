/**
 * Tests unitarios de los scorers puros (Fase 4.3 del plan de ranking).
 * `convex/social/scoring.ts` no importa nada de Convex a propósito, así que
 * esto corre con Jest liso — sin `convex-test`, sin runtime.
 */
import {
    scorePost,
    scoreLoop,
    applyDiversityCap,
    applyAuthorDiversityCap,
    decayedAffinity,
    AFFINITY_CAP,
} from '../social/scoring';

const NOW_MS = Date.parse('2026-08-20T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW_MS - h * 3_600_000).toISOString();

const basePost = (overrides: Record<string, any> = {}) => ({
    _id: overrides._id ?? 'post1',
    authorUserId: overrides.authorUserId ?? 'author1',
    createdAt: overrides.createdAt ?? hoursAgo(1),
    likeCount: 0,
    commentCount: 0,
    retweetCount: 0,
    viewCount: 0,
    ...overrides,
});

const noSignals = {
    affinityScores: new Map<string, number>(),
    nowMs: NOW_MS,
    notInterestedAuthors: new Set<string>(),
    alreadyViewedIds: new Set<string>(),
};

describe('scorePost', () => {
    it('decae con la edad (recency half-life)', () => {
        const fresh = scorePost(basePost({ createdAt: hoursAgo(0) }), noSignals);
        const old = scorePost(basePost({ createdAt: hoursAgo(36) }), noSignals);
        expect(fresh).toBeGreaterThan(old);
    });

    it('la velocidad deja ganar a un post nuevo acelerando contra uno viejo con más engagement absoluto', () => {
        // Viejo: mucho engagement acumulado en 72h.
        const oldHot = basePost({ createdAt: hoursAgo(72), likeCount: 200, commentCount: 20 });
        // Nuevo: menos engagement absoluto, pero mucho más reciente → mayor velocidad.
        const newHot = basePost({ createdAt: hoursAgo(1), likeCount: 40, commentCount: 10 });
        const oldScore = scorePost(oldHot, noSignals);
        const newScore = scorePost(newHot, noSignals);
        expect(newScore).toBeGreaterThan(oldScore);
    });

    it('ordena por afinidad graduada, no booleana', () => {
        const post = basePost({ authorUserId: 'fav' });
        const lowAffinity = scorePost(post, { ...noSignals, affinityScores: new Map([['fav', 1]]) });
        const highAffinity = scorePost(post, { ...noSignals, affinityScores: new Map([['fav', 8]]) });
        expect(highAffinity).toBeGreaterThan(lowAffinity);
    });

    it('cappea la afinidad en AFFINITY_CAP: 8 y 20 puntan igual', () => {
        const post = basePost({ authorUserId: 'fav' });
        const at8 = scorePost(post, { ...noSignals, affinityScores: new Map([['fav', 8]]) });
        const at20 = scorePost(post, { ...noSignals, affinityScores: new Map([['fav', 20]]) });
        expect(at20).toBe(at8);
    });

    it('penaliza autores "no me interesa" y posts ya vistos', () => {
        const post = basePost();
        const plain = scorePost(post, noSignals);
        const notInterested = scorePost(post, {
            ...noSignals,
            notInterestedAuthors: new Set(['author1']),
        });
        const alreadyViewed = scorePost(post, {
            ...noSignals,
            alreadyViewedIds: new Set(['post1']),
        });
        expect(notInterested).toBeLessThan(plain);
        expect(alreadyViewed).toBeLessThan(plain);
    });
});

const noLoopSignals = {
    tagAffinity: new Map<string, number>(),
    postTags: [] as string[],
    nowMs: NOW_MS,
    notInterestedAuthors: new Set<string>(),
    alreadyViewedIds: new Set<string>(),
};

describe('scoreLoop', () => {
    it('premia completion alto sobre completion bajo, a igualdad de todo lo demás', () => {
        const lowCompletion = basePost({ viewCount: 100, avgCompletionPct: 0.2 });
        const highCompletion = basePost({ viewCount: 100, avgCompletionPct: 0.9 });
        expect(scoreLoop(highCompletion, noLoopSignals)).toBeGreaterThan(
            scoreLoop(lowCompletion, noLoopSignals),
        );
    });

    it('el castigo de skip rápido es negativo y proporcional a la tasa', () => {
        const noSkip = basePost({ viewCount: 100, quickSkipCount: 0 });
        const heavySkip = basePost({ viewCount: 100, quickSkipCount: 80 });
        expect(scoreLoop(heavySkip, noLoopSignals)).toBeLessThan(scoreLoop(noSkip, noLoopSignals));
    });

    it('shareRate pesa más que likeRate a igual tasa (viralidad > aprobación)', () => {
        const liked = basePost({ viewCount: 100, likeCount: 10 });
        const shared = basePost({ viewCount: 100, shareCount: 10 });
        const likedScore = scoreLoop(liked, noLoopSignals) - scoreLoop(basePost({ viewCount: 100 }), noLoopSignals);
        const sharedScore = scoreLoop(shared, noLoopSignals) - scoreLoop(basePost({ viewCount: 100 }), noLoopSignals);
        expect(sharedScore).toBeGreaterThan(likedScore);
    });

    it('la afinidad por tag puede ser negativa y penaliza (skip repetido de esa categoría)', () => {
        const post = basePost({ viewCount: 100 });
        const withHatedTag = scoreLoop(post, {
            ...noLoopSignals,
            postTags: ['asado'],
            tagAffinity: new Map([['asado', -3]]),
        });
        const noTag = scoreLoop(post, noLoopSignals);
        expect(withHatedTag).toBeLessThan(noTag);
    });
});

describe('applyDiversityCap', () => {
    it('respeta el máximo por clave', () => {
        const items = [
            { id: 1, key: 'a' },
            { id: 2, key: 'a' },
            { id: 3, key: 'a' },
            { id: 4, key: 'b' },
        ];
        const kept = applyDiversityCap(items, 10, (i) => i.key, 2);
        expect(kept.filter((i) => i.key === 'a')).toHaveLength(2);
        expect(kept.filter((i) => i.key === 'b')).toHaveLength(1);
    });

    it('respeta el cap total de la página', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({ id: i, key: String(i) }));
        expect(applyDiversityCap(items, 5, (i) => i.key)).toHaveLength(5);
    });

    it('applyAuthorDiversityCap sigue funcionando como wrapper por autor', () => {
        const posts = [
            { authorUserId: 'x' },
            { authorUserId: 'x' },
            { authorUserId: 'x' },
        ];
        expect(applyAuthorDiversityCap(posts, 10, 2)).toHaveLength(2);
    });
});

describe('decayedAffinity', () => {
    it('sin tiempo transcurrido, es aditivo', () => {
        expect(decayedAffinity(1, 0, 336, 1)).toBeCloseTo(2);
    });

    it('a una media vida completa, el score viejo se reduce a la mitad', () => {
        expect(decayedAffinity(4, 336, 336, 0)).toBeCloseTo(2);
    });

    it('nunca supera AFFINITY_CAP', () => {
        expect(decayedAffinity(AFFINITY_CAP, 0, 336, 5)).toBe(AFFINITY_CAP);
    });
});
