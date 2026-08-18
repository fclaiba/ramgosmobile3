/**
 * Resolución de referencias a Convex File Storage.
 *
 * Los uploads se guardan como `convex-storage:<id>` en vez de una URL firmada
 * porque las firmas caducan: guardar la URL rompería la imagen al tiempo.
 * La URL se resuelve en cada lectura.
 *
 * Vivía duplicado en `social.ts` y `social/dm.ts`; una sola copia evita que
 * las dos se separen.
 */
export const resolveMediaUrl = async (
    ctx: any,
    raw?: string | null,
): Promise<string | undefined> => {
    if (!raw) return raw ?? undefined;
    if (!raw.startsWith('convex-storage:')) return raw;
    try {
        const url = await ctx.storage.getUrl(raw.replace('convex-storage:', ''));
        return url ?? raw;
    } catch {
        return raw;
    }
};

/**
 * Resolver memoizado por request. `decoratePosts` llama `resolveMediaUrl`
 * por avatar, por cada imagen de cada post, por `videoUrl` y por
 * `commercialProduct.image` — un carrusel de 5 imágenes × 20 posts son
 * 100+ resoluciones de storage por página, y los avatares se repiten mucho
 * más de lo que parece (un autor prolífico aparece en media página).
 *
 * `createMediaResolver` devuelve una función con un `Map` interno: la misma
 * referencia `convex-storage:<id>` resuelve una sola vez por llamada a
 * `decoratePosts`, sin cambiar la firma de `resolveMediaUrl` en ningún otro
 * lugar del código (dm.ts, userCard.ts siguen llamando la versión simple).
 */
export const createMediaResolver = (ctx: any) => {
    const cache = new Map<string, Promise<string | undefined>>();
    return (raw?: string | null): Promise<string | undefined> => {
        if (!raw) return Promise.resolve(raw ?? undefined);
        if (!raw.startsWith('convex-storage:')) return Promise.resolve(raw);
        let pending = cache.get(raw);
        if (!pending) {
            pending = resolveMediaUrl(ctx, raw);
            cache.set(raw, pending);
        }
        return pending;
    };
};
