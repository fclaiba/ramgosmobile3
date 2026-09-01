import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSelfOrAdmin, requireActor, checkRateLimit, createSession, getActorOrNull } from "./authHelpers";
import { internal } from "./_generated/api";
import { hashPassword, verifyPassword } from "./passwordHelpers";
import {
    aliasValidationMessage,
    findUserByReferralInput,
    isAliasCooldownActive,
    normalizeReferralAlias,
    normalizeReferralInput,
    preferredShareCode,
    validateReferralAliasFormat,
} from "./referralHelpers";
import {
    assertHandleAvailable,
    assertHandleShape,
    findFreeHandle,
    newUserIdentityFields,
    normalizeHandle,
    writeUserIdentity,
} from "./users/identity";
import { searchDirectoryImpl } from "./userDirectory";
import { toUserCard, socialProfileOf, userCardValidator } from "./userCard";
import { REFERRAL_REWARDS } from "./economy/_rewardRules";
import { resolveKycStatus } from "./_kyc";
import { can, denialMessage, PRIVILEGED_ROLES, SELF_ASSIGNABLE_ROLES } from "./_roles";
import { buildAuditRecord } from "./_audit";
import { normalizePhone, PHONE_ERRORS, validatePhone } from "./_phone";

export const internalCheckRateLimit = internalMutation({
    args: { key: v.string(), maxAttempts: v.number(), windowMs: v.number() },
    handler: async (ctx, args) => {
        await checkRateLimit(ctx, args.key, args.maxAttempts, args.windowMs);
    }
});

export const checkInfluencerMetrics = internalMutation({
    args: {},
    handler: async (ctx, args) => {
        const influencers = await ctx.db
            .query("users")
            // Ideally we'd have an index on role, but filtering in memory for MVP is okay if set is small
            .filter((q) => q.eq(q.field("role"), "influencer"))
            .collect();

        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

        for (const user of influencers) {
            const joinedAt = new Date(user.joinedAt).getTime();
            // If account is older than 30 days
            if (now - joinedAt > THIRTY_DAYS_MS) {
                // If followers < 5000 (default 0)
                if ((user.followerCount || 0) < 5000) {
                    console.log(`[Influencer Check] Downgrading user ${user._id} (${user.email}) due to insufficient followers.`);
                    await ctx.db.patch(user._id, {
                        role: 'consumer'
                    });
                    // Optional: Send notification here
                }
            }
        }
    }
});

// Los montos vienen de `economy/_rewardRules.ts`, el mismo módulo que leen los
// contextos de React. Estaban hardcodeados acá y la UI de referidos mostraba
// otros números (5 / 10 / 25), así que el usuario veía una cifra y cobraba otra.
const REFERRAL_WELCOME_BONUS = 0; // Ahora se da en la primera compra
const REFERRAL_SIGNUP_BONUS = REFERRAL_REWARDS.SIGNUP;
const REFERRAL_FIRST_PURCHASE_BONUS = REFERRAL_REWARDS.FIRST_PURCHASE_REFERRER;
const REFERRAL_NEW_USER_FIRST_PURCHASE_BONUS = REFERRAL_REWARDS.FIRST_PURCHASE_NEW_USER;
const REFERRAL_HIGH_TICKET_BONUS = 25;
const REFERRAL_HIGH_TICKET_THRESHOLD_USD = 100;

/** Resolve invite code: handle (@username) → referralAlias → legacy referralCode. */
/**
 * Delegado a `referralHelpers.findUserByReferralInput`: la misma resolución la
 * necesita el motor de comisiones del checkout, y tener dos copias es
 * exactamente cómo se rompió antes (el checkout miraba sólo el índice legacy).
 */
const resolveReferrerByInput = findUserByReferralInput;

async function assertReferralAliasAvailable(
    ctx: any,
    alias: string,
    selfUserId: Id<"users">,
    ownUsername?: string | null,
) {
    const formatErr = validateReferralAliasFormat(alias, ownUsername);
    if (formatErr) throw new Error(aliasValidationMessage(formatErr));

    const usernameHit = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) => q.eq("username", alias.toLowerCase()))
        .first();
    if (usernameHit && String(usernameHit._id) !== String(selfUserId)) {
        throw new Error("Ese alias coincide con el @usuario de otra persona.");
    }

    const aliasHit = await ctx.db
        .query("users")
        .withIndex("by_referral_alias", (q: any) => q.eq("referralAlias", alias))
        .first();
    if (aliasHit && String(aliasHit._id) !== String(selfUserId)) {
        throw new Error("Ese alias ya está en uso.");
    }

    const legacyCodeHit = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q: any) => q.eq("referralCode", alias))
        .first();
    if (legacyCodeHit && String(legacyCodeHit._id) !== String(selfUserId)) {
        throw new Error("Ese alias ya está en uso.");
    }
}

async function awardReferralOnSignup(
    ctx: any,
    userId: Id<"users">,
    userName: string,
    referrerId?: Id<"users">,
) {
    await ctx.runMutation(internal.economy.applyPointsEventInternal, {
        userId: String(userId),
        eventKey: `signup_welcome_${String(userId)}`,
        type: "earn",
        source: "bonus",
        amount: REFERRAL_WELCOME_BONUS,
        description: "Bono de bienvenida por registrarte en Ramgos",
    });

    if (!referrerId) return;
    if (String(referrerId) === String(userId)) return;

    const referrerUser = await ctx.db.get(referrerId);
    if (!referrerUser) return;

    await ctx.runMutation(internal.economy.applyPointsEventInternal, {
        userId: String(referrerUser._id),
        eventKey: `ref_signup_${String(userId)}`,
        type: "earn",
        source: "referral",
        amount: REFERRAL_SIGNUP_BONUS,
        description: `Registro de referido (${userName})`,
        metadata: { friendUserId: String(userId), referrerUserId: String(referrerId) },
    });

    // Antes esto no avisaba a nadie: el referidor recién se enteraba si
    // abría la pantalla de Referidos. Mismo patrón que la notificación de
    // puntos por compra propia (`stripe.ts`).
    await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
        userId: String(referrerUser._id),
        title: "¡Tu referido se registró!",
        body: `Sumaste +${REFERRAL_SIGNUP_BONUS} pts porque ${userName} se registró con tu código.`,
        category: "payment",
        sendEmail: true,
        data: { friendUserId: String(userId) },
    });
}

const sanitizeUser = async (ctx: any, user: any) => {
    let avatarUrl = user.avatar;
    if (avatarUrl && avatarUrl.startsWith("convex-storage:") && typeof ctx.storage.getUrl === 'function') {
        const url = await ctx.storage.getUrl(avatarUrl.replace("convex-storage:", "") || avatarUrl);
        if (url) avatarUrl = url;
    }
    // ponytail: [techo/limitación] Global toggle para desactivar KYC por defecto
    const requireKyc = await ctx.db
        .query("global_settings")
        .withIndex("by_key", (q: any) => q.eq("key", "require_kyc"))
        .first();
    const isKycEnabled = requireKyc?.value === true; // Default is FALSE (Desactivado por defecto)

    // La resolución vive en `_kyc.ts` para que los gates que bloquean de verdad
    // (retiro, formularios, bonos) usen exactamente el mismo criterio. Antes
    // cada uno tenía el suyo y esto devolvía "approved" a usuarios a los que
    // `finance.requestWithdrawal` después les negaba el retiro.
    const effectiveKycStatus = resolveKycStatus(user.kycStatus, isKycEnabled);

    return {
    _id: user._id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    avatar: avatarUrl,
    kycStatus: effectiveKycStatus,
    // El cliente no puede deducir esto: el toggle vive en `global_settings`.
    // `useActionGate` lo venía leyendo de un `requiresKyc` hardcodeado en
    // `AuthContext`, o sea que decidía sobre un dato inventado.
    requiresKyc: isKycEnabled,
    joinedAt: user.joinedAt,
    tier: user.tier,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionTier: user.subscriptionTier,
    termsAcceptedVersion: user.termsAcceptedVersion,
    isTest: user.isTest,
    balance: user.balance,
    bio: user.bio,
    sellerRating: user.sellerRating,
    sellerReviewCount: user.sellerReviewCount,
    sellerTotalSales: user.sellerTotalSales,
    sellerResponseTimeHours: user.sellerResponseTimeHours,
    isBanned: user.isBanned,
    businessAvailability: user.businessAvailability,
    username: user.username,
    phoneNumber: user.phoneNumber,
    businessCategory: user.businessCategory,
    emailVerified: user.emailVerified,
    storeLocation: user.storeLocation,
    // Alias used by CommercialProfile / marketplace "Tiendas"
    location: user.storeLocation,
    referralAlias: user.referralAlias,
    referredByUserId: user.referredByUserId ? String(user.referredByUserId) : undefined,
    };
};

