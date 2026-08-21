/**
 * Discovery unificado — un solo buscador para personas y productos.
 *
 * Antes había DOS buscadores separados sin ranking en común: `UserSearch`
 * contra `userDirectory.search` y `CommerceLinker` contra
 * `listings.searchListings`, cada uno con su propio input y su propia
 * lista. Este archivo no reemplaza a ninguno de los dos (siguen
 * funcionando igual para quien ya los usa) — agrega `discovery.search`,
 * que corre ambas búsquedas EN PARALELO sobre sus propios índices y
 * devuelve un resultado mezclado.
 *
 * Nota de alcance: esto NO es discovery "vectorial"/semántico. Es
 * full-text sobre índices de Convex (`search_directory` para personas,
 * `search_title`, nuevo, para productos) — encuentra por palabra, no por
 * significado ("zapatillas para correr" no va a encontrar "tenis de
 * running" si no comparten un token). Embeddings de verdad necesitan un
 * proveedor externo (OpenAI, Cohere, etc.) que todavía no está elegido en
 * este stack — swap para más adelante si se decide invertir en eso; el
 * search index sobre `listings.title` es la base sobre la que se armaría
 * de todas formas (mismo campo, se reemplazaría el `withSearchIndex` por
 * un `vectorSearch` una vez haya embeddings que indexar).
 */
import { v } from 'convex/values';
import { query } from './_generated/server';
import { searchDirectoryImpl } from './userDirectory';
import { resolveListingUrls } from './listings';

export const search = query({
    args: {
        sessionToken: v.optional(v.string()),
        term: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const term = args.term.trim();
        const limit = Math.max(1, Math.min(args.limit ?? 10, 25));
        if (term.length < 2) return { people: [], products: [] };

        const [people, productRows] = await Promise.all([
            // Personas: degrada a `[]` sin sesión (mismo comportamiento que
            // `userDirectory.search`), no tira.
            searchDirectoryImpl(ctx, args.sessionToken, term, limit, { excludeSelf: true }),
            ctx.db
                .query('listings')
                .withSearchIndex('search_title', (q: any) =>
                    q.search('title', term).eq('status', 'active'),
                )
                .take(limit),
        ]);

        const products = (
            await Promise.all(productRows.map((l: any) => resolveListingUrls(ctx, l)))
        ).filter(Boolean);

        return { people, products };
    },
});
