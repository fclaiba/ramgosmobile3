/**
 * Stripe Connect V2 — cuentas conectadas, onboarding, estado, balance y payouts.
 *
 * BI-MODAL: una cuenta conectada por modo. En Stripe, test y live son
 * universos separados (los `acct_` no se comparten), así que el usuario
 * guarda `stripeConnectAccountId` (live) y `stripeConnectAccountIdTest`.
 * Todas las acciones públicas reciben `mode` y usan `getStripe(mode)`.
 *
 * Forma de cuenta (V2, sin `type` de V1):
 *   - `dashboard: 'express'`  → el vendedor administra su banco/payouts en
 *     el dashboard Express.
 *   - `defaults.responsibilities`: fees_collector 'application' y
 *     losses_collector 'application' (Stripe lo exige para
 *     `configuration.recipient` con `stripe_balance.stripe_transfers`).
 *   - `configuration.recipient.capabilities.stripe_balance.stripe_transfers`
 *     → puede RECIBIR transfers de la plataforma (SCT). Es la ÚNICA
 *     capability solicitable acá: `payouts` existe en la RESPUESTA pero no
 *     en los params de create/update, y mandarla hace que Stripe rechace
 *     todo con "Unknown field" (E-137). El retiro al banco lo administra el
 *     vendedor desde su dashboard Express. Ver `_connectCaps.ts`.
 *
 * Onboarding: `v2.core.accountLinks.create` con `use_case.account_onboarding`.
 * El `return_url`/`refresh_url` DEBE ser https (Stripe rechaza los esquemas
 * custom tipo `ramgos://`; sólo tolera http con localhost en modo test). Se
 * resuelve en `_connectReturnUrl.ts`: el origen que propone el cliente si
 * pasa la allowlist, si no `STRIPE_CONNECT_RETURN_URL_BASE`, si no
 * `https://ramgos.app/connect`. La app igual se abre por deep link porque
 * `ramgos.app` está configurado como universal link / app link.
 *
 * Estado: se lee en vivo con `v2.core.accounts.retrieve(id, {include})` y
 * se persiste en `users.stripeConnectCaps[Test]` para que la UI sea reactiva
 * (`getMyConnectStatus`). Los thin events V2 (`http.ts`) llaman a
 * `internalApplyV2AccountUpdate` con el mismo camino.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { withStripeBreadcrumb } from "./observability";
import { requireActor } from "./authHelpers";
import { assertStripeConfigured, getStripe, hasStripeKey } from "./stripeClient";
import { stripeModeValidator } from "./schema";
import type { StripeMode } from "./_stripeEnv";
import { capsFromAccount, deriveCanPayout, type ConnectCaps } from "./_connectCaps";
import { resolveConnectReturnBase } from "./_connectReturnUrl";

export type ConnectStatus = {
    mode: StripeMode;
    accountId: string | null;
    status: "none" | "pending" | "active" | "rejected";
    caps: ConnectCaps | null;
    readyToReceivePayments: boolean;
    canPayout: boolean;
};

const fieldsFor = (mode: StripeMode) =>
    mode === "live"
        ? { idField: "stripeConnectAccountId", statusField: "stripeConnectStatus", capsField: "stripeConnectCaps" }
        : {
              idField: "stripeConnectAccountIdTest",
              statusField: "stripeConnectStatusTest",
              capsField: "stripeConnectCapsTest",
          };

const readStatus = (user: Doc<"users"> | null, mode: StripeMode): ConnectStatus => {
    const f = fieldsFor(mode);
    const accountId = ((user as any)?.[f.idField] as string | undefined) ?? null;
    const caps = ((user as any)?.[f.capsField] as ConnectCaps | undefined) ?? null;
    const status =
        ((user as any)?.[f.statusField] as "pending" | "active" | "rejected" | undefined) ??
        (accountId ? "pending" : "none");
    return {
        mode,
        accountId,
        status: accountId ? status : "none",
        caps,
        readyToReceivePayments: caps?.transfersStatus === "active",
        canPayout: deriveCanPayout(caps),
    };
};

const stripeErrorMessage = (error: any): string =>
    String(error?.raw?.message || error?.message || error || "Error de Stripe");

const retrieveAccount = (mode: StripeMode, accountId: string) =>
    (getStripe(mode) as any).v2.core.accounts.retrieve(accountId, {
        include: ["configuration.recipient", "requirements"],
    });

// ---------------------------------------------------------------------------
// Internos (DB)
// ---------------------------------------------------------------------------

export const internalGetConnectAccountId = internalQuery({
    args: { userId: v.id("users"), mode: stripeModeValidator },
    handler: async (ctx, args): Promise<string | null> => {
        const user = await ctx.db.get(args.userId);
        return readStatus(user, args.mode).accountId;
    },
});

export const internalGetConnectStatus = internalQuery({
    args: { userId: v.id("users"), mode: stripeModeValidator },
    handler: async (ctx, args): Promise<ConnectStatus> => readStatus(await ctx.db.get(args.userId), args.mode),
});

export const internalSaveConnectAccount = internalMutation({
    args: { userId: v.id("users"), mode: stripeModeValidator, accountId: v.string() },
    handler: async (ctx, args): Promise<void> => {
        const f = fieldsFor(args.mode);
        await ctx.db.patch(args.userId, { [f.idField]: args.accountId, [f.statusField]: "pending" } as any);
    },
});

/** Persiste capacidades leídas de Stripe (por índice, no por scan). */
export const internalSaveConnectFlags = internalMutation({
    args: {
        mode: stripeModeValidator,
        accountId: v.string(),
        transfersStatus: v.optional(v.string()),
        payoutsStatus: v.optional(v.string()),
        requirementsStatus: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ userId: string | null; status: string }> => {
        const user =
            args.mode === "live"
                ? await ctx.db
                      .query("users")
                      .withIndex("by_stripe_connect_account", (q) => q.eq("stripeConnectAccountId", args.accountId))
                      .first()
                : await ctx.db
                      .query("users")
                      .withIndex("by_stripe_connect_account_test", (q) =>
                          q.eq("stripeConnectAccountIdTest", args.accountId),
                      )
                      .first();
        if (!user) {
            console.warn(`[Connect ${args.mode}] Ningún usuario con cuenta ${args.accountId}`);
            return { userId: null, status: "unknown" };
        }
        const f = fieldsFor(args.mode);
        const onboardingComplete =
            args.requirementsStatus !== "currently_due" && args.requirementsStatus !== "past_due";
        const caps: ConnectCaps = {
            transfersStatus: args.transfersStatus,
            payoutsStatus: args.payoutsStatus,
            requirementsStatus: args.requirementsStatus,
            onboardingComplete,
            updatedAt: new Date().toISOString(),
        };
        const status: "pending" | "active" =
            args.transfersStatus === "active" && onboardingComplete ? "active" : "pending";
        const prev = (user as any)[f.statusField];
        await ctx.db.patch(user._id, { [f.capsField]: caps, [f.statusField]: status } as any);
        if (prev !== status) {
            await ctx.db.insert("audit_logs", {
                actorUserId: "system:stripe-webhook",
                targetUserId: String(user._id),
                action: status === "active" ? "STRIPE_CONNECT_PAYOUTS_ENABLED" : "STRIPE_CONNECT_PAYOUTS_DISABLED",
                timestamp: new Date().toISOString(),
                metadata: { accountId: args.accountId, mode: args.mode, caps },
            });
            if (status === "active") {
                await ctx.scheduler.runAfter(0, internal.notifications.notifyUser, {
                    userId: String(user._id),
                    title: "Cuenta de pagos lista",
                    body: "Tu cuenta de Stripe quedó habilitada para recibir pagos.",
                    category: "payment",
                    data: { type: "connect_active", mode: args.mode },
                });
            }
        }
        return { userId: String(user._id), status };
    },
});