export const register = mutation({
    args: {
        email: v.string(),
        password: v.string(),
        name: v.string(),
        role: v.string(),
        avatar: v.optional(v.string()),
        termsVersion: v.optional(v.number()),
        nickname: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        bio: v.optional(v.string()),
        businessAddress: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        username: v.optional(v.string()),
        referralCode: v.optional(v.string()),
        referredBy: v.optional(v.string()),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // `register` es una mutation PÚBLICA y `role` llega como `v.string()`
        // desde el cliente. La lista anterior incluía `'admin'`, así que
        // cualquiera podía crear una cuenta administrativa llamando esta
        // mutation con `role: "admin"` — sin dominio de email, sin nada.
        if (!SELF_ASSIGNABLE_ROLES.has(args.role)) {
            throw new Error("Rol inválido.");
        }

        const email = args.email.trim().toLowerCase();
        const name = args.name.trim();
        if (!email || !name) {
            throw new Error("Email y nombre son obligatorios.");
        }

        // Password complexity validation
        const pass = args.password;
        if (pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
            throw new Error("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }

        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            throw new Error("No se pudo registrar la cuenta. Si ya tienes una cuenta, intenta iniciar sesión.");
        }

        const finalUsername = normalizeHandle(args.username);
        if (!finalUsername) {
            throw new Error("Elegí un nombre de usuario (@) para continuar.");
        }
        assertHandleShape(finalUsername);
        await assertHandleAvailable(ctx, finalUsername);

        if (args.role === "business" && !args.businessCategory?.trim()) {
            throw new Error("Seleccioná la categoría de tu negocio.");
        }
        if (args.role === "business" && !args.nickname?.trim()) {
            throw new Error("Ingresá el nombre del negocio.");
        }
        if (args.role === "influencer" && !args.businessCategory?.trim()) {
            throw new Error("Seleccioná tu categoría de influencer.");
        }
        if (
            args.role === "influencer" &&
            !args.instagramUrl?.trim() &&
            !args.tiktokUrl?.trim()
        ) {
            throw new Error("Debés proporcionar al menos Instagram o TikTok.");
        }

        let referredByUserId: Id<"users"> | undefined;
        if (args.referredBy?.trim()) {
            const referrer = await resolveReferrerByInput(ctx, args.referredBy);
            if (referrer) referredByUserId = referrer._id;
        }

        const hashedPassword = hashPassword(args.password);
        const initialInfluencerStatus = args.role === 'influencer' ? 'pending' : undefined;

        const businessName = args.nickname?.trim() || undefined;
        const businessAddress = args.businessAddress?.trim() || undefined;
        const kycProfile =
            businessName || businessAddress
                ? {
                      ...(businessName ? { businessName } : {}),
                      ...(businessAddress ? { businessAddress } : {}),
                  }
                : undefined;

        const userId = await ctx.db.insert("users", {
            uid: Math.random().toString(36).slice(2),
            email,
            password: hashedPassword,
            name,
            role: args.role as any,
            avatar: args.avatar,
            nickname: businessName,
            phoneNumber: args.phoneNumber?.trim() || undefined,
            bio: args.bio?.trim() || undefined,
            businessCategory: args.businessCategory?.trim() || undefined,
            ...newUserIdentityFields({
                username: finalUsername,
                name,
                nickname: businessName,
                kycProfile,
            }),
            ...(referredByUserId ? { referredByUserId } : {}),
            ...(kycProfile ? { kycProfile } : {}),
            kycStatus: "pending",
            influencerStatus: initialInfluencerStatus as any,
            instagramUrl: args.instagramUrl?.trim() || undefined,
            tiktokUrl: args.tiktokUrl?.trim() || undefined,
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: email.endsWith("@ramgos.com"),
            ...(args.termsVersion ? { termsAcceptedVersion: args.termsVersion } : {}),
        });

        const sessionToken = await createSession(ctx, userId);
        
        try {
            await awardReferralOnSignup(ctx, userId, name, referredByUserId);
        } catch (e) { console.error("Error otorgando puntos de registro:", e); }

        const require2FA = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q) => q.eq("key", "require_2fa"))
            .first();
        const is2FAEnabled = require2FA?.value !== false;

        return { userId: String(userId), sessionToken, requiresOtp: is2FAEnabled };
    },
});

export const login = mutation({
    args: {
        emailOrUsername: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const input = args.emailOrUsername.trim().toLowerCase();
        await checkRateLimit(ctx, `login_${input}`, 5, 900000);

        let user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", input))
            .first();

        if (!user) {
            user = await ctx.db
                .query("users")
                .withIndex("by_username", (q) => q.eq("username", input))
                .first();
        }

        if (!user) {
            // Anti-enumeration: Generic error message
            throw new Error("Credenciales incorrectas.");
        }

        if ((user as any).isBanned) {
            throw new Error("ACCOUNT_BANNED");
        }

        const passwordHash = user.password;
        if (!passwordHash || !verifyPassword(args.password, passwordHash)) {
            throw new Error("Credenciales incorrectas.");
        }

        // ponytail: [techo/limitación] Este switch global de 2FA debe ser borrado antes de producción
        const require2FA = await ctx.db
            .query("global_settings")
            .withIndex("by_key", (q) => q.eq("key", "require_2fa"))
            .first();
        const is2FAEnabled = require2FA?.value !== false;

        if (is2FAEnabled && !(user as any).isTest) {
            // ponytail: emitimos requireOtp
            return { 
                requiresOtp: true, 
                email: user.email, 
                userId: user._id 
            };
        }

        // Bypassing 2FA
        const sessionToken = await createSession(ctx, user._id);
        const userObj = await sanitizeUser(ctx, user);
        return { ...userObj, sessionToken };
    },
});

