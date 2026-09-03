/**
 * Migración de un solo uso: reubicar cuentas Connect guardadas en el modo
 * equivocado.
 *
 * POR QUÉ EXISTE
 *
 * Antes del rewrite bi-modal, `users.stripeConnectAccountId` era EL campo de
 * la cuenta Connect, sin concepto de modo. El rewrite lo redefinió como
 * "específicamente la cuenta LIVE" y agregó `stripeConnectAccountIdTest`,
 * pero **nadie migró los datos existentes**: como hasta entonces sólo se había
 * operado en test, esas cuentas de prueba quedaron etiquetadas como de
 * producción.
 *
 * El daño es concreto y silencioso: al liberar un escrow en live,
 * `connectAccountFor(seller, "live")` devuelve una cuenta de test, y
 * `transfers.create` con la clave live falla con "Permission denied". El cobro
 * ya entró, la orden queda en `held` con error, y la plata del vendedor se
 * traba hasta que rehaga el onboarding.
 *
 * El id de una cuenta NO dice a qué modo pertenece, así que hay que
 * preguntárselo a Stripe: por eso es una `internalAction` y no una mutation.
 *
 * Uso:
 *   npx convex run migrations/connectAccountModeFix:fixMislabeledAccounts '{"dryRun":true}'
 *   npx convex run migrations/connectAccountModeFix:fixMislabeledAccounts
 *
 * Idempotente: correrla de nuevo con todo ya ordenado no hace ningún cambio.
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getStripe, hasStripeKey } from "../stripeClient";
import type { Id } from "../_generated/dataModel";

type Candidato = { userId: Id<"users">; accountId: string; tieneTest: boolean };

export const listAccountsInLiveField = internalQuery({
    args: {},
    handler: async (ctx): Promise<Candidato[]> => {
        const users = await ctx.db.query("users").take(5000);
        return users
            .filter((u) => !!(u as any).stripeConnectAccountId)
            .map((u) => ({
                userId: u._id,
                accountId: String((u as any).stripeConnectAccountId),
                tieneTest: !!(u as any).stripeConnectAccountIdTest,
            }));
    },
});

export const moveAccountToTestField = internalMutation({
    args: { userId: v.id("users"), accountId: v.string(), clearOnly: v.optional(v.boolean()) },
    handler: async (ctx, args): Promise<void> => {
        const user = await ctx.db.get(args.userId);
        if (!user) return;
        // El campo live se limpia siempre; el test sólo se completa si estaba
        // vacío, para no pisar un onboarding de test posterior y legítimo.
        const yaTieneTest = !!(user as any).stripeConnectAccountIdTest;
        await ctx.db.patch(args.userId, {
            stripeConnectAccountId: undefined,
            stripeConnectStatus: undefined,
            stripeConnectCaps: undefined,
            ...(args.clearOnly || yaTieneTest
                ? {}
                : {
                      stripeConnectAccountIdTest: args.accountId,
                      stripeConnectStatusTest: (user as any).stripeConnectStatus ?? "pending",
                      stripeConnectCapsTest: (user as any).stripeConnectCaps,
                  }),
        } as any);
    },
});

/** ¿La cuenta existe en este modo? Un error de permisos significa "no es de acá". */
async function existeEnModo(mode: "test" | "live", accountId: string): Promise<boolean> {
    if (!hasStripeKey(mode)) return false;
    try {
        await (getStripe(mode) as any).v2.core.accounts.retrieve(accountId);
        return true;
    } catch {
        return false;
    }
}

export const fixMislabeledAccounts = internalAction({
    args: { dryRun: v.optional(v.boolean()) },
    handler: async (
        ctx,
        args,
    ): Promise<{
        revisados: number;
        correctas: number;
        movidasATest: number;
        huerfanas: number;
        detalle: Array<{ userId: string; accountId: string; veredicto: string }>;
    }> => {
        const candidatos: Candidato[] = await ctx.runQuery(
            internal.migrations.connectAccountModeFix.listAccountsInLiveField,
            {},
        );

        let correctas = 0;
        let movidasATest = 0;
        let huerfanas = 0;
        const detalle: Array<{ userId: string; accountId: string; veredicto: string }> = [];

        for (const c of candidatos) {
            if (await existeEnModo("live", c.accountId)) {
                correctas++;
                detalle.push({ userId: String(c.userId), accountId: c.accountId, veredicto: "ok: es live" });
                continue;
            }

            const esTest = await existeEnModo("test", c.accountId);
            if (esTest) {
                movidasATest++;
                detalle.push({
                    userId: String(c.userId),
                    accountId: c.accountId,
                    veredicto: c.tieneTest
                        ? "era de test; el usuario YA tenía cuenta de test → sólo se limpia el campo live"
                        : "era de test → movida al campo de test",
                });
                if (!args.dryRun) {
                    await ctx.runMutation(internal.migrations.connectAccountModeFix.moveAccountToTestField, {
                        userId: c.userId,
                        accountId: c.accountId,
                    });
                }
            } else {
                // No existe en ninguno de los dos modos: quedó de una cuenta de
                // Stripe distinta o de una clave rotada. Se limpia para que el
                // vendedor pueda rehacer el onboarding en vez de arrastrar un id
                // que hace fallar cada liberación.
                huerfanas++;
                detalle.push({
                    userId: String(c.userId),
                    accountId: c.accountId,
                    veredicto: "huérfana: no existe en test ni en live → campo limpiado, hay que rehacer onboarding",
                });
                if (!args.dryRun) {
                    await ctx.runMutation(internal.migrations.connectAccountModeFix.moveAccountToTestField, {
                        userId: c.userId,
                        accountId: c.accountId,
                        clearOnly: true,
                    });
                }
            }
        }

        return { revisados: candidatos.length, correctas, movidasATest, huerfanas, detalle };
    },
});
