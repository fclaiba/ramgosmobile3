/**
 * Link preview cards — Fase 5 del gap analysis de
 * `docs/ARQUITECTURA_SOCIAL_COMMERCE.md` §10 (0% implementado hasta acá).
 *
 * Una fila de caché por URL (no por post): si diez posts distintos linkean
 * la misma página, se pega al sitio externo una sola vez. `createPost`
 * (`convex/social.ts`) programa `internalFetchLinkPreview` en background
 * cuando el texto trae un link — el post se guarda y se muestra igual si
 * la búsqueda de metadata falla o todavía no terminó; la card aparece sola
 * cuando el query del cliente encuentra la fila.
 */
import { v } from 'convex/values';
import { query, internalQuery, internalMutation, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';

const FETCH_TIMEOUT_MS = 4000;
// El <head> con los <meta og:*> siempre está al principio del documento —
// no hace falta bajar la página entera para encontrarlo.
const MAX_BYTES = 200_000;

function extractMeta(html: string, prop: string): string | undefined {
    // Los sitios no son consistentes con el orden de los atributos ni con
    // las comillas — cubrimos property→content y content→property, comilla
    // simple o doble.
    const patterns = [
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
    }
    return undefined;
}

/** Lectura pública, sólo caché — el cliente nunca dispara el fetch externo. */
export const getLinkPreview = query({
    args: { url: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('socialLinkPreviews')
            .withIndex('by_url', (q) => q.eq('url', args.url))
            .first();
    },
});

export const internalGetCached = internalQuery({
    args: { url: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('socialLinkPreviews')
            .withIndex('by_url', (q) => q.eq('url', args.url))
            .first();
    },
});

export const internalUpsertLinkPreview = internalMutation({
    args: {
        url: v.string(),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        siteName: v.optional(v.string()),
        status: v.union(v.literal('ok'), v.literal('failed')),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('socialLinkPreviews')
            .withIndex('by_url', (q) => q.eq('url', args.url))
            .first();
        const row = { ...args, fetchedAt: new Date().toISOString() };
        if (existing) await ctx.db.patch(existing._id, row);
        else await ctx.db.insert('socialLinkPreviews', row);
    },
});

export const internalFetchLinkPreview = internalAction({
    args: { url: v.string() },
    handler: async (ctx, args): Promise<void> => {
        // Ya cacheado (otro post con el mismo link, o el mismo post
        // reenviando el scheduler) — no volver a pegarle a un servidor
        // externo de arriba.
        const existing = await ctx.runQuery(internal.social.linkPreview.internalGetCached, {
            url: args.url,
        });
        if (existing) return;

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            let html = '';
            try {
                const res = await fetch(args.url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (compatible; RamgosLinkPreview/1.0; +https://ramgos.app)',
                    },
                });
                if (!res.ok || !res.body) throw new Error(`status ${res.status}`);

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let received = 0;
                while (received < MAX_BYTES) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    received += value.length;
                    html += decoder.decode(value, { stream: true });
                }
                reader.cancel().catch(() => {});
            } finally {
                clearTimeout(timer);
            }

            const title =
                extractMeta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
            const description = extractMeta(html, 'og:description');
            const imageUrl = extractMeta(html, 'og:image');
            const siteName = extractMeta(html, 'og:site_name');

            if (!title && !description && !imageUrl) throw new Error('sin metadata OG');

            await ctx.runMutation(internal.social.linkPreview.internalUpsertLinkPreview, {
                url: args.url,
                title: title?.trim().slice(0, 200),
                description: description?.trim().slice(0, 300),
                imageUrl,
                siteName: siteName?.trim().slice(0, 100),
                status: 'ok',
            });
        } catch {
            await ctx.runMutation(internal.social.linkPreview.internalUpsertLinkPreview, {
                url: args.url,
                status: 'failed',
            });
        }
    },
});