// ---------------------------------------------------------------------------
// Resolución del usuario objetivo (self o admin)
// ---------------------------------------------------------------------------

const resolveTargetUser = async (
    ctx: any,
    sessionToken: string | undefined,
    userId?: string,
): Promise<{ actorId: string; actorIsAdmin: boolean; targetId: Id<"users">; user: Doc<"users"> }> => {
    const actor = await requireActor(ctx, sessionToken);
    const targetStr = userId ?? actor.idString;
    const isSelf = targetStr === actor.idString;
    const isAdmin = actor.role === "admin" || actor.role === "developer";
    if (!isSelf && !isAdmin) throw new Error("No autorizado.");
    const user = await ctx.runQuery(internal.users.internalGetUserById, { id: targetStr });
    if (!user) throw new Error("Usuario no encontrado.");
    return { actorId: actor.idString, actorIsAdmin: isAdmin, targetId: user._id as Id<"users">, user };
};

// ---------------------------------------------------------------------------
// Estado reactivo (fuente única del cliente)
// ---------------------------------------------------------------------------

export const getMyConnectStatus = query({
    args: { sessionToken: v.optional(v.string()), mode: stripeModeValidator, userId: v.optional(v.string()) },
    handler: async (ctx, args): Promise<ConnectStatus & { modeConfigured: boolean }> => {
        const actor = await requireActor(ctx, args.sessionToken);
        const targetStr = args.userId ?? actor.idString;
        if (targetStr !== actor.idString && actor.role !== "admin" && actor.role !== "developer") {
            throw new Error("No autorizado.");
        }
        const id = ctx.db.normalizeId("users", targetStr);
        const user = id ? await ctx.db.get(id) : null;
        return { ...readStatus(user, args.mode), modeConfigured: hasStripeKey(args.mode) };
    },
});

