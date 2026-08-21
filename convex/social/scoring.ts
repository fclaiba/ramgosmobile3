/**
 * Ranking dual — Feed (estilo X/Instagram) y Loops (estilo TikTok/Reels).
 *
 * Ver `docs/PLAN_ESTRATEGICO_MAESTRO.md` bitácora E-085/E-086 para el porqué
 * de dos scorers separados: Feed es grafo-social-céntrico (afinidad con
 * personas), Loops es contenido/interés-céntrico (tasas de completion/
 * share/rewatch, casi sin depender de a quién seguís).
 *
 * Deliberadamente SIN imports de Convex (`ctx`, `v`, etc.): son funciones
 * puras para poder testearlas con Jest liso
 * (`convex/__tests__/socialScoring.test.ts`) sin levantar runtime de
 * Convex. `social.ts` es quien las conecta con la base de datos.
 */

export const AFFINITY_CAP = 8.0;
/** Una afinidad de autor no se evapora en un fin de semana. */
export const AUTHOR_AFFINITY_HALFLIFE_HOURS = 336; // 14 días
/** El interés por un tipo de contenido cambia más rápido que una relación. */
export const TAG_AFFINITY_HALFLIFE_HOURS = 96; // 4 días
/** ~1 de cada 5 slots de la página de Loops va a contenido en exploración. */
export const EXPLORATION_SLOT_FRACTION = 0.2;

/**
 * EMA con decaimiento por media vida: `old * 0.5^(horas/mediaVida) + peso`.
 * Cap arriba en `AFFINITY_CAP` para que un solo evento (o súper-fan) no
 * monopolice el ranking para siempre. Sin piso: un peso negativo (skip
 * rápido en Loops) puede llevar la afinidad de un tag por debajo de 0, y eso
 * se propaga como penalización real en `scoreLoop`.
 */
export const decayedAffinity = (
    oldScore: number,
    hoursSinceLastEvent: number,
    halfLifeHours: number,
    weight: number,
): number => Math.min(AFFINITY_CAP, oldScore * Math.pow(0.5, hoursSinceLastEvent / halfLifeHours) + weight);

export interface ScorePostOpts {
    /** `authorUserId` → score de afinidad graduada (`socialAuthorAffinity`). */
    affinityScores: Map<string, number>;
    viewerCountry?: string;
    nowMs: number;
    notInterestedAuthors: Set<string>;
    alreadyViewedIds: Set<string>;
}

/**
 * Ranking v2 de "forYou" — ver Fase 1 del plan de ranking. Suma sobre la v1
 * (recencia + engagement + afinidad + geo comercial + watch-time + ventas):
 *
 *   - **Velocidad de engagement**: normalizada por edad, para que un post
 *     nuevo acelerando le pueda ganar a uno viejo con más engagement
 *     absoluto acumulado (la v1 no tenía dimensión temporal acá).
 *   - **Afinidad graduada**: reemplaza el `+25` plano de "¿le diste like a
 *     este autor alguna vez de sus últimos 50?" por un score EMA persistido
 *     (`socialAuthorAffinity`), que sube con like/comentario/DM/watch-time y
 *     decae solo con el tiempo.
 */
export const scorePost = (post: any, opts: ScorePostOpts): number => {
    const ageHours = Math.max(0, (opts.nowMs - Date.parse(post.createdAt)) / 3_600_000);
    // Media vida de ~18h mantiene el feed fresco sin enterrar la 1ª página.
    let score = 100 / (1 + ageHours / 18);

    const engagement = (post.likeCount ?? 0) * 2 + (post.commentCount ?? 0) * 3;
    score += Math.log1p(engagement) * 6;

    // Velocidad: mismo numerador que el engagement absoluto + retweets
    // (sin usar hasta ahora), dividido por edad. Se SUMA al término
    // absoluto, no se multiplica — multiplicar anularía un post nuevo que
    // todavía no tiene ninguno de los dos altos.
    const velocity =
        ((post.likeCount ?? 0) * 2 + (post.commentCount ?? 0) * 3 + (post.retweetCount ?? 0) * 2.5) /
        Math.max(1, ageHours);
    score += Math.log1p(velocity) * 10;

    const affinity = opts.affinityScores.get(post.authorUserId) ?? 0;
    score += Math.min(affinity, AFFINITY_CAP) * 5;

    if (post.commercialProduct) {
        const sameCountry =
            opts.viewerCountry && post.geoCountry
                ? post.geoCountry === opts.viewerCountry
                : true; // unknown geo → neither boosted nor punished
        score += sameCountry ? 15 : -40;
    }

    // Watch-time: sólo cuenta con muestra real, para no castigar un video
    // recién publicado que todavía no tiene reproducciones.
    if ((post.watchSampleCount ?? 0) > 0) {
        score += ((post.avgCompletionPct ?? 0.5) - 0.5) * 40;
    }

    // Conversión: log1p para que la 1ª venta pese mucho y la 50ª ya no tanto.
    if (post.salesCount) score += Math.log1p(post.salesCount) * 15;

    if (opts.notInterestedAuthors.has(post.authorUserId)) score -= 60;
    if (opts.alreadyViewedIds.has(String(post._id))) score -= 80;

    return score;
};