/** OAuth after provider token verification (internal only). */
export const oauthLoginFromProvider = internalMutation({
    args: {
        provider: v.string(),
        /** Optional for Apple re-login (Hide My Email / email only on first auth). */
        email: v.optional(v.string()),
        name: v.string(),
        providerUserId: v.string(),
        role: v.optional(v.string()),
        /** login = existing users only; register = create if missing (requires role). */
        mode: v.union(v.literal("login"), v.literal("register")),
        username: v.optional(v.string()),
        referredBy: v.optional(v.string()),
        businessCategory: v.optional(v.string()),
        nickname: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        bio: v.optional(v.string()),
        businessAddress: v.optional(v.string()),
        instagramUrl: v.optional(v.string()),
        tiktokUrl: v.optional(v.string()),
        termsVersion: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const uid = `${args.provider}_${args.providerUserId}`;
        const email = args.email?.trim().toLowerCase() || undefined;

        // Prefer stable provider uid (Apple may omit email after first sign-in).
        let user = await ctx.db
            .query("users")
            .withIndex("by_uid", (q) => q.eq("uid", uid))
            .first();

        if (!user && email) {
            user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", email))
                .first();
        }

        // Login: never create. Register: never overwrite an existing account.
        if (!user) {
            if (args.mode === "login") {
                throw new Error(
                    "NO_ACCOUNT: No hay cuenta con este email. Registrate y elegí el tipo de usuario.",
                );
            }

            if (!email) {
                throw new Error(
                    "Apple no compartió el email. En el iPhone: Ajustes → Apple ID → Inicio de sesión y seguridad → Apps con Apple ID → Ramgos → Dejar de usar Apple ID, y volvé a registrarte.",
                );
            }

            if (!args.role || !SELF_ASSIGNABLE_ROLES.has(args.role)) {
                throw new Error(
                    "Elegí el tipo de cuenta (consumidor, negocio o influencer) antes de continuar.",
                );
            }

            const finalUsername = normalizeHandle(args.username);
            if (!finalUsername) {
                throw new Error("Elegí un nombre de usuario (@) para continuar.");
            }
            assertHandleShape(finalUsername);
            await assertHandleAvailable(ctx, finalUsername);

            if (args.role === "business" && !args.businessCategory?.trim()) {
                throw new Error("Seleccioná la categoría de tu negocio.");
            }
            if (args.role === "business" && !args.nickname?.trim()) {
                throw new Error("Ingresá el nombre del negocio.");
            }
            if (args.role === "influencer" && !args.businessCategory?.trim()) {
                throw new Error("Seleccioná tu categoría de influencer.");
            }
            if (
                args.role === "influencer" &&
                !args.instagramUrl?.trim() &&
                !args.tiktokUrl?.trim()
            ) {
                throw new Error("Debés proporcionar al menos Instagram o TikTok.");
            }

            let referredByUserId: Id<"users"> | undefined;
            if (args.referredBy?.trim()) {
                const referrer = await resolveReferrerByInput(ctx, args.referredBy);
                if (referrer) referredByUserId = referrer._id;
            }

            const initialInfluencerStatus =
                args.role === "influencer" ? "pending" : undefined;

            const businessName = args.nickname?.trim() || undefined;
            const businessAddress = args.businessAddress?.trim() || undefined;
            const kycProfile =
                businessName || businessAddress
                    ? {
                          ...(businessName ? { businessName } : {}),
                          ...(businessAddress ? { businessAddress } : {}),
                      }
                    : undefined;

            const userId = await ctx.db.insert("users", {
                uid,
                email,
                name: args.name.trim(),
                role: args.role as any,
                ...newUserIdentityFields({
                    username: finalUsername,
                    name: args.name.trim(),
                    nickname: businessName,
                    kycProfile,
                }),
                ...(referredByUserId ? { referredByUserId } : {}),
                nickname: businessName,
                phoneNumber: args.phoneNumber?.trim() || undefined,
                bio: args.bio?.trim() || undefined,
                businessCategory: args.businessCategory?.trim() || undefined,
                ...(kycProfile ? { kycProfile } : {}),
                instagramUrl: args.instagramUrl?.trim() || undefined,
                tiktokUrl: args.tiktokUrl?.trim() || undefined,
                influencerStatus: initialInfluencerStatus as any,
                kycStatus: "pending",
                joinedAt: new Date().toISOString(),
                tier: "Bronze",
                subscriptionStatus: "inactive",
                isTest: email.endsWith("@ramgos.com"),
                emailVerified: true,
                ...(args.termsVersion
                    ? { termsAcceptedVersion: args.termsVersion }
                    : {}),
            });
            user = await ctx.db.get(userId);

            try {
                await awardReferralOnSignup(ctx, userId, args.name.trim(), referredByUserId);
            } catch (e) {
                console.error("Error otorgando puntos OAuth:", e);
            }
        } else if (args.mode === "register") {
            throw new Error(
                "ACCOUNT_EXISTS: Ya tenés una cuenta con este email. Andá a Iniciar sesión.",
            );
        }
        // mode === login + user exists: allow OAuth as alternate login

        if ((user as any).isBanned) {
            throw new Error("ACCOUNT_BANNED");
        }

        const sessionToken = await createSession(ctx, user!._id);
        return { ...(await sanitizeUser(ctx, user)), sessionToken };
    },
});

export const logout = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        if (!args.sessionToken) return;
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
            .first();
        if (session && !session.revokedAt) {
            await ctx.db.patch(session._id, { revokedAt: new Date().toISOString() });
        }
    },
});

// Change the password of an authenticated user.
export const changePassword = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        code: v.string(),
        currentPassword: v.string(),
        newPassword: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        
        const user = await ctx.db.get(actor.id);
        if (!user) {
            throw new Error("Usuario no encontrado.");
        }
        if (user.otp !== args.code) {
            throw new Error("El código de verificación es inválido.");
        }
        if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
            throw new Error("El código ha expirado.");
        }

        if (!user.password || !verifyPassword(args.currentPassword, user.password)) {
            throw new Error("La contraseña actual es incorrecta.");
        }

        if (args.newPassword.length < 8 || !/[A-Z]/.test(args.newPassword) || !/[0-9]/.test(args.newPassword)) {
            throw new Error("La nueva contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
        }

        if (args.newPassword === args.currentPassword) {
            throw new Error("Por razones de seguridad, la nueva contraseña no puede ser igual a la actual.");
        }

        // Password History check
        const history = user.passwordHistory || [];
        for (const oldHash of history) {
            if (verifyPassword(args.newPassword, oldHash)) {
                throw new Error("Por razones de seguridad, la nueva contraseña no puede ser igual a contraseñas usadas recientemente.");
            }
        }

        const newHash = hashPassword(args.newPassword);
        const newHistory = [newHash, ...history].slice(0, 5); // Keep last 5

        await ctx.db.patch(actor.id, {
            password: newHash,
            passwordHistory: newHistory,
            otp: undefined,
            otpExpiresAt: undefined,
        });
        return { success: true };
    },
});

/**
 * Subconjunto público de un usuario: lo que se puede mostrar de un tercero.
 *
 * `getUser` sólo aplicaba el chequeo de identidad SI venía `sessionToken`, así
 * que llamarla sin token con el id de cualquiera devolvía su `email`,
 * `phoneNumber`, `balance` y `kycStatus`. El perfil comercial la llama
 * justamente así. Ahora esa rama pasa por acá.
 */
const sanitizePublicUser = async (ctx: any, user: any) => {
    // Misma FORMA que `sanitizeUser` con los campos privados vacíos, en vez de
    // un objeto más chico: así el tipo de retorno de `getUser` es uno solo y
    // los consumidores que leen su propio perfil siguen compilando.
    const full = await sanitizeUser(ctx, user);
    return {
        ...full,
        email: undefined,
        uid: undefined,
        phoneNumber: undefined,
        emailVerified: undefined,
        balance: undefined,
        tier: undefined,
        subscriptionStatus: undefined,
        subscriptionTier: undefined,
        termsAcceptedVersion: undefined,
        referralAlias: undefined,
        referredByUserId: undefined,
        isBanned: undefined,
        // Booleano derivado en vez del `kycStatus` crudo: para pintar la
        // insignia alcanza con saber que está verificado; que un tercero lea si
        // tu KYC está pendiente o rechazado no le sirve a nadie.
        kycStatus: undefined,
        isVerified: full.kycStatus === 'approved',
    };
};

export const getUser = query({
    args: { id: v.id("users"), sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        try {
            const user = await ctx.db.get(args.id);
            if (!user) return null;

            if (args.sessionToken) {
                 // `allowBanned`: es la query con la que el cliente lee su
                 // propio perfil. Si devolviera null para un baneado,
                 // `BannedUserScreen` no tendría qué mostrar.
                 const actor = await getActorOrNull(ctx, args.sessionToken, { allowBanned: true });
                 if (actor && actor.idString === args.id) {
                     return await sanitizeUser(ctx, user);
                 }
            }

            // Sin sesión, o mirando a otro: sólo datos públicos.
            return await sanitizePublicUser(ctx, user);
        } catch (e) {
            return null;
        }
    },
});