// ---------------------------------------------------------------------------
// Crear / asegurar cuenta
// ---------------------------------------------------------------------------

export const ensureConnectAccount = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        displayName: v.optional(v.string()),
        contactEmail: v.optional(v.string()),
        country: v.optional(v.string()), // ISO-3166 alpha-2; default 'us'
    },
    handler: async (ctx, args): Promise<{ accountId: string; created: boolean }> => {
        assertStripeConfigured(args.mode);
        const { targetId, user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const existing = readStatus(user, args.mode).accountId;
        if (existing) return { accountId: existing, created: false };

        const displayName = args.displayName || (user as any).name || (user as any).username || "Ramgos seller";
        const contactEmail = args.contactEmail || (user as any).email;
        if (!contactEmail) throw new Error("El usuario no tiene email; es obligatorio para Stripe Connect.");
        const stripe = getStripe(args.mode) as any;

        try {
            const account: any = await withStripeBreadcrumb(
                { api: "v2.core.accounts.create", userId: String(targetId), mode: args.mode },
                () =>
                    stripe.v2.core.accounts.create({
                        display_name: displayName,
                        contact_email: contactEmail,
                        identity: { country: (args.country ?? "us").toLowerCase() },
                        dashboard: "express",
                        defaults: {
                            responsibilities: {
                                fees_collector: "application",
                                // Stripe exige "application" para recipient + stripe_transfers.
                                losses_collector: "application",
                            },
                        },
                        configuration: {
                            recipient: {
                                capabilities: {
                                    stripe_balance: {
                                        // Única capability solicitable acá (ver cabecera + _connectCaps.ts).
                                        stripe_transfers: { requested: true },
                                    },
                                },
                            },
                        },
                        metadata: { userId: String(targetId), mode: args.mode },
                    }),
            );
            await ctx.runMutation(internal.connect.internalSaveConnectAccount, {
                userId: targetId,
                mode: args.mode,
                accountId: account.id,
            });
            return { accountId: account.id, created: true };
        } catch (error: any) {
            console.error(`[Connect ${args.mode}] accounts.create error:`, error);
            throw new Error(`No se pudo crear la cuenta de Stripe Connect: ${stripeErrorMessage(error)}`);
        }
    },
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const createOnboardingLink = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        /**
         * Origen al que volver (web manda `window.location.origin`). Se valida
         * contra una allowlist en `_connectReturnUrl.ts`: viaja a un tercero,
         * un origen arbitrario sería un redirect abierto.
         */
        returnOrigin: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ url: string; expiresAt: string | null; returnUrl: string }> => {
        assertStripeConfigured(args.mode);
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) throw new Error("Primero hay que crear la cuenta de pagos (ensureConnectAccount).");
        const base = resolveConnectReturnBase({
            mode: args.mode,
            requestedOrigin: args.returnOrigin,
            envBase: process.env.STRIPE_CONNECT_RETURN_URL_BASE,
        });
        const returnUrl = `${base}/return?mode=${args.mode}`;
        const refreshUrl = `${base}/refresh?mode=${args.mode}`;
        try {
            const link = await (getStripe(args.mode) as any).v2.core.accountLinks.create({
                account: accountId,
                use_case: {
                    type: "account_onboarding",
                    account_onboarding: {
                        configurations: ["recipient"],
                        refresh_url: refreshUrl,
                        return_url: returnUrl,
                    },
                },
            });
            return { url: link.url, expiresAt: link.expires_at ?? null, returnUrl };
        } catch (error: any) {
            console.error(`[Connect ${args.mode}] accountLinks.create error:`, error);
            throw new Error(`No se pudo generar el link de onboarding: ${stripeErrorMessage(error)}`);
        }
    },
});

