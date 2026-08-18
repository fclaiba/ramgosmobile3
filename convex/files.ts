import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireActor, authError } from "./authHelpers";

export const generateUploadUrl = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        actorId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireActor(ctx, (args as any).sessionToken);
        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Reclama la propiedad de un archivo recién subido.
 *
 * Convex sólo devuelve el `storageId` DESPUÉS del POST, así que la propiedad
 * no se puede registrar en `generateUploadUrl`. El cliente llama a esto justo
 * después de subir. Sin este registro, `attachments[].url` es un string libre:
 * cualquiera podía adjuntar el `convex-storage:<id>` de un archivo ajeno y el
 * servidor le firmaba una URL de descarga.
 *
 * Idempotente: reclamar dos veces el mismo id no duplica la fila, y reclamar
 * uno ajeno tira FORBIDDEN en vez de robarlo.
 */
export const registerUpload = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        storageId: v.string(),
        purpose: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const storageId = args.storageId.replace('convex-storage:', '').trim();
        if (!storageId) throw authError('FORBIDDEN', 'Archivo inválido.');

        const existing = await ctx.db
            .query('mediaAssets')
            .withIndex('by_storage', (q) => q.eq('storageId', storageId))
            .first();

        if (existing) {
            if (existing.ownerUserId !== actor.idString) {
                throw authError('FORBIDDEN', 'Ese archivo no es tuyo.');
            }
            return { storageId };
        }

        await ctx.db.insert('mediaAssets', {
            storageId,
            ownerUserId: actor.idString,
            purpose: args.purpose,
            createdAt: new Date().toISOString(),
        });
        return { storageId };
    },
});