export const syncUser = mutation({
    args: {
        uid: v.string(),
        name: v.string(),
        email: v.string(),
        role: v.string(),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Legacy sync for Social Auth (if we keep it)
        // For now reuse logic
        const email = args.email.trim().toLowerCase();
        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            // SECURITY (Fase 1): syncUser NO puede emitir sesión para una
            // cuenta con contraseña — eso permitía account takeover enviando
            // el email de la víctima. Esas cuentas deben usar login().
            // Deuda Fase 2: verificar el token OAuth del proveedor server-side.
            if (existing.password) {
                throw new Error(
                    "Esta cuenta usa contraseña. Iniciá sesión con email y contraseña.",
                );
            }
            const sessionToken = await createSession(ctx, existing._id);
            return { userId: String(existing._id), sessionToken };
        }

        const isTestAccount = email.endsWith('@ramgos.com') || (args as any).isTest;

        // Alta por OAuth: la persona no elige handle, así que lo derivamos.
        // Antes era `nombre + 3 dígitos al azar` y ante colisión se le pegaban
        // 2 dígitos más UNA vez, SIN volver a chequear — así entraban handles
        // duplicados. `findFreeHandle` itera verificando en cada vuelta.
        const finalUsername = await findFreeHandle(
            ctx,
            normalizeHandle(args.name.split(' ')[0]) ??
                normalizeHandle(email.split('@')[0]) ??
                'user',
        );

        const newUserId = await ctx.db.insert("users", {
            uid: args.uid,
            email,
            name: args.name.trim(),
            role: args.role as any,
            avatar: args.avatar,
            ...newUserIdentityFields({ username: finalUsername, name: args.name.trim() }),
            kycStatus: "pending",
            joinedAt: new Date().toISOString(),
            tier: "Bronze",
            subscriptionStatus: "inactive",
            isTest: isTestAccount,
        });
        const sessionToken = await createSession(ctx, newUserId);
        return { userId: String(newUserId), sessionToken };
    }
});

export const updateProfile = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            nickname: v.optional(v.string()),
            avatar: v.optional(v.string()),
            phoneNumber: v.optional(v.string()),
            username: v.optional(v.string()),
            /** @deprecated Prefer referralAlias for vanity invite codes. */
            referralCode: v.optional(v.string()),
            referralAlias: v.optional(v.string()),
            businessAvailability: v.optional(v.object({
                days: v.array(v.number()),
                startTime: v.string(),
                endTime: v.string(),
                slotDurationMinutes: v.number(),
            })),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        const userDoc = await ctx.db.get(args.id);
        if (!userDoc) throw new Error("Usuario no encontrado.");

        const updates: any = {};
        if (args.updates.phoneNumber !== undefined) updates.phoneNumber = args.updates.phoneNumber.trim();
        if (args.updates.businessAvailability !== undefined) updates.businessAvailability = args.updates.businessAvailability;

        // Vanity alias (preferred). Legacy referralCode updates map to referralAlias.
        const rawAliasUpdate =
            args.updates.referralAlias !== undefined
                ? args.updates.referralAlias
                : args.updates.referralCode !== undefined
                  ? args.updates.referralCode
                  : undefined;

        if (rawAliasUpdate !== undefined) {
            const nextAlias = normalizeReferralAlias(rawAliasUpdate);
            const prevAlias = ((userDoc as any).referralAlias as string | undefined) || "";

            if (nextAlias !== prevAlias) {
                if (nextAlias) {
                    if (
                        isAliasCooldownActive((userDoc as any).referralAliasChangedAt) &&
                        prevAlias
                    ) {
                        throw new Error(aliasValidationMessage("cooldown"));
                    }
                    await assertReferralAliasAvailable(
                        ctx,
                        nextAlias,
                        args.id,
                        userDoc.username,
                    );
                    updates.referralAlias = nextAlias;
                } else {
                    updates.referralAlias = undefined;
                }
                updates.referralAliasChangedAt = Date.now();
            }
        }

        if (Object.keys(updates).length > 0) {
            await ctx.db.patch(args.id, updates);
        }

        // Identidad (handle, nombre, nickname, avatar) por el único camino
        // autorizado: valida, chequea unicidad contra handles Y alias de
        // referido, recalcula `searchText` y espeja a `socialUsers`.
        // Va al final para que el alias ya esté escrito cuando se compara
        // "mi alias tiene que ser distinto de mi handle".
        const identityPatch: any = {};
        if (args.updates.name !== undefined) identityPatch.name = args.updates.name.trim();
        if (args.updates.nickname !== undefined) identityPatch.nickname = args.updates.nickname.trim();
        if (args.updates.avatar !== undefined) identityPatch.avatar = args.updates.avatar;
        if (args.updates.username !== undefined) identityPatch.username = args.updates.username;

        if (Object.keys(identityPatch).length > 0) {
            await writeUserIdentity(ctx, args.id, identityPatch, {
                actorIsAdmin: actor.role === "admin" || actor.role === "developer",
            });
        }
    }
});

// --- NEW CRUD ---

export const listUsers = query({
    args: {
        sessionToken: v.optional(v.string()),
        role: v.optional(v.string()),
        actorId: v.optional(v.string()),
        term: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (!can(actor.role, 'view_admin_panel')) {
            throw new Error("No autorizado.");
        }

        // Con término, el panel busca por el índice en vez de traerse la
        // tabla entera y filtrar en memoria.
        if (args.term?.trim()) {
            const cards = await searchDirectoryImpl(
                ctx,
                (args as any).sessionToken,
                args.term,
                args.limit ?? 50,
                { excludeSelf: false, role: args.role },
            );
            const docs = await Promise.all(
                cards.map(async (c) => {
                    const ref = ctx.db.normalizeId("users", c.userId);
                    return ref ? await ctx.db.get(ref) : null;
                }),
            );
            return await Promise.all(
                docs.filter(Boolean).map((u) => sanitizeUser(ctx, u as any)),
            );
        }

        // Sin término: tope duro. `.collect()` sobre `users` es una bomba de
        // tiempo — el panel de admin se cae solo cuando la tabla crece.
        const users = args.role
            ? await ctx.db
                  .query("users")
                  .withIndex("by_role", (q) => q.eq("role", args.role as any))
                  .take(Math.min(args.limit ?? 500, 1000))
            : await ctx.db.query("users").take(Math.min(args.limit ?? 500, 1000));
        const sanitized = await Promise.all(users.map(u => sanitizeUser(ctx, u)));
        sanitized.sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));
        if (args.role) {
            return sanitized.filter(u => u.role === args.role);
        }
        return sanitized;
    },
});

/** Public store cards for marketplace "Tiendas" tab (businesses with storeLocation). */
export const listBusinessStores = query({
    args: {},
    handler: async (ctx) => {
        // Endpoint público sin auth: leía la tabla `users` COMPLETA en cada
        // visita al marketplace. Ahora entra por el índice de rol.
        const users = await ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", "business"))
            .take(500);
        const businesses = users.filter(
            (u) =>
                u.role === "business" &&
                !u.isBanned &&
                u.storeLocation?.lat != null &&
                u.storeLocation?.lng != null,
        );

        return Promise.all(
            businesses.map(async (u) => {
                const avatarUrl =
                    u.avatar && u.avatar.startsWith("convex-storage:")
                        ? (await ctx.storage.getUrl(u.avatar.replace("convex-storage:", ""))) ||
                          u.avatar
                        : u.avatar;

                return {
                    _id: u._id,
                    id: String(u._id),
                    type: "business" as const,
                    title: u.nickname || u.name,
                    name: u.nickname || u.name,
                    description: u.bio || `Tienda de ${u.name}`,
                    price: 0,
                    category: u.businessCategory || "Negocio",
                    image: avatarUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80",
                    images: avatarUrl
                        ? [{ id: "avatar", url: avatarUrl, isPrimary: true }]
                        : [],
                    location: {
                        lat: u.storeLocation!.lat,
                        lng: u.storeLocation!.lng,
                        name: u.storeLocation!.name || u.storeLocation!.city || "Manhattan, NY",
                        address: u.storeLocation!.address,
                        city: u.storeLocation!.city,
                    },
                    seller: {
                        id: String(u._id),
                        name: u.nickname || u.name,
                        avatar: avatarUrl,
                        type: "business",
                        sellerRating: u.sellerRating || 0,
                    },
                    sellerRating: u.sellerRating || 0,
                    sellerReviewCount: u.sellerReviewCount || 0,
                    kycStatus: u.kycStatus,
                    username: u.username,
                };
            }),
        );
    },
});