/** Lectura en vivo desde Stripe + persistencia (la UI reactiva se actualiza sola). */
export const getAccountStatus = action({
    args: { sessionToken: v.optional(v.string()), mode: stripeModeValidator, userId: v.optional(v.string()) },
    handler: async (ctx, args): Promise<ConnectStatus> => {
        assertStripeConfigured(args.mode);
        const { targetId, user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const current = readStatus(user, args.mode);
        if (!current.accountId) return current;
        try {
            const account = await retrieveAccount(args.mode, current.accountId);
            const caps = capsFromAccount(account);
            await ctx.runMutation(internal.connect.internalSaveConnectFlags, {
                mode: args.mode,
                accountId: current.accountId,
                transfersStatus: caps.transfersStatus,
                payoutsStatus: caps.payoutsStatus,
                requirementsStatus: caps.requirementsStatus,
            });
            return await ctx.runQuery(internal.connect.internalGetConnectStatus, {
                userId: targetId,
                mode: args.mode,
            });
        } catch (error: any) {
            console.error(`[Connect ${args.mode}] accounts.retrieve error:`, error);
            throw new Error(`No se pudo leer el estado de la cuenta: ${stripeErrorMessage(error)}`);
        }
    },
});

/** Webhook V2: vuelve a leer la cuenta y persiste. Los errores propagan (→ 500 → reintento). */
export const internalApplyV2AccountUpdate = internalAction({
    args: { mode: stripeModeValidator, accountId: v.string() },
    handler: async (ctx, args): Promise<void> => {
        const account = await retrieveAccount(args.mode, args.accountId);
        const caps = capsFromAccount(account);
        await ctx.runMutation(internal.connect.internalSaveConnectFlags, {
            mode: args.mode,
            accountId: args.accountId,
            transfersStatus: caps.transfersStatus,
            payoutsStatus: caps.payoutsStatus,
            requirementsStatus: caps.requirementsStatus,
        });
    },
});

// ---------------------------------------------------------------------------
// Balance y payouts de la cuenta conectada
// ---------------------------------------------------------------------------

export const getConnectBalance = action({
    args: { sessionToken: v.optional(v.string()), mode: stripeModeValidator, userId: v.optional(v.string()) },
    handler: async (
        ctx,
        args,
    ): Promise<{
        accountId: string | null;
        availableCents: number;
        pendingCents: number;
        instantAvailableCents: number;
        currency: string;
    }> => {
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) {
            return { accountId: null, availableCents: 0, pendingCents: 0, instantAvailableCents: 0, currency: "usd" };
        }
        assertStripeConfigured(args.mode);
        try {
            const balance: any = await withStripeBreadcrumb(
                { api: "balance.retrieve", accountId, mode: args.mode },
                () => getStripe(args.mode).balance.retrieve(undefined, { stripeAccount: accountId }),
            );
            const pick = (arr?: Array<{ amount: number; currency: string }>) => {
                if (!arr || arr.length === 0) return { amount: 0, currency: "usd" };
                const usd = arr.find((b) => b.currency === "usd") ?? arr[0];
                return { amount: usd.amount, currency: usd.currency };
            };
            const available = pick(balance.available);
            return {
                accountId,
                availableCents: available.amount,
                pendingCents: pick(balance.pending).amount,
                instantAvailableCents: pick(balance.instant_available).amount,
                currency: available.currency,
            };
        } catch (error: any) {
            throw new Error(`No se pudo leer el balance de Stripe Connect: ${stripeErrorMessage(error)}`);
        }
    },
});