export interface ScoreLoopOpts {
    /** `tag` → score de afinidad (`socialTagAffinity`), sólo alimentada por Loops. */
    tagAffinity: Map<string, number>;
    /** Tags de ESTE post (`socialPostTags.by_post`). */
    postTags: string[];
    nowMs: number;
    notInterestedAuthors: Set<string>;
    alreadyViewedIds: Set<string>;
}

/**
 * Ranking de Loops — Fase 2 del plan. Por TASAS (no conteos absolutos):
 * TikTok compara contra `viewCount`, no contra el catálogo entero, así un
 * video con pocas vistas pero 50% de completion compite igual que uno viejo
 * con más vistas absolutas. Casi no depende del grafo social a propósito
 * (pedido explícito del usuario) — la personalización es por interés
 * (`tagAffinity`), no por a quién seguís.
 *
 * El caller aplica el multiplicador de tier (`loopsTier`, Fase 3) sobre el
 * resultado — acá sólo el score "crudo".
 */
export const scoreLoop = (post: any, opts: ScoreLoopOpts): number => {
    const ageHours = Math.max(0, (opts.nowMs - Date.parse(post.createdAt)) / 3_600_000);
    // Media vida de 30h — más larga que Feed: la cola de descubrimiento de
    // un video es más larga que la de un post de texto.
    let score = 100 / (1 + ageHours / 30);

    const views = Math.max(1, post.viewCount ?? 0);
    const completionRate = post.avgCompletionPct ?? 0.5;
    const likeRate = (post.likeCount ?? 0) / views;
    const commentRate = (post.commentCount ?? 0) / views;
    const shareRate = (post.shareCount ?? 0) / views;
    const rewatchRate = (post.totalLoopCount ?? 0) / views;
    const quickSkipRate = (post.quickSkipCount ?? 0) / views;

    // Watch-time es LA señal acá, no secundaria como en Feed.
    score += (completionRate - 0.5) * 50;
    // `*1000` dentro de log1p: las tasas son fracciones chicas (~0.001-0.3);
    // sin escalar, log1p es casi lineal y no diferencia nada. Constantes a
    // recalibrar con datos reales post-lanzamiento, no son un valor final.
    score += Math.log1p(likeRate * 1000) * 8;
    score += Math.log1p(commentRate * 1000) * 10;
    // Mayor peso: viralidad real (alcance fuera de la app).
    score += Math.log1p(shareRate * 1000) * 22;
    // 2º mayor: no se puede fakear sin tiempo real de reproducción.
    score += Math.log1p(rewatchRate * 1000) * 18;
    // Negativo fuerte: bounce rate = "esto falló".
    score -= quickSkipRate * 70;

    // "Segmentación de contenido" pedida por el usuario: boost por el tag de
    // mayor afinidad del viewer entre los de este post. Puede ser negativo
    // (afinidad castigada por skips repetidos de esa categoría) — se
    // propaga tal cual, es señal real.
    let interestBoost = -Infinity;
    for (const tag of opts.postTags) {
        const s = opts.tagAffinity.get(tag) ?? 0;
        if (s > interestBoost) interestBoost = s;
    }
    if (interestBoost === -Infinity) interestBoost = 0; // post sin tags
    score += Math.min(interestBoost, AFFINITY_CAP) * 5;

    if (opts.notInterestedAuthors.has(post.authorUserId)) score -= 60;
    if (opts.alreadyViewedIds.has(String(post._id))) score -= 80;

    return score;
};

/**
 * Cap de diversidad genérico por clave: máximo `perKey` items por clave en
 * una página. Generalización de lo que era `applyAuthorDiversityCap`
 * (autor-only) para que Loops lo reuse con clave=hashtag (Fase 1.6).
 */
export const applyDiversityCap = <T>(
    ranked: T[],
    cap: number,
    keyOf: (item: T) => string,
    perKey = 2,
): T[] => {
    const counts = new Map<string, number>();
    const kept: T[] = [];
    for (const item of ranked) {
        const key = keyOf(item);
        const n = counts.get(key) ?? 0;
        if (n >= perKey) continue;
        counts.set(key, n + 1);
        kept.push(item);
        if (kept.length >= cap) break;
    }
    return kept;
};

/** Compat: la firma que usaba `getFeed` antes de la generalización. */
export const applyAuthorDiversityCap = (ranked: any[], cap: number, perAuthor = 2): any[] =>
    applyDiversityCap(ranked, cap, (p: any) => p.authorUserId, perAuthor);