export const updateUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        updates: v.object({
            name: v.optional(v.string()),
            role: v.optional(v.string()),
            kycStatus: v.optional(v.string()),
            tier: v.optional(v.string()),
            subscriptionStatus: v.optional(v.string()),
            avatar: v.optional(v.string()),
            email: v.optional(v.string()),
            isTest: v.optional(v.boolean()),
            username: v.optional(v.string()),
            nickname: v.optional(v.string()),
        })
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        /**
         * Control de campos protegidos.
         *
         * La versión anterior exceptuaba de este control a cualquier actor cuyo
         * email terminara en `@ramgos.com`:
         *
         *     const isDevAccount = actor.email?.endsWith('@ramgos.com');
         *     if ((field === 'role' || field === 'isTest') && isDevAccount) continue;
         *
         * Combinado con `ALLOWED_ROLES`, que incluía `'admin'`, eso significaba
         * que **cualquier usuario con casilla en ese dominio podía llamar
         * `updateUser` sobre sí mismo y auto-promoverse a admin**, sin ser admin
         * ni developer. El control era el sufijo de un email, no un rol — y un
         * email es un dato que se elige, no un permiso que se otorga.
         *
         * Ahora depende de la capacidad `change_role` y de nada más.
         */
        const canChangeRole = can(actor.role, 'change_role');
        const isSelf = actor.idString === String(args.id);
        if (!canChangeRole && !isSelf) {
            throw new Error("No autorizado.");
        }

        if (!canChangeRole) {
            const forbidden = ['role', 'kycStatus', 'tier', 'subscriptionStatus', 'isTest'];
            for (const field of forbidden) {
                if (Object.prototype.hasOwnProperty.call(args.updates, field)) {
                    throw new Error("No autorizado para actualizar ese campo.");
                }
            }
        }

        if (args.updates.role) {
            // Los roles privilegiados no se asignan por esta vía ni siquiera
            // teniendo el permiso: promover es una operación aparte, auditada.
            if (PRIVILEGED_ROLES.has(args.updates.role)) {
                throw new Error("Los roles administrativos no se asignan desde el perfil.");
            }
            if (!SELF_ASSIGNABLE_ROLES.has(args.updates.role)) {
                throw new Error("Rol inválido.");
            }
        }

        // Los campos de identidad se separan del patch crudo: por acá se
        // parcheaba `username` SIN validar formato ni unicidad —un bypass
        // completo de las reglas de `updateProfile`, incluso para admin—.
        const { username, name, nickname, avatar, ...rest } = args.updates;

        if (Object.keys(rest).length > 0) {
            // Campos sensibles (role/kycStatus/tier/isTest/subscriptionStatus)
            // sólo llegan hasta acá con `canChangeRole` — son exactamente los
            // que antes se movían sin dejar rastro. Capturar el "antes" previo
            // al patch para que el audit log sirva para algo.
            const before = await ctx.db.get(args.id);
            await ctx.db.patch(args.id, {
                ...rest,
                ...(args.updates.role ? { role: args.updates.role as any } : {}),
            });
            if (canChangeRole && !isSelf) {
                await ctx.db.insert("audit_logs", buildAuditRecord({
                    actorUserId: actor.idString,
                    targetUserId: String(args.id),
                    action: "USER_ROLE_CHANGED",
                    before: before
                        ? { role: before.role, kycStatus: before.kycStatus, tier: before.tier, isTest: (before as any).isTest }
                        : undefined,
                    after: rest,
                }));
            }
        }

        const identityPatch: any = {};
        if (username !== undefined) identityPatch.username = username;
        if (name !== undefined) identityPatch.name = name;
        if (nickname !== undefined) identityPatch.nickname = nickname;
        if (avatar !== undefined) identityPatch.avatar = avatar;
        if (Object.keys(identityPatch).length > 0) {
            // Sólo alimenta el metadato `byAdmin` del registro de identidad.
            await writeUserIdentity(ctx, args.id, identityPatch, { actorIsAdmin: canChangeRole });
        }
    },
});

export const deleteUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users")
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const isAdmin = actor.role === 'admin';
        const isSelf = actor.idString === String(args.id);
        if (!isAdmin && !isSelf) {
            throw new Error("No autorizado.");
        }

        // Clean up all sessions associated with this user
        const userSessions = await ctx.db
            .query("sessions")
            .withIndex("by_user", (q) => q.eq("userId", String(args.id)))
            .collect();
        for (const session of userSessions) {
            await ctx.db.delete(session._id);
        }

        const before = await ctx.db.get(args.id);
        await ctx.db.delete(args.id);

        if (isAdmin && !isSelf) {
            await ctx.db.insert("audit_logs", buildAuditRecord({
                actorUserId: actor.idString,
                targetUserId: String(args.id),
                action: "USER_DELETED",
                before: before ? { email: before.email, role: before.role } : undefined,
            }));
        }
    },
});

export const unbanUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (!can(actor.role, 'ban_user')) throw new Error(denialMessage('ban_user'));
        await writeUserIdentity(ctx, args.userId, { isBanned: false }, { actorIsAdmin: true });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.userId),
            action: "USER_UNBANNED",
            timestamp: new Date().toISOString(),
        });
        return { success: true };
    },
});

export const banUser = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.id("users"),
        reason: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (!can(actor.role, 'ban_user')) throw new Error(denialMessage('ban_user'));
        
        // `writeUserIdentity` es el único escritor de `isBanned`: setea el
        // flag, esconde del directorio y revoca las sesiones, todo junto.
        await writeUserIdentity(ctx, args.userId, { isBanned: true }, { actorIsAdmin: true });
        const now = new Date().toISOString();

        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.userId),
            action: "USER_BANNED",
            timestamp: now,
            metadata: args.reason ? { reason: args.reason } : undefined,
        });
    }
});

export const approveKYC = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.id("users"),
        actorId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (!can(actor.role, 'review_kyc')) {
            throw new Error("No tienes permisos de administrador.");
        }
        const user = await ctx.db.get(args.targetUserId);
        if (!user) throw new Error("Usuario no encontrado.");
        const now = new Date().toISOString();
        const docs = (user.verificationDocuments ?? []).map((d) => ({
            ...d,
            status: 'approved' as const,
            reviewedAt: now,
        }));
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved',
            verificationDocuments: docs.length ? docs : undefined,
        });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.targetUserId),
            action: "KYC_APPROVED",
            timestamp: now,
        });
    }
});

export const internalApproveKYC = internalMutation({
    args: {
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'approved'
        });
    }
});

export const internalRejectKYC = internalMutation({
    args: {
        targetUserId: v.id("users")
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected'
        });
    }
});

export const rejectKYC = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        targetUserId: v.id("users"),
        reason: v.optional(v.string()),
        actorId: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        if (!can(actor.role, 'review_kyc')) {
            throw new Error("No tienes permisos de administrador.");
        }
        const user = await ctx.db.get(args.targetUserId);
        if (!user) throw new Error("Usuario no encontrado.");
        const now = new Date().toISOString();
        const docs = (user.verificationDocuments ?? []).map((d) => ({
            ...d,
            status: 'rejected' as const,
            reviewedAt: now,
        }));
        await ctx.db.patch(args.targetUserId, {
            kycStatus: 'rejected',
            verificationDocuments: docs.length ? docs : undefined,
        });
        await ctx.db.insert("audit_logs", {
            actorUserId: actor.idString,
            targetUserId: String(args.targetUserId),
            action: "KYC_REJECTED",
            timestamp: now,
            metadata: args.reason ? { reason: args.reason } : undefined,
        });
    }
});

export const acceptTerms = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        version: v.number(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);

        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id as Id<"users">, {
            termsAcceptedVersion: args.version
        });
    }
});

