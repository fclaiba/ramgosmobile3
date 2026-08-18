/**
 * Autoridad única del @handle.
 *
 * Antes había cuatro caminos que escribían `users.username` con reglas
 * distintas: `register` validaba y chequeaba unicidad; `syncUser` generaba
 * `nombre + 3 dígitos al azar` y ante colisión agregaba 2 más UNA vez sin
 * volver a chequear; `updateProfile` validaba pero no aplicaba el cooldown
 * que estampaba; y `updateUser` parcheaba el handle sin validar nada —un
 * bypass completo—. Los seeds directamente creaban usuarios sin handle.
 *
 * Acá vive la única función autorizada a escribir identidad
 * (`writeUserIdentity`) y las piezas que usan los caminos de alta.
 *
 * `searchText` es un corpus denormalizado porque un `searchIndex` de Convex
 * admite UN solo campo: para buscar por @handle Y por nombre hay que
 * concatenarlos. Como deriva de campos del mismo documento, mantenerlo
 * correcto es responsabilidad de este archivo y de nadie más.
 */

import { authError, revokeAllSessions } from '../authHelpers';

export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

/**
 * Marcas diacríticas combinantes. Escrito con escapes y no con los caracteres
 * literales: son invisibles en el editor y cualquier reguardado del archivo
 * en otra codificación los rompe en silencio.
 */
const STRIP_ACCENTS = /[\u0300-\u036f]/g;

