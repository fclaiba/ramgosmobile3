/**
 * Identity resolution shared by referrals, whitelist and campaign invites.
 *
 * Canonical handle: `users.username` (lowercased, no @).
 * Optional vanity: `users.referralAlias` / legacy `users.referralCode`.
 * Legacy social: `socialUsers.username` → users row.
 *
 * Never resolve by email in product flows — UI cites @username.
 */
import {
    normalizeReferralAlias,
    normalizeReferralInput,
} from "./referralHelpers";

/** Product criterion for whitelist / campaign invite: any influencer role. */
export function isInfluencer(user: any): boolean {
    return !!user && user.role === "influencer";
}

export async function findUserByHandleOrCode(ctx: any, rawInput: string) {
    const normalized = normalizeReferralInput(rawInput);
    if (!normalized) return null;

    const handleLower = normalized.toLowerCase();

    const byUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) => q.eq("username", handleLower))
        .first();
    if (byUsername) return byUsername;

    const aliasUpper = normalizeReferralAlias(normalized);
    if (aliasUpper) {
        const byAlias = await ctx.db
            .query("users")
            .withIndex("by_referral_alias", (q: any) =>
                q.eq("referralAlias", aliasUpper),
            )
            .first();
        if (byAlias) return byAlias;
    }

    // Legacy codes may still contain underscores (e.g. INFLUENCER_TEST).
    const codeUpper = normalized.toUpperCase();
    const byCode = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q: any) =>
            q.eq("referralCode", codeUpper),
        )
        .first();
    if (byCode) return byCode;

    const social = await ctx.db
        .query("socialUsers")
        .withIndex("by_username", (q: any) => q.eq("username", handleLower))
        .first();
    if (social) {
        const userNorm = ctx.db.normalizeId("users", social.userId);
        if (userNorm) {
            const user = await ctx.db.get(userNorm);
            if (user) return user;
        }
    }

    return null;
}

/**
 * Display handle: users.username → social username → nickname.
 * Does not invent handles.
 */
export function displayUsernameForUser(
    user: any,
    socialUsername?: string | null,
) {
    if (user?.username) {
        return String(user.username).toLowerCase().replace(/^@+/, "");
    }
    if (socialUsername) {
        return String(socialUsername).toLowerCase().replace(/^@+/, "");
    }
    if (user?.nickname) {
        return String(user.nickname).toLowerCase().replace(/^@+/, "");
    }
    return null;
}

export type InfluencerLookupDto = {
    _id: string;
    name: string;
    username: string;
    referralAlias: string | null;
    avatar: string | null;
};

export function toInfluencerLookupDto(
    user: any,
    socialUsername?: string | null,
): InfluencerLookupDto | null {
    if (!isInfluencer(user)) return null;
    // Prefer real handles; fall back to nickname/name for display only (no invented @).
    const username =
        displayUsernameForUser(user, socialUsername) ||
        (user.name ? String(user.name).trim() : null);
    if (!username) return null;
    return {
        _id: String(user._id),
        name: user.name || "Influencer",
        username,
        referralAlias: user.referralAlias ?? user.referralCode ?? null,
        avatar: user.avatar ?? null,
    };
}