export const submitKyc = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        payload: v.any(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        const payload = (args.payload || {}) as Record<string, unknown>;
        const now = new Date().toISOString();
        const docs: Array<{ type: string; url: string; status: 'pending' | 'approved' | 'rejected'; uploadedAt: string; reviewedAt?: string }> = [];

        const pushDoc = (type: string, url: unknown) => {
            if (typeof url !== 'string' || !url.trim()) return;
            const trimmed = url.trim();
            // Base64 in mutation args hits Convex ~1 MiB limit — must use File Storage first.
            if (trimmed.startsWith('data:')) {
                throw new Error(
                    'Las fotos KYC deben subirse al almacenamiento antes de enviar. Volvé a adjuntarlas e intentá de nuevo.',
                );
            }
            docs.push({ type, url: trimmed, status: 'pending', uploadedAt: now });
        };

        pushDoc('id_front', payload.documentFront);
        pushDoc('id_back', payload.documentBack);
        pushDoc('business_license', payload.incorporationDoc);
        pushDoc('address_proof', payload.premisesPhoto);

        const existing = await ctx.db.get(args.id);
        const prevProfile = (existing as any)?.kycProfile ?? {};

        const str = (v: unknown) =>
            typeof v === 'string' && v.trim() ? v.trim() : undefined;

        const businessAddress =
            str(payload.businessAddress) || str(payload.address) || prevProfile.businessAddress;
        const ein = str(payload.ein) || str(payload.taxId) || prevProfile.ein;
        /**
         * El teléfono es el medio por el que el revisor contacta al usuario si
         * el KYC necesita aclaraciones. No se verifica por SMS, así que lo
         * mínimo es que sea un número plausible: antes el cliente sólo lo
         * formateaba y acá entraba cualquier cosa, incluido un solo dígito.
         *
         * Se guarda normalizado (sólo dígitos, con `+` si venía) para que el
         * mismo número escrito de dos formas no parezca dos números distintos.
         */
        const rawContactPhone = str(payload.contactPhone) || prevProfile.contactPhone;
        let contactPhone = rawContactPhone;
        if (rawContactPhone) {
            const phoneError = validatePhone(rawContactPhone);
            if (phoneError) {
                throw new Error(PHONE_ERRORS[phoneError]);
            }
            contactPhone = normalizePhone(rawContactPhone);
        }
        const contactEmail = str(payload.contactEmail) || prevProfile.contactEmail;
        const socialLink = str(payload.socialLink) || prevProfile.socialLink;
        const legalRep = str(payload.legalRep) || prevProfile.legalRep;
        const businessName =
            str(payload.businessName) || prevProfile.businessName || (existing as any)?.nickname;
        const submittedAt = str(payload.submittedAt) || now;
        const submittedFrom = str(payload.submittedFrom) || prevProfile.submittedFrom;
        const selfieValidated =
            typeof payload.selfieValidated === 'boolean'
                ? payload.selfieValidated
                : prevProfile.selfieValidated;

        const kycProfile = {
            ...(businessAddress ? { businessAddress } : {}),
            ...(ein ? { ein } : {}),
            ...(contactPhone ? { contactPhone } : {}),
            ...(contactEmail ? { contactEmail } : {}),
            ...(socialLink ? { socialLink } : {}),
            ...(legalRep ? { legalRep } : {}),
            ...(businessName ? { businessName } : {}),
            ...(submittedAt ? { submittedAt } : {}),
            ...(submittedFrom ? { submittedFrom } : {}),
            ...(typeof selfieValidated === 'boolean' ? { selfieValidated } : {}),
        };

        const patch: Record<string, unknown> = {
            kycStatus: 'pending',
            kycProfile: Object.keys(kycProfile).length > 0 ? kycProfile : undefined,
            verificationDocuments: docs.length > 0 ? docs : undefined,
        };

        if (socialLink) {
            const url = socialLink;
            const socialData: any = { website: url };
            if (url.includes('instagram.com')) {
                socialData.instagram = url;
                delete socialData.website;
                patch.instagramUrl = url;
            } else if (url.includes('tiktok.com')) {
                socialData.tiktok = url;
                delete socialData.website;
                patch.tiktokUrl = url;
            } else if (url.includes('youtube.com')) {
                socialData.youtube = url;
                delete socialData.website;
            }
            patch.socialLinks = socialData;
        }

        if (contactPhone) {
            patch.phoneNumber = contactPhone;
        }

        if (businessName && !(existing as any)?.nickname) {
            patch.nickname = businessName;
        }

        await ctx.db.patch(args.id, patch);
    }
});

export const updateSubscription = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        tier: v.union(v.literal('free'), v.literal('pro'), v.literal('business')),
        status: v.union(v.literal('active'), v.literal('inactive')),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));

        await ctx.db.patch(args.id, {
            subscriptionStatus: args.status,
            subscriptionTier: args.tier,
        } as any);
    }
});

export const saveStripeConnectAccount = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        id: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.id));
        await ctx.db.patch(args.id, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    }
});

export const internalUpdateStripeConnectId = internalMutation({
    args: {
        userId: v.id("users"),
        stripeConnectAccountId: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            stripeConnectAccountId: args.stripeConnectAccountId,
        } as any);
    }
});

// ---------------------------------------------------------------------------
// Influencer attribution helpers.
// ---------------------------------------------------------------------------

/** Fase 6 — dashboard de referidos para ReferralContext (sessionToken only). */
export const getReferralDashboard = query({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const empty = {
            username: "",
            referralAlias: "",
            referralCode: "",
            referralLink: "",
            stats: { totalInvited: 0, totalEarned: 0, level: 1 },
            referralSummary: { registrations: 0, purchases: 0, totalPoints: 0 },
            history: [] as Array<{
                id: string;
                name: string;
                status: string;
                earned: number;
                date: string;
                points?: number;
            }>,
            referrals: [] as Array<{
                id: string;
                name: string;
                status: string;
                earned: number;
                date: string;
                points?: number;
            }>,
        };

        const actor = await requireActor(ctx, args.sessionToken);
        const user = await ctx.db.get(actor.id);
        if (!user) return empty;

        const username = ((user as any).username as string | undefined) ?? "";
        const referralAlias = ((user as any).referralAlias as string | undefined) ?? "";
        const shareCode = preferredShareCode(username, referralAlias);

        const referred = await ctx.db
            .query("users")
            .withIndex("by_referred_by_user", (q) =>
                q.eq("referredByUserId", actor.id),
            )
            .collect();

        const ledger = await ctx.db
            .query("pointsLedger")
            .withIndex("by_user", (q) => q.eq("userId", actor.idString))
            .order("desc")
            .take(100);

        const referralEntries = ledger.filter((e) => e.source === "referral");
        const totalEarned = referralEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const registrations = referred.length;
        const purchases = referralEntries.filter(
            (e) =>
                (e.description ?? "").toLowerCase().includes("compra") ||
                !!(e.metadata as any)?.friendUserId,
        ).length;

        const history = referralEntries.map((e) => ({
            id: String(e._id),
            name: e.description ?? "Referido",
            status: e.type,
            earned: e.amount,
            date: e.createdAt,
            points: e.amount,
            user: e.description ?? "Referido",
            action: e.type,
        }));

        const level =
            registrations >= 20 ? 4 : registrations >= 10 ? 3 : registrations >= 5 ? 2 : 1;

        return {
            username,
            referralAlias,
            // referralCode = preferred share token for backward-compatible clients
            referralCode: shareCode,
            referralLink: shareCode ? `https://ramgos.app/ref/${shareCode}` : "",
            stats: { totalInvited: registrations, totalEarned, level },
            referralSummary: { registrations, purchases, totalPoints: totalEarned },
            history,
            referrals: history,
        };
    },
});

/** Returns the durable handle (@username). Alias is optional and edited separately. */
export const ensureReferralCode = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        assertSelfOrAdmin(actor, String(args.userId));

        const user = await ctx.db.get(args.userId as Id<"users">);
        if (!user) throw new Error("Usuario no encontrado.");
        const username = (user as any).username as string | undefined;
        if (!username) {
            throw new Error("Definí un @usuario antes de compartir tu código de referido.");
        }
        return preferredShareCode(username, (user as any).referralAlias);
    },
});

export const resolveReferralCode = query({
    args: { code: v.string() },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await resolveReferrerByInput(ctx, args.code);
        if (!user) return null;
        return String(user._id);
    },
});

// Internal version (no auth) for actions to look up codes server-side.
export const internalResolveReferralCode = internalMutation({
    args: { code: v.string() },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await resolveReferrerByInput(ctx, args.code);
        if (!user) return null;
        return String(user._id);
    },
});

