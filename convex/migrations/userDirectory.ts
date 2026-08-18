/**
 * Backfill del directorio de personas.
 *
 * Reconcilia los DOS handles que hasta ahora convivían sin sincronizarse:
 * `users.username` (el que la persona eligió al registrarse, validado) y
 * `socialUsers.username` (que `ensureSocialUser` inventaba a partir del
 * prefijo del email). Gana el primero. Además calcula `searchText`, que es lo
 * que hace a cada usuario encontrable.
 *
 * Va por lotes con marca de agua sobre `_creationTime` — resumible tras un
 * corte y sin `.collect()` de la tabla entera. Idempotente: correrlo de nuevo
 * devuelve todos los contadores en cero.
 *
 *   npx convex run migrations/userDirectory:backfillDirectory '{"dryRun":true}'
 *   npx convex run migrations/userDirectory:backfillDirectory '{"chain":true}'
 *   npx convex run migrations/userDirectory:backfillDirectoryStatus
 */

import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import {
    HANDLE_RE,
    buildSearchText,
    findFreeHandle,
    isHandleTaken,
    looksLikePlaceholderName,
    normalizeHandle,
} from '../users/identity';

const MIGRATION_NAME = 'userDirectory.v1';

export const backfillDirectory = internalMutation({
    args: {
        cursor: v.optional(v.number()),
        batchSize: v.optional(v.number()),
        dryRun: v.optional(v.boolean()),
        chain: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        const batchSize = Math.max(1, Math.min(args.batchSize ?? 100, 200));
        const dryRun = args.dryRun === true;

        // Orden ascendente por antigüedad. Eso convierte "el más viejo se
        // queda con el handle pelado" en un invariante del recorrido y no en
        // una casualidad: cuando llegamos a un duplicado, el original ya fue
        // procesado y confirmado.
        const batch = await ctx.db
            .query('users')
            .withIndex('by_creation_time', (q: any) => q.gt('_creationTime', args.cursor ?? 0))
            .take(batchSize);

        let handlesAssigned = 0;
        let handlesRenamed = 0;
        let searchTextWritten = 0;
        let socialMirrored = 0;
        const renames: any[] = [];

        for (const user of batch) {
            const social = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', String(user._id)))
                .first();

            const a = normalizeHandle(user.username);
            const b = normalizeHandle(social?.username);

            let desired: string;
            let reason: string | null = null;

            if (a && HANDLE_RE.test(a)) {
                desired = a;
            } else if (b && HANDLE_RE.test(b) && !(await isHandleTaken(ctx, b, String(user._id)))) {
                // Sin handle canónico: se promueve el social en vez de
                // inventar uno nuevo, así el @ que la persona ya venía
                // mostrando no cambia sin necesidad.
                desired = b;
                reason = 'promoted-social';
            } else {
                const base =
                    normalizeHandle(user.email?.split('@')[0]) ??
                    normalizeHandle(user.nickname) ??
                    normalizeHandle(user.name) ??
                    'user';
                desired = await findFreeHandle(ctx, base, String(user._id));
                reason = 'assigned';
            }

            // Colisión: el agujero de `syncUser` (dígitos al azar sin
            // re-chequear) pudo dejar dos usuarios con el mismo handle.
            if (await isHandleTaken(ctx, desired, String(user._id))) {
                desired = await findFreeHandle(ctx, desired, String(user._id));
                reason = 'collision';
            }

            const patch: Record<string, any> = {};
            if (user.username !== desired) {
                patch.username = desired;
                if (user.username) {
                    handlesRenamed += 1;
                    renames.push({
                        userId: String(user._id),
                        from: user.username ?? null,
                        to: desired,
                        reason: reason ?? 'normalized',
                    });
                } else {
                    handlesAssigned += 1;
                }
            }

            const merged = { ...user, ...patch };
            const nextSearchText = buildSearchText(merged);
            if (user.searchText !== nextSearchText) {
                patch.searchText = nextSearchText;
                searchTextWritten += 1;
            }

            const hidden = user.isBanned === true;
            if (user.directoryHidden !== hidden) patch.directoryHidden = hidden;

            if (!dryRun && Object.keys(patch).length) await ctx.db.patch(user._id, patch);

            // Espejo del perfil social. No se CREAN filas de `socialUsers`:
            // el buscador no las necesita y crearlas para todo el mundo
            // reintroduce el invariante que se había roto.
            if (social) {
                const socialPatch: Record<string, any> = {};
                if (social.username !== desired) socialPatch.username = desired;
                const betterName = user.nickname || user.name;
                if (looksLikePlaceholderName(social.displayName) && betterName) {
                    socialPatch.displayName = betterName;
                }
                if (Object.keys(socialPatch).length) {
                    socialMirrored += 1;
                    if (!dryRun) {
                        await ctx.db.patch(social._id, {
                            ...socialPatch,
                            updatedAt: new Date().toISOString(),
                        });
                    }
                }
            }
        }

        const isDone = batch.length < batchSize;
        const cursor = batch.length ? batch[batch.length - 1]._creationTime : (args.cursor ?? null);

        if (!dryRun) {
            const now = new Date().toISOString();
            const state = await ctx.db
                .query('migrationState')
                .withIndex('by_name', (q: any) => q.eq('name', MIGRATION_NAME))
                .first();
            const stats = { handlesAssigned, handlesRenamed, searchTextWritten, socialMirrored };
            if (state) {
                await ctx.db.patch(state._id, {
                    cursor,
                    processed: state.processed + batch.length,
                    isDone,
                    updatedAt: now,
                    stats,
                });
            } else {
                await ctx.db.insert('migrationState', {
                    name: MIGRATION_NAME,
                    cursor,
                    processed: batch.length,
                    isDone,
                    startedAt: now,
                    updatedAt: now,
                    stats,
                });
            }

            if (!isDone && args.chain) {
                await ctx.scheduler.runAfter(0, internal.migrations.userDirectory.backfillDirectory, {
                    cursor: cursor ?? undefined,
                    batchSize,
                    chain: true,
                });
            }
        }

        return {
            dryRun,
            scanned: batch.length,
            handlesAssigned,
            handlesRenamed,
            searchTextWritten,
            socialMirrored,
            renames,
            cursor,
            isDone,
        };
    },
});