const payoutIntervalValidator = v.union(
    v.literal("manual"),
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
);

export const getPayoutSchedule = action({
    args: { sessionToken: v.optional(v.string()), mode: stripeModeValidator, userId: v.optional(v.string()) },
    handler: async (
        ctx,
        args,
    ): Promise<{
        interval: "manual" | "daily" | "weekly" | "monthly" | null;
        delayDays: number | null;
        unsupported: boolean;
    }> => {
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) return { interval: null, delayDays: null, unsupported: false };
        assertStripeConfigured(args.mode);
        try {
            const acct: any = await getStripe(args.mode).accounts.retrieve(accountId);
            const schedule = acct?.settings?.payouts?.schedule;
            return {
                interval: (schedule?.interval as any) ?? null,
                delayDays: typeof schedule?.delay_days === "number" ? schedule.delay_days : null,
                unsupported: false,
            };
        } catch {
            // Las cuentas V2 pueden no exponer settings por la API V1: la UI
            // deriva al dashboard Express.
            return { interval: null, delayDays: null, unsupported: true };
        }
    },
});

export const updatePayoutSchedule = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        interval: payoutIntervalValidator,
        delayDays: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<{ updated: boolean; unsupported: boolean; message?: string }> => {
        assertStripeConfigured(args.mode);
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) throw new Error("No tenés una cuenta de Stripe Connect. Completá el onboarding primero.");
        try {
            await withStripeBreadcrumb(
                { api: "accounts.update", accountId, mode: args.mode, interval: args.interval },
                () =>
                    getStripe(args.mode).accounts.update(accountId, {
                        settings: {
                            payouts: {
                                schedule: {
                                    interval: args.interval,
                                    ...(args.delayDays !== undefined ? { delay_days: args.delayDays } : {}),
                                },
                            },
                        },
                    }),
            );
            return { updated: true, unsupported: false };
        } catch (error: any) {
            const message = stripeErrorMessage(error);
            console.error(`[Connect ${args.mode}] accounts.update error:`, error);
            // Fallback documentado: la cuenta V2 no acepta el update V1 → dashboard Express.
            return { updated: false, unsupported: true, message };
        }
    },
});