export const redeemReferralCode = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        code: v.string(),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const user = await ctx.db.get(userId as any) as any;
        if (!user) throw new Error("Usuario no encontrado.");

        if (user.referredByUserId) {
            throw new Error("Ya has canjeado un código de referido antes.");
        }

        const referrer = await resolveReferrerByInput(ctx, args.code);
        if (!referrer) {
            throw new Error("Código no encontrado.");
        }

        if (String(referrer._id) === String(user._id)) {
            throw new Error("No puedes usar tu propio código.");
        }

        const ownHandle = (user.username || "").toLowerCase();
        const ownAlias = ((user.referralAlias as string) || "").toUpperCase();
        const inputNorm = normalizeReferralInput(args.code);
        if (
            inputNorm.toLowerCase() === ownHandle ||
            inputNorm.toUpperCase() === ownAlias
        ) {
            throw new Error("No puedes usar tu propio código.");
        }

        await ctx.db.patch(user._id, {
            referredByUserId: referrer._id,
        });

        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: user._id,
            eventKey: `ref_welcome_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: REFERRAL_WELCOME_BONUS,
            description: `Bono de bienvenida (${normalizeReferralInput(args.code).toUpperCase()})`,
            metadata: {
                referralCode: normalizeReferralInput(args.code).toUpperCase(),
                referrerUserId: String(referrer._id),
            },
        });

        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: referrer._id,
            eventKey: `ref_signup_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: REFERRAL_SIGNUP_BONUS,
            description: `Registro de referido (${user.name})`,
            metadata: {
                friendUserId: String(user._id),
                referralCode: normalizeReferralInput(args.code).toUpperCase(),
            },
        });

        return true;
    },
});

export const notifyReferralPurchase = mutation({
    args: {
        sessionToken: v.optional(v.string()),
        amountUSD: v.number(),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, (args as any).sessionToken);
        const userId = actor.idString;

        const user = await ctx.db.get(userId as any) as any;
        if (!user || !user.referredByUserId) return false;

        const referrer = await ctx.db.get(user.referredByUserId as any) as any;
        if (!referrer) return false;

        const baseReward = REFERRAL_FIRST_PURCHASE_BONUS;
        const highTicketReward =
            args.amountUSD >= REFERRAL_HIGH_TICKET_THRESHOLD_USD
                ? REFERRAL_HIGH_TICKET_BONUS
                : 0;

        await ctx.runMutation(internal.economy.applyPointsEventInternal, {
            userId: referrer._id,
            eventKey: `ref_purchase_${Date.now()}_${user._id}`,
            type: "earn",
            source: "referral",
            amount: baseReward,
            description: `Compra de referido (${user.name})`,
            metadata: { friendUserId: user._id, amountUSD: args.amountUSD },
        });

        if (highTicketReward > 0) {
            await ctx.runMutation(internal.economy.applyPointsEventInternal, {
                userId: referrer._id,
                eventKey: `ref_bonus_${Date.now()}_${user._id}`,
                type: "earn",
                source: "referral",
                amount: highTicketReward,
                description: `Bono compra High Ticket (${user.name})`,
                metadata: { friendUserId: user._id, amountUSD: args.amountUSD },
            });
        }

        return true;
    },
});

export const internalHandleReferralPurchase = internalMutation({
    args: {
        buyerUserId: v.string(),
        amountUSD: v.number(),
        paymentIntentId: v.string(),
    },
    handler: async (ctx, args) => {
        const buyerId = ctx.db.normalizeId("users", args.buyerUserId);
        if (!buyerId) return { success: false, reason: "buyer_not_found" as const };
        const buyer = await ctx.db.get(buyerId) as any;
        if (!buyer) return { success: false, reason: "buyer_not_found" as const };

        let referrerId = buyer.referredByUserId as Id<"users"> | undefined;
        if (!referrerId && typeof buyer.referredBy === "string") {
            const legacy = await resolveReferrerByInput(ctx, buyer.referredBy);
            if (legacy) {
                referrerId = legacy._id;
                await ctx.db.patch(buyerId, { referredByUserId: legacy._id });
            }
        }
        if (!referrerId) {
            return { success: false, reason: "no_referrer" as const };
        }

        const referrer = await ctx.db.get(referrerId) as any;
        if (!referrer) return { success: false, reason: "referrer_missing" as const };

        const firstPurchaseEventKey = `ref_purchase_first_${String(buyer._id)}`;
        const highTicketEventKey = `ref_purchase_high_ticket_${args.paymentIntentId}`;
        const paymentAmount = Math.max(0, Number(args.amountUSD) || 0);
        let pointsAwarded = 0;

        const firstPurchaseClaim = await ctx.db
            .query("rewardsClaims")
            .withIndex("by_user_claim", (q: any) =>
                q.eq("userId", String(referrer._id)).eq("claimKey", firstPurchaseEventKey),
            )
            .first();
        if (!firstPurchaseClaim) {
            await ctx.runMutation(internal.economy.applyPointsEventInternal, {
                userId: String(referrer._id),
                eventKey: firstPurchaseEventKey,
                type: "earn",
                source: "referral",
                amount: REFERRAL_FIRST_PURCHASE_BONUS,
                description: `Primera compra de referido (${buyer.name || "referido"})`,
                metadata: {
                    friendUserId: String(buyer._id),
                    amountUSD: paymentAmount,
                    paymentIntentId: args.paymentIntentId,
                },
            });
            await ctx.db.insert("rewardsClaims", {
                userId: String(referrer._id),
                claimKey: firstPurchaseEventKey,
                type: "ref_first_purchase",
                pointsAwarded: REFERRAL_FIRST_PURCHASE_BONUS,
                metadata: { friendUserId: String(buyer._id), paymentIntentId: args.paymentIntentId },
                claimedAt: new Date().toISOString(),
            });
            pointsAwarded += REFERRAL_FIRST_PURCHASE_BONUS;

            // Igual que el alta: antes esto se acreditaba en silencio y el
            // referidor nunca se enteraba salvo que abriera la pantalla de
            // Referidos.
            await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                userId: String(referrer._id),
                title: "¡Tu referido compró!",
                body: `Sumaste +${REFERRAL_FIRST_PURCHASE_BONUS} pts porque ${buyer.name || "tu referido"} hizo su primera compra.`,
                category: "payment",
                sendEmail: true,
                data: { friendUserId: String(buyer._id), paymentIntentId: args.paymentIntentId },
            });

            // BONO NUEVO USUARIO (Primera Compra)
            const buyerFirstPurchaseEventKey = `new_user_purchase_first_${String(buyer._id)}`;
            const buyerFirstPurchaseClaim = await ctx.db
                .query("rewardsClaims")
                .withIndex("by_user_claim", (q: any) =>
                    q.eq("userId", String(buyer._id)).eq("claimKey", buyerFirstPurchaseEventKey),
                )
                .first();

            if (!buyerFirstPurchaseClaim) {
                await ctx.runMutation(internal.economy.applyPointsEventInternal, {
                    userId: String(buyer._id),
                    eventKey: buyerFirstPurchaseEventKey,
                    type: "earn",
                    source: "bonus",
                    amount: REFERRAL_NEW_USER_FIRST_PURCHASE_BONUS,
                    description: "Bono de bienvenida por tu primera compra",
                    metadata: {
                        paymentIntentId: args.paymentIntentId,
                        amountUSD: paymentAmount,
                    },
                });
                await ctx.db.insert("rewardsClaims", {
                    userId: String(buyer._id),
                    claimKey: buyerFirstPurchaseEventKey,
                    type: "bonus",
                    pointsAwarded: REFERRAL_NEW_USER_FIRST_PURCHASE_BONUS,
                    metadata: { paymentIntentId: args.paymentIntentId },
                    claimedAt: new Date().toISOString(),
                });
            }
        }

        if (paymentAmount >= REFERRAL_HIGH_TICKET_THRESHOLD_USD) {
            const highTicketClaim = await ctx.db
                .query("rewardsClaims")
                .withIndex("by_user_claim", (q: any) =>
                    q.eq("userId", String(referrer._id)).eq("claimKey", highTicketEventKey),
                )
                .first();
            if (!highTicketClaim) {
                await ctx.runMutation(internal.economy.applyPointsEventInternal, {
                    userId: String(referrer._id),
                    eventKey: highTicketEventKey,
                    type: "earn",
                    source: "referral",
                    amount: REFERRAL_HIGH_TICKET_BONUS,
                    description: `Bono high-ticket de referido (${buyer.name || "referido"})`,
                    metadata: {
                        friendUserId: String(buyer._id),
                        amountUSD: paymentAmount,
                        paymentIntentId: args.paymentIntentId,
                    },
                });
                await ctx.db.insert("rewardsClaims", {
                    userId: String(referrer._id),
                    claimKey: highTicketEventKey,
                    type: "ref_high_ticket",
                    pointsAwarded: REFERRAL_HIGH_TICKET_BONUS,
                    metadata: { friendUserId: String(buyer._id), paymentIntentId: args.paymentIntentId },
                    claimedAt: new Date().toISOString(),
                });
                pointsAwarded += REFERRAL_HIGH_TICKET_BONUS;

                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    userId: String(referrer._id),
                    title: "¡Bono extra por tu referido!",
                    body: `Sumaste +${REFERRAL_HIGH_TICKET_BONUS} pts porque ${buyer.name || "tu referido"} hizo una compra grande.`,
                    category: "payment",
                    sendEmail: true,
                    data: { friendUserId: String(buyer._id), paymentIntentId: args.paymentIntentId },
                });
            }
        }

        return { success: pointsAwarded > 0, pointsAwarded };
    },
});