/** trim → saca `@` → saca acentos → minúsculas → filtra a [a-z0-9_]. */
export function normalizeHandle(raw?: string | null): string | null {
    if (!raw) return null;
    const cleaned = String(raw)
        .trim()
        .replace(/^@+/, '')
        .normalize('NFD')
        .replace(STRIP_ACCENTS, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
    return cleaned || null;
}

/** Normaliza un término de búsqueda con las mismas reglas que el corpus. */
export function normalizeSearchTerm(raw?: string | null): string {
    if (!raw) return '';
    return String(raw)
        .trim()
        .replace(/^@+/, '')
        .normalize('NFD')
        .replace(STRIP_ACCENTS, '')
        .toLowerCase()
        .replace(/[^a-z0-9_ ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function assertHandleShape(handle: string): void {
    if (!HANDLE_RE.test(handle)) {
        throw authError(
            'FORBIDDEN',
            'El usuario debe tener 3–24 caracteres (letras, números o _).',
        );
    }
}

/**
 * ¿Está tomado? Mira `by_username` y también `by_referral_alias`: los alias
 * de referido comparten espacio de nombres con los handles en los links.
 */
export async function isHandleTaken(
    ctx: any,
    handle: string,
    exceptUserId?: string,
): Promise<boolean> {
    const byHandle = await ctx.db
        .query('users')
        .withIndex('by_username', (q: any) => q.eq('username', handle))
        .first();
    if (byHandle && String(byHandle._id) !== String(exceptUserId ?? '')) return true;

    const byAlias = await ctx.db
        .query('users')
        .withIndex('by_referral_alias', (q: any) => q.eq('referralAlias', handle.toUpperCase()))
        .first();
    if (byAlias && String(byAlias._id) !== String(exceptUserId ?? '')) return true;

    return false;
}

export async function assertHandleAvailable(
    ctx: any,
    handle: string,
    exceptUserId?: string,
): Promise<void> {
    if (await isHandleTaken(ctx, handle, exceptUserId)) {
        throw authError('FORBIDDEN', 'El nombre de usuario ya está en uso.');
    }
}

/**
 * Devuelve un handle libre derivado de `base`. Itera con chequeo indexado en
 * cada vuelta, así que siempre termina en algo realmente libre — a diferencia
 * del intento único con dígitos al azar que tenía `syncUser`.
 */
export async function findFreeHandle(
    ctx: any,
    rawBase: string,
    exceptUserId?: string,
): Promise<string> {
    let base = (normalizeHandle(rawBase) ?? 'user').slice(0, 20);
    if (base.length < 3) base = `${base}user`.slice(0, 20);

    if (!(await isHandleTaken(ctx, base, exceptUserId))) return base;
    for (let i = 2; i <= 50; i += 1) {
        const candidate = `${base}${i}`.slice(0, 24);
        if (!(await isHandleTaken(ctx, candidate, exceptUserId))) return candidate;
    }
    // Último recurso: sufijo temporal. Se sigue verificando.
    for (let i = 0; i < 20; i += 1) {
        const candidate = `${base}_${Date.now().toString(36)}${i}`.slice(0, 24);
        if (!(await isHandleTaken(ctx, candidate, exceptUserId))) return candidate;
    }
    throw authError('FORBIDDEN', 'No pudimos generar un @usuario disponible.');
}

/** `fran_klaisse2` → ['fran_klaisse2', 'fran', 'klaisse', '2'] */
export function handleTokens(handle: string): string[] {
    const parts = handle.split(/[_\d]+/).filter((p) => p.length >= 2);
    const digits = handle.match(/\d+/g) ?? [];
    return [handle, ...parts, ...digits];
}

type IdentitySource = {
    username?: string | null;
    name?: string | null;
    nickname?: string | null;
    kycProfile?: { businessName?: string } | null;
};

/**
 * Corpus de búsqueda. Guarda las formas con y sin acentos para que "jose"
 * encuentre a "José" y "José" también.
 */
export function buildSearchText(u: IdentitySource): string {
    const raw = [
        u.username ?? '',
        u.name ?? '',
        u.nickname ?? '',
        u.kycProfile?.businessName ?? '',
    ]
        .filter(Boolean)
        .join(' ');

    const accented = raw.toLowerCase();
    const stripped = accented.normalize('NFD').replace(STRIP_ACCENTS, '');
    const tokens = new Set<string>();
    for (const chunk of `${accented} ${stripped}`.split(/[^a-z0-9_áéíóúüñ]+/i)) {
        const t = chunk.trim();
        if (t.length >= 2) tokens.add(t);
    }
    if (u.username) for (const t of handleTokens(u.username)) tokens.add(t);

    return Array.from(tokens).join(' ');
}

/** Campos de identidad para un `ctx.db.insert('users', {...})`. */
export function newUserIdentityFields(input: {
    username: string;
    name: string;
    nickname?: string;
    kycProfile?: { businessName?: string } | null;
}) {
    return {
        username: input.username,
        usernameLastChangedAt: Date.now(),
        searchText: buildSearchText(input),
        directoryHidden: false,
    };
}

/**
 * La ÚNICA función autorizada a escribir `users.username` / `name` /
 * `nickname`. Normaliza, valida forma y unicidad, recalcula `searchText`
 * sobre el documento ya fusionado, mantiene `directoryHidden` en línea con
 * `isBanned` y espeja el handle a `socialUsers` si esa fila existe.
 *
 * Nota sobre el cooldown: `usernameLastChangedAt` se estampa pero NO se
 * chequea. Activarlo junto con la migración —que estampa a todo el mundo—
 * dejaría a todos sin poder cambiar su @ durante la ventana entera.
 */
export async function writeUserIdentity(
    ctx: any,
    userId: any,
    patch: {
        username?: string;
        name?: string;
        nickname?: string;
        avatar?: string;
        isBanned?: boolean;
        socialStatus?: 'active' | 'shadowbanned' | 'suspended';
        socialSuspendedUntil?: string;
        kycProfile?: any;
    },
    opts?: { actorIsAdmin?: boolean },
): Promise<{ usernameChanged: boolean; username: string | null }> {
    const user = await ctx.db.get(userId);
    if (!user) throw authError('FORBIDDEN', 'Usuario no encontrado.');

    const updates: Record<string, any> = {};
    let usernameChanged = false;

    if (patch.username !== undefined) {
        const next = normalizeHandle(patch.username);
        if (!next) throw authError('FORBIDDEN', 'Elegí un nombre de usuario (@).');
        if (next !== user.username) {
            assertHandleShape(next);
            await assertHandleAvailable(ctx, next, String(user._id));

            // El alias de referido propio tiene que seguir siendo distinto
            // del handle propio, o el link de referido se vuelve ambiguo.
            const ownAlias = user.referralAlias as string | undefined;
            if (ownAlias && ownAlias.toLowerCase() === next) {
                throw authError(
                    'FORBIDDEN',
                    'Tu alias de referido debe ser distinto de tu @usuario. Cambiá el alias primero.',
                );
            }

            updates.username = next;
            updates.usernameLastChangedAt = Date.now();
            usernameChanged = true;
        }
    }

    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.nickname !== undefined) updates.nickname = patch.nickname;
    if (patch.avatar !== undefined) updates.avatar = patch.avatar;
    if (patch.kycProfile !== undefined) updates.kycProfile = patch.kycProfile;
    if (patch.isBanned !== undefined) {
        updates.isBanned = patch.isBanned;
        updates.directoryHidden = patch.isBanned === true;
    }
    if (patch.socialStatus !== undefined) updates.socialStatus = patch.socialStatus;
    if (patch.socialSuspendedUntil !== undefined) {
        updates.socialSuspendedUntil = patch.socialSuspendedUntil;
    }

    const merged = { ...user, ...updates };
    const nextSearchText = buildSearchText(merged);
    if (nextSearchText !== user.searchText) updates.searchText = nextSearchText;
    if (user.directoryHidden === undefined && updates.directoryHidden === undefined) {
        updates.directoryHidden = merged.isBanned === true;
    }

    if (Object.keys(updates).length) await ctx.db.patch(user._id, updates);

    // Banear sin cortar las sesiones vivas no banea a nadie. Va acá y no en
    // `users.banUser` para que TODO camino que setee `isBanned` —incluido el
    // `updateUser` del admin, que llega por acá— quede cubierto.
    if (updates.isBanned === true && user.isBanned !== true) {
        await revokeAllSessions(ctx, user._id);
    }

    // Espejo hacia el perfil social. `socialUsers.username` dejó de ser una
    // identidad propia (se derivaba del prefijo del email) y pasó a ser una
    // copia de la canónica.
    const social = await ctx.db
        .query('socialUsers')
        .withIndex('by_user', (q: any) => q.eq('userId', String(user._id)))
        .first();
    if (social) {
        const socialPatch: Record<string, any> = {};
        const finalHandle = merged.username;
        if (finalHandle && social.username !== finalHandle) socialPatch.username = finalHandle;
        if (patch.avatar !== undefined && social.avatar !== patch.avatar) {
            socialPatch.avatar = patch.avatar;
        }
        const betterName = merged.nickname || merged.name;
        if (looksLikePlaceholderName(social.displayName) && betterName) {
            socialPatch.displayName = betterName;
        }
        if (Object.keys(socialPatch).length) {
            socialPatch.updatedAt = new Date().toISOString();
            await ctx.db.patch(social._id, socialPatch);
        }
    }

    if (usernameChanged) {
        await ctx.db.insert('audit_logs', {
            action: 'USERNAME_CHANGED',
            actorUserId: String(user._id),
            targetUserId: String(user._id),
            timestamp: new Date().toISOString(),
            metadata: {
                from: user.username ?? null,
                to: updates.username,
                byAdmin: opts?.actorIsAdmin === true,
            },
        });
    }

    return { usernameChanged, username: merged.username ?? null };
}

/**
 * `ensureSocialUser` sembraba `displayName` con el email crudo del usuario
 * (`social.ts:331`) y con el literal 'Usuario' cuando no tenía nada. Ninguno
 * de los dos es un nombre; hay que poder reemplazarlos.
 */
export function looksLikePlaceholderName(name?: string | null): boolean {
    if (!name) return true;
    const n = name.trim();
    if (!n) return true;
    if (n.includes('@')) return true;
    return n.toLowerCase() === 'usuario';
}