/** ¿Corrió? ¿Quedó algo sin arreglar? Todo en cero = terminado y sano. */
export const backfillDirectoryStatus = internalQuery({
    args: { scanLimit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const state = await ctx.db
            .query('migrationState')
            .withIndex('by_name', (q: any) => q.eq('name', MIGRATION_NAME))
            .first();

        const users = await ctx.db.query('users').take(Math.min(args.scanLimit ?? 2000, 4000));
        const handles = new Map<string, number>();
        let usersMissingHandle = 0;
        let usersMissingSearchText = 0;
        let socialUsernameMismatch = 0;
        let socialDisplayNameIsEmail = 0;

        for (const u of users) {
            if (!u.username) usersMissingHandle += 1;
            else handles.set(u.username, (handles.get(u.username) ?? 0) + 1);
            if (!u.searchText) usersMissingSearchText += 1;

            const social = await ctx.db
                .query('socialUsers')
                .withIndex('by_user', (q: any) => q.eq('userId', String(u._id)))
                .first();
            if (social) {
                if (u.username && social.username !== u.username) socialUsernameMismatch += 1;
                if (looksLikePlaceholderName(social.displayName)) socialDisplayNameIsEmail += 1;
            }
        }

        const duplicateHandles = Array.from(handles.values()).filter((n) => n > 1).length;

        return {
            ran: !!state,
            isDone: state?.isDone ?? false,
            processed: state?.processed ?? 0,
            updatedAt: state?.updatedAt ?? null,
            scannedUsers: users.length,
            usersMissingHandle,
            usersMissingSearchText,
            duplicateHandles,
            socialUsernameMismatch,
            socialDisplayNameIsEmail,
        };
    },
});

/**
 * Los usuarios que el buscador NO puede encontrar. Antes del backfill lista
 * exactamente a los invisibles; después tiene que devolver `[]`.
 */
export const findUnsearchableUsers = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = Math.min(args.limit ?? 20, 100);
        const users = await ctx.db.query('users').take(2000);
        return users
            .filter((u: any) => !u.username || !u.searchText)
            .slice(0, limit)
            .map((u: any) => ({
                userId: String(u._id),
                email: u.email,
                name: u.name,
                username: u.username ?? null,
                hasSearchText: !!u.searchText,
            }));
    },
});