/**
 * One-shot migration: custom referralCode → referralAlias;
 * backfill referredByUserId from legacy referredBy username/code.
 */
export const migrateReferralDualCodes = mutation({
    args: { sessionToken: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const actor = await requireActor(ctx, args.sessionToken);
        if (!can(actor.role, 'view_admin_panel')) {
            throw new Error("Solo admin/developer puede migrar códigos de referido.");
        }

        const users = await ctx.db.query("users").collect();
        let patched = 0;
        let aliasesMoved = 0;
        let linksBackfilled = 0;

        for (const u of users) {
            const patch: Record<string, unknown> = {};
            const uname = ((u as any).username as string | undefined)?.toLowerCase() ?? "";
            const code = (u as any).referralCode as string | undefined;
            const existingAlias = (u as any).referralAlias as string | undefined;

            if (code && !existingAlias) {
                if (uname && code.toLowerCase() === uname) {
                    // Handle already covers invite — drop redundant invite code.
                    patch.referralCode = undefined;
                } else {
                    const alias = normalizeReferralAlias(code);
                    const formatErr = validateReferralAliasFormat(alias, uname);
                    if (!formatErr && alias) {
                        const taken = await ctx.db
                            .query("users")
                            .withIndex("by_referral_alias", (q) =>
                                q.eq("referralAlias", alias),
                            )
                            .first();
                        const usernameTaken = await ctx.db
                            .query("users")
                            .withIndex("by_username", (q) =>
                                q.eq("username", alias.toLowerCase()),
                            )
                            .first();
                        if (
                            (!taken || String(taken._id) === String(u._id)) &&
                            (!usernameTaken || String(usernameTaken._id) === String(u._id))
                        ) {
                            patch.referralAlias = alias;
                            patch.referralCode = undefined;
                            aliasesMoved += 1;
                        }
                    }
                }
            }

            if (!(u as any).referredByUserId && (u as any).referredBy) {
                const ref = await resolveReferrerByInput(ctx, (u as any).referredBy);
                if (ref && String(ref._id) !== String(u._id)) {
                    patch.referredByUserId = ref._id;
                    linksBackfilled += 1;
                }
            }

            if (Object.keys(patch).length > 0) {
                await ctx.db.patch(u._id, patch as any);
                patched += 1;
            }
        }

        return { patched, aliasesMoved, linksBackfilled, totalUsers: users.length };
    },
});

export const internalGetUserById = internalQuery({
    args: { id: v.string() },
    handler: async (ctx, args) => {
        const idVal = ctx.db.normalizeId("users", args.id);
        if (!idVal) return null;
        return await ctx.db.get(idVal);
    }
});

export const internalGetSessionByToken = internalQuery({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();
    }
});

export const internalGetUserByToken = internalQuery({
    args: { tokenIdentifier: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
            .first();
    }
});

export const internalGetUserByEmail = internalQuery({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
    }
});

export const internalPatchUserToken = internalMutation({
    args: { userId: v.id("users"), tokenIdentifier: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, { tokenIdentifier: args.tokenIdentifier });
    }
});

export const updateUserStripeCustomerId = internalMutation({
    args: {
        userId: v.string(),
        stripeCustomerId: v.string(),
        mode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    },
    handler: async (ctx, args) => {
        const idVal = ctx.db.normalizeId("users", args.userId);
        if (idVal) {
            const mode = args.mode ?? "test";
            await ctx.db.patch(idVal, {
                stripeCustomerId: args.stripeCustomerId,
                ...(mode === "live"
                    ? { stripeCustomerIdLive: args.stripeCustomerId }
                    : { stripeCustomerIdTest: args.stripeCustomerId }),
            } as any);
        }
    }
});

export const getUserActivityStats = query({
    args: {
        sessionToken: v.optional(v.string()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const empty = {
            purchases: 0,
            sales: 0,
            bonuses: 0,
            events: 0,
            savings: 0,
            pointsEarned: 0,
            pointsSpent: 0,
        };
        const actor = await getActorOrNull(ctx, (args as any).sessionToken);
        if (!actor) return empty;
        const targetUserId = (args as any).userId ?? actor.idString;
        if (targetUserId !== actor.idString && actor.role !== "admin") return empty;

        const [purchaseOrders, saleOrders, bonuses, reservations, ledger] =
            await Promise.all([
                ctx.db
                    .query("orders")
                    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
                    .collect(),
                ctx.db
                    .query("orders")
                    .withIndex("by_seller", (q) => q.eq("sellerId", targetUserId))
                    .collect(),
                ctx.db
                    .query("bonoRedemptions")
                    .withIndex("by_owner", (q) => q.eq("ownerUserId", targetUserId))
                    .collect(),
                ctx.db
                    .query("eventReservations")
                    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
                    .collect(),
                ctx.db
                    .query("pointsLedger")
                    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
                    .collect(),
            ]);

        const isCounted = (status?: string) =>
            !!status && !["cancelled", "refunded"].includes(status);
        const purchases = purchaseOrders.filter((o: any) => isCounted(o.status)).length;
        const sales = saleOrders.filter((o: any) => isCounted(o.status)).length;
        const bonusesCount = bonuses.filter((b: any) => isCounted(b.status)).length;
        const events = reservations.filter((r: any) => isCounted(r.status)).length;
        const savings = bonuses.reduce(
            (sum, b: any) =>
                sum + Math.max(0, Number(b.creditTotal ?? 0) - Number(b.paidAmount ?? 0)),
            0,
        );
        const pointsEarned = ledger
            .filter((e: any) => (e.amount ?? 0) > 0)
            .reduce((sum: number, e: any) => sum + e.amount, 0);
        const pointsSpent = Math.abs(
            ledger
                .filter((e: any) => (e.amount ?? 0) < 0)
                .reduce((sum: number, e: any) => sum + e.amount, 0),
        );

        return {
            purchases,
            sales,
            bonuses: bonusesCount,
            events,
            savings,
            pointsEarned,
            pointsSpent,
        };
    }
});

/**
 * Resuelve un @handle público (deep links, perfiles compartidos).
 *
 * Era un `.filter()` sin índice —escaneo de la tabla entera—, sensible a
 * mayúsculas y sin tolerar el `@`. Ahora entra por `by_username`.
 *
 * Va SIN sesión, así que sobre el perfil saneado se recortan además los
 * campos que sólo le importan al propio dueño: email, teléfono, saldo,
 * suscripción y de quién vino referido.
 */
export const getUserByHandle = query({
    args: { handle: v.string() },
    handler: async (ctx, args) => {
        const handle = normalizeHandle(args.handle);
        if (!handle) return null;
        const user = await ctx.db
            .query("users")
            .withIndex("by_username", (q) => q.eq("username", handle))
            .first();
        if (!user || (user as any).directoryHidden === true) return null;

        const safe = await sanitizeUser(ctx, user);
        const {
            email,
            phoneNumber,
            balance,
            isTest,
            subscriptionStatus,
            subscriptionTier,
            termsAcceptedVersion,
            referredByUserId,
            ...publicProfile
        } = safe as any;
        return publicProfile;
    }
});