export const requestInstantPayout = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        amountInCents: v.number(),
        currency: v.optional(v.string()),
        /** Id único por intento (uuid del cliente) → idempotencia en Stripe. */
        requestId: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        payoutId: string;
        amountInCents: number;
        currency: string;
        status: string;
        method: "instant" | "standard";
        arrivalDate: number | null;
    }> => {
        assertStripeConfigured(args.mode);
        const { actorId, targetId, user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        if (args.amountInCents < 100) throw new Error("Monto inválido. Mínimo USD $1.");
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) throw new Error("No tenés una cuenta de Stripe Connect. Completá el onboarding primero.");
        const stripe = getStripe(args.mode);
        const currency = (args.currency ?? "usd").toLowerCase();
        try {
            const balance: any = await stripe.balance.retrieve(undefined, { stripeAccount: accountId });
            const instant =
                (balance.instant_available ?? []).find((b: any) => b.currency === currency)?.amount ?? 0;
            const method: "instant" | "standard" = instant >= args.amountInCents ? "instant" : "standard";
            const payout = await withStripeBreadcrumb(
                { api: "payouts.create", accountId, mode: args.mode, amountInCents: args.amountInCents, method },
                () =>
                    stripe.payouts.create(
                        {
                            amount: args.amountInCents,
                            currency,
                            method,
                            metadata: { triggeredBy: actorId, userId: String(targetId), source: "ramgos-app" },
                        },
                        {
                            stripeAccount: accountId,
                            ...(args.requestId ? { idempotencyKey: `payout:${targetId}:${args.requestId}` } : {}),
                        },
                    ),
            );
            return {
                payoutId: payout.id,
                amountInCents: payout.amount,
                currency: payout.currency,
                status: payout.status,
                method,
                arrivalDate: payout.arrival_date ?? null,
            };
        } catch (error: any) {
            console.error(`[Connect ${args.mode}] payouts.create error:`, error);
            throw new Error(`No se pudo solicitar el payout: ${stripeErrorMessage(error)}`);
        }
    },
});

// ---------------------------------------------------------------------------
// Historial de retiros
// ---------------------------------------------------------------------------

/**
 * Degrada igual que `getPayoutSchedule`: si la API V1 no atiende a esta cuenta
 * V2 devuelve `unsupported` en vez de tirar. El historial nunca debe tumbar la
 * pantalla de saldo.
 */
export const listRecentPayouts = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{
        accountId: string | null;
        unsupported: boolean;
        payouts: Array<{
            id: string;
            amountCents: number;
            currency: string;
            status: string;
            method: string;
            createdAt: number;
            arrivalDate: number | null;
            failureMessage: string | null;
        }>;
    }> => {
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) return { accountId: null, unsupported: false, payouts: [] };
        assertStripeConfigured(args.mode);
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
        try {
            const list: any = await withStripeBreadcrumb(
                { api: "payouts.list", accountId, mode: args.mode, limit },
                () => getStripe(args.mode).payouts.list({ limit }, { stripeAccount: accountId }),
            );
            return {
                accountId,
                unsupported: false,
                payouts: (list?.data ?? []).map((p: any) => ({
                    id: String(p.id),
                    amountCents: p.amount ?? 0,
                    currency: p.currency ?? "usd",
                    status: p.status ?? "unknown",
                    method: p.method ?? "standard",
                    createdAt: p.created ?? 0,
                    arrivalDate: p.arrival_date ?? null,
                    failureMessage: p.failure_message ?? null,
                })),
            };
        } catch (error: any) {
            console.warn(`[Connect ${args.mode}] payouts.list error:`, stripeErrorMessage(error));
            return { accountId, unsupported: true, payouts: [] };
        }
    },
});

// ---------------------------------------------------------------------------
// Administración de la cuenta: desvincular / cambiar / dashboard Express
// ---------------------------------------------------------------------------

/**
 * Borra el puntero a la cuenta conectada de este modo. NO borra nada en
 * Stripe: las cuentas V2 no se eliminan, así que la cuenta sigue existiendo
 * con su KYC y su historial; sólo dejamos de usarla para cobrar.
 *
 * Efecto secundario a tener presente: desde acá los webhooks de ese `acct_`
 * pasan a ser no-ops silenciosos, porque `internalSaveConnectFlags` busca al
 * usuario por índice y ya no lo va a encontrar. Es el mismo modo de falla que
 * dejó E-147, pero acá es intencional; el `audit_log` es la única traza.
 */
