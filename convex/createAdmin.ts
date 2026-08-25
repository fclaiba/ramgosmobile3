/**
 * Alta de la cuenta administrativa inicial.
 *
 * QUÉ TENÍA ANTES ESTE ARCHIVO
 *
 * La contraseña del titular escrita como literal en el código:
 *
 *     const hashedPassword = hashPassword("<contraseña en claro>");
 *
 * Con dos problemas encima del obvio:
 *
 *   1. La rama de CREACIÓN insertaba `password: "<contraseña en claro>"` — sin
 *      hashear. La cuenta del dueño quedaba con la contraseña en texto plano en
 *      la base, mientras la rama de actualización sí la hasheaba.
 *   2. Al estar versionado, el secreto quedó en el historial de git. Borrarlo
 *      del árbol de trabajo NO lo saca del historial: **la contraseña tiene que
 *      rotarse**, que es la única acción que realmente lo invalida.
 *
 * CÓMO FUNCIONA AHORA
 *
 * La credencial se lee del entorno de Convex, igual que el resto de los
 * secretos del backend (ver `.env.example`: "BACKEND / CONVEX SECRETS —
 * Configure with `npx convex env set`"):
 *
 *     npx convex env set ADMIN_BOOTSTRAP_EMAIL    tu@email.com
 *     npx convex env set ADMIN_BOOTSTRAP_PASSWORD '<contraseña nueva>'
 *     npx convex run createAdmin:run
 *
 * Es `internalMutation`, así que no es invocable desde el cliente: sólo desde
 * la CLI o desde otra función del servidor.
 */
import { internalMutation } from "./_generated/server";
import { hashPassword } from "./passwordHelpers";
import { newUserIdentityFields } from "./users/identity";

export const run = internalMutation({
    args: {},
    handler: async (ctx) => {
        const rawEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
        const rawPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

        if (!rawEmail || !rawPassword) {
            throw new Error(
                "Faltan ADMIN_BOOTSTRAP_EMAIL y/o ADMIN_BOOTSTRAP_PASSWORD en el entorno de Convex. " +
                    "Configuralas con `npx convex env set` antes de correr esto.",
            );
        }

        // Un mínimo de longitud evita dejar la cuenta con más privilegios que
        // defensa. No pretende ser una política de contraseñas completa.
        if (rawPassword.length < 12) {
            throw new Error("La contraseña de bootstrap debe tener al menos 12 caracteres.");
        }

        const email = rawEmail.trim().toLowerCase();
        // SIEMPRE hasheada, en los dos caminos. Antes la rama de creación la
        // persistía en claro.
        const hashedPassword = hashPassword(rawPassword);

        const existing = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                role: "admin",
                kycStatus: "approved",
                password: hashedPassword,
            });
            return `Usuario ${email} actualizado a admin.`;
        }

        const now = new Date().toISOString();

        await ctx.db.insert("users", {
            uid: "admin_" + Date.now(),
            name: "Ramgos Admin",
            email,
            password: hashedPassword,
            role: "admin",
            ...newUserIdentityFields({ username: "ramgosadmin", name: "Ramgos Admin" }),
            kycStatus: "approved",
            joinedAt: now,
            tier: "Gold",
            balance: 0,
            isTest: false,
            emailVerified: true,
        });

        return `Usuario ${email} creado como admin exitosamente.`;
    },
});
