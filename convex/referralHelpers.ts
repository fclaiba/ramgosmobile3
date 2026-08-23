/** Dual referral: @username (identity) + optional referralAlias (vanity). */

export const REFERRAL_ALIAS_MIN = 3;
export const REFERRAL_ALIAS_MAX = 15;
export const REFERRAL_ALIAS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export const REFERRAL_ALIAS_BLACKLIST = new Set([
    "ADMIN",
    "RAMGOS",
    "SUPPORT",
    "HELP",
    "OFICIAL",
    "OFFICIAL",
]);

/** Normalize vanity alias: uppercase A-Z / 0-9 / hyphen, max length. */
export function normalizeReferralAlias(raw: string): string {
    return raw
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, REFERRAL_ALIAS_MAX);
}

/** Strip @ and trim; keep original casing for further normalize steps. */
export function normalizeReferralInput(raw: string): string {
    return raw.trim().replace(/^@+/, "");
}

export type AliasValidationError =
    | "too_short"
    | "too_long"
    | "invalid_format"
    | "blacklisted"
    | "same_as_own_username"
    | "cooldown";

/**
 * Pure format/blacklist checks (DB uniqueness checked by caller).
 * Empty string is allowed (clear alias).
 */
export function validateReferralAliasFormat(
    alias: string,
    ownUsername?: string | null,
): AliasValidationError | null {
    if (!alias) return null;
    if (alias.length < REFERRAL_ALIAS_MIN) return "too_short";
    if (alias.length > REFERRAL_ALIAS_MAX) return "too_long";
    if (!/^[A-Z0-9-]+$/.test(alias)) return "invalid_format";
    if (REFERRAL_ALIAS_BLACKLIST.has(alias)) return "blacklisted";
    if (ownUsername && alias.toLowerCase() === ownUsername.toLowerCase()) {
        return "same_as_own_username";
    }
    return null;
}

export function aliasValidationMessage(err: AliasValidationError): string {
    switch (err) {
        case "too_short":
            return `El alias debe tener al menos ${REFERRAL_ALIAS_MIN} caracteres.`;
        case "too_long":
            return `El alias puede tener hasta ${REFERRAL_ALIAS_MAX} caracteres.`;
        case "invalid_format":
            return "El alias solo puede usar letras, números y guiones.";
        case "blacklisted":
            return "Ese alias no está permitido.";
        case "same_as_own_username":
            return "El alias debe ser distinto de tu @usuario (el handle ya sirve como código).";
        case "cooldown":
            return "Solo podés cambiar el alias una vez cada 30 días.";
        default:
            return "Alias inválido.";
    }
}

export function isAliasCooldownActive(
    lastChangedAt: number | undefined | null,
    nowMs: number = Date.now(),
): boolean {
    if (lastChangedAt == null) return false;
    return nowMs - lastChangedAt < REFERRAL_ALIAS_COOLDOWN_MS;
}

/** Preferred share code: alias if set, otherwise username handle. */
export function preferredShareCode(
    username?: string | null,
    referralAlias?: string | null,
): string {
    const alias = referralAlias?.trim();
    if (alias) return alias.toUpperCase();
    return (username || "").trim().toLowerCase();
}

/**
 * Resuelve un código de referido a su usuario, probando las tres formas que
 * conviven: handle (`@usuario`), alias vanity, y el `referralCode` legacy.
 *
 * Vive acá porque hay tres consumidores que TIENEN que coincidir: el registro
 * (`users.redeemReferralCode`), el botón compartir (`preferredShareCode`, que
 * emite alias o handle) y el motor de comisiones del checkout
 * (`campaigns.internalResolveCartAttribution`). Ese último miraba sólo el
 * índice legacy `by_referral_code`, así que un enlace compartido con el handle
 * o el alias —que es lo que emite `preferredShareCode`— no atribuía nada.
 */
export async function findUserByReferralInput(ctx: any, rawInput?: string | null) {
    if (!rawInput?.trim()) return null;
    const normalized = normalizeReferralInput(rawInput);
    if (!normalized) return null;

    const byUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) => q.eq("username", normalized.toLowerCase()))
        .first();
    if (byUsername) return byUsername;

    const aliasUpper = normalized.toUpperCase();
    const byAlias = await ctx.db
        .query("users")
        .withIndex("by_referral_alias", (q: any) => q.eq("referralAlias", aliasUpper))
        .first();
    if (byAlias) return byAlias;

    // Códigos de invitación legacy que todavía viven en `referralCode`.
    return await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q: any) => q.eq("referralCode", aliasUpper))
        .first();
}