export const internalClearConnectAccount = internalMutation({
    args: {
        userId: v.id("users"),
        mode: stripeModeValidator,
        accountId: v.string(),
        actorUserId: v.string(),
    },
    handler: async (ctx, args): Promise<void> => {
        const f = fieldsFor(args.mode);
        await ctx.db.patch(args.userId, {
            [f.idField]: undefined,
            [f.statusField]: undefined,
            [f.capsField]: undefined,
        } as any);
        await ctx.db.insert("audit_logs", {
            actorUserId: args.actorUserId,
            targetUserId: String(args.userId),
            action: "STRIPE_CONNECT_UNLINKED",
            timestamp: new Date().toISOString(),
            metadata: { accountId: args.accountId, mode: args.mode },
        });
    },
});

export const unlinkConnectAccount = action({
    args: {
        sessionToken: v.optional(v.string()),
        mode: stripeModeValidator,
        userId: v.optional(v.string()),
        /** Sólo admin/developer: desvincula aunque quede saldo en la cuenta. */
        force: v.optional(v.boolean()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ unlinked: boolean; previousAccountId: string | null; reason?: string }> => {
        const { actorId, actorIsAdmin, targetId, user } = await resolveTargetUser(
            ctx,
            args.sessionToken,
            args.userId,
        );
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) return { unlinked: false, previousAccountId: null, reason: "no-account" };

        // Guarda de plata: si Stripe todavía le debe algo a esa cuenta y
        // soltamos el puntero, el usuario pierde el camino para retirarlo.
        const skipGuard = args.force === true && actorIsAdmin;
        if (!skipGuard) {
            assertStripeConfigured(args.mode);
            let heldCents = 0;
            try {
                const balance: any = await withStripeBreadcrumb(
                    { api: "balance.retrieve", accountId, mode: args.mode },
                    () => getStripe(args.mode).balance.retrieve(undefined, { stripeAccount: accountId }),
                );
                const sum = (arr?: Array<{ amount: number }>) =>
                    (arr ?? []).reduce((acc, b) => acc + (b?.amount ?? 0), 0);
                heldCents = sum(balance?.available) + sum(balance?.pending);
            } catch (error: any) {
                throw new Error(
                    `No pudimos verificar el saldo antes de desvincular: ${stripeErrorMessage(error)}`,
                );
            }
            if (heldCents > 0) {
                throw new Error(
                    `Todavía hay USD $${(heldCents / 100).toFixed(2)} en esa cuenta. Retiralo antes de desvincularla.`,
                );
            }
        }

        await ctx.runMutation(internal.connect.internalClearConnectAccount, {
            userId: targetId,
            mode: args.mode,
            accountId,
            actorUserId: actorId,
        });
        return { unlinked: true, previousAccountId: accountId };
    },
});

/**
 * Link al dashboard Express, donde el vendedor administra su banco y su
 * calendario de payouts (cosas que la plataforma no puede tocar en V2).
 * Degrada a `unsupported` porque no está garantizado que el login link V1
 * acepte cuentas creadas con `v2.core.accounts.create`.
 */
export const createExpressLoginLink = action({
    args: { sessionToken: v.optional(v.string()), mode: stripeModeValidator, userId: v.optional(v.string()) },
    handler: async (ctx, args): Promise<{ url: string | null; unsupported: boolean }> => {
        const { user } = await resolveTargetUser(ctx, args.sessionToken, args.userId);
        const accountId = readStatus(user, args.mode).accountId;
        if (!accountId) return { url: null, unsupported: false };
        assertStripeConfigured(args.mode);
        try {
            const link: any = await withStripeBreadcrumb(
                { api: "accounts.createLoginLink", accountId, mode: args.mode },
                () => (getStripe(args.mode) as any).accounts.createLoginLink(accountId),
            );
            return { url: link?.url ?? null, unsupported: !link?.url };
        } catch (error: any) {
            console.warn(`[Connect ${args.mode}] accounts.createLoginLink error:`, stripeErrorMessage(error));
            return { url: null, unsupported: true };
        }
    },
});
