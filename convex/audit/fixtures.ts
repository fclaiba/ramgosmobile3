/**
 * Fixtures para los tests de concurrencia (`tests/audit/`).
 *
 * Sólo funciones `internal*`: se corren con `npx convex run audit/fixtures:seed`
 * desde el CLI o desde CI, nunca desde un cliente. Y sólo en el deployment de
 * audit: la guarda por `AUDIT_FIXTURES=true` es la segunda cerradura — la
 * primera es que la variable NO existe en producción.
 *
 * Todo lo que crea lleva el marcador `audit-fixture` (email, tag, título) para
 * que `reset` lo pueda borrar sin tocar nada más.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { createSession } from "../authHelpers";
import { newUserIdentityFields } from "../users/identity";

const MARK = "audit-fixture";

function assertAuditDeployment() {
    if (process.env.AUDIT_FIXTURES !== "true") {
        throw new Error(
            "audit/fixtures sólo corre en el deployment de audit (AUDIT_FIXTURES=true). " +
                "Si estás viendo esto en producción, NO la setees: usá el proyecto ramgos-audit.",
        );
    }
}

const nowIso = () => new Date().toISOString();

async function seedUser(ctx: any, role: "business" | "consumer", tag: string, suffix: string) {
    const username = `${MARK}-${tag}-${suffix}`.replace(/[^a-z0-9-]/g, "");
    const name = `Audit ${tag}`;
    const id = await ctx.db.insert("users", {
        uid: `audit_${tag}_${suffix}`,
        name,
        email: `${username}@ramgos.test`,
        role,
        ...newUserIdentityFields({ username, name }),
        referralCode: username.toUpperCase().slice(0, 24),
        kycStatus: "approved",
        joinedAt: nowIso(),
        tier: "Bronze",
        subscriptionStatus: "inactive",
        // `canUseTestMode` (_paymentModeAccess.ts:32) exige isTest o rol admin.
        isTest: true,
    });
    const sessionToken = await createSession(ctx, id);
    return { id: String(id), sessionToken };
}

function listingBase(sellerId: string, type: "product" | "event" | "bono", title: string, suffix: string) {
    const now = nowIso();
    return {
        title,
        description: `${MARK} ${type}`,
        price: type === "bono" ? 50 : 10,
        currency: "USD" as const,
        type,
        category: MARK,
        tags: [MARK, type],
        sellerId,
        status: "active" as const,
        slug: `${MARK}-${type}-${suffix}`,
        condition: "new" as const,
        createdAt: now,
        updatedAt: now,
    };
}

async function putInCart(ctx: any, userId: string, listingId: string, title: string, sellerId: string, type: "product" | "event") {
    return String(
        await ctx.db.insert("cart", {
            userId,
            listingId,
            quantity: 1,
            addedAt: nowIso(),
            snapshot: { title, price: 10, sellerId, type, condition: "new" },
        }),
    );
}

/**
 * Crea el escenario mínimo para los 4 tests y devuelve ids + tokens.
 *
 *   - buyerProduct con un producto de stock 1 en el carrito → STK-03
 *   - buyerEvent con un evento de capacidad 1 en el carrito  → AGD-02 (vía checkout)
 *   - bono `issued` del negocio, a nombre de buyerProduct     → BON-01
 *
 * `createPaymentIntent` arma las líneas desde la tabla `cart` del usuario, no
 * desde `args.lineItems` (stripe.ts:199-200): por eso cada escenario necesita
 * su propio comprador con su propio carrito.
 */
export const seed = internalMutation({
    args: { productStock: v.optional(v.number()), eventCapacity: v.optional(v.number()) },
    handler: async (ctx, args) => {
        assertAuditDeployment();
        const suffix = Date.now().toString(36);
        const business = await seedUser(ctx, "business", "business", suffix);
        const buyerProduct = await seedUser(ctx, "consumer", "buyer-product", suffix);
        const buyerEvent = await seedUser(ctx, "consumer", "buyer-event", suffix);

        const productStock = args.productStock ?? 1;
        const eventCapacity = args.eventCapacity ?? 1;

        const productId = String(
            await ctx.db.insert("listings", {
                ...listingBase(business.id, "product", `${MARK} producto`, suffix),
                stock: productStock,
            }),
        );
        const eventId = String(
            await ctx.db.insert("listings", {
                ...listingBase(business.id, "event", `${MARK} evento`, suffix),
                // Hoy el único freno del checkout es `stock` (stripe.ts:233);
                // `eventCapacity` es lo que debería frenar. Se siembran iguales
                // para que el test mida el aforo y no el default del cliente.
                stock: eventCapacity,
                eventCapacity,
                eventSoldCount: 0,
                eventDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
                eventTime: "20:00",
            }),
        );
        const bonoListingId = String(
            await ctx.db.insert("listings", {
                ...listingBase(business.id, "bono", `${MARK} bono`, suffix),
                stock: 9999,
                discountValue: 100,
                validityDays: 30,
            }),
        );

        const bonoCode = `AUD-${suffix}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
        const bonoId = String(
            await ctx.db.insert("bonoRedemptions", {
                bonoCode,
                listingId: bonoListingId,
                ownerUserId: buyerProduct.id,
                sellerId: business.id,
                validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
                paidAmount: 50,
                creditTotal: 100,
                creditRemaining: 100,
                usesTotal: 1,
                usesRemaining: 1,
                status: "issued",
                createdAt: nowIso(),
            }),
        );

        await putInCart(ctx, buyerProduct.id, productId, `${MARK} producto`, business.id, "product");
        await putInCart(ctx, buyerEvent.id, eventId, `${MARK} evento`, business.id, "event");

        return { suffix, business, buyerProduct, buyerEvent, productId, eventId, bonoListingId, bonoId, bonoCode };
    },
});

/** Estado actual de los documentos que los tests afirman. */
export const inspect = internalQuery({
    args: { productId: v.optional(v.string()), eventId: v.optional(v.string()), bonoId: v.optional(v.string()), stripeEventId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const get = async (id?: string) => (id ? await ctx.db.get(ctx.db.normalizeId("listings", id) as any) : null);
        const product: any = await get(args.productId);
        const event: any = await get(args.eventId);
        const bono: any = args.bonoId ? await ctx.db.get(ctx.db.normalizeId("bonoRedemptions", args.bonoId) as any) : null;
        const paymentEvents = args.stripeEventId
            ? await ctx.db.query("paymentEvents").withIndex("by_stripe_event", (q: any) => q.eq("stripeEventId", args.stripeEventId)).collect()
            : [];
        return {
            product: product ? { stock: product.stock, available: product.available ?? null } : null,
            event: event ? { stock: event.stock, eventCapacity: event.eventCapacity, eventSoldCount: event.eventSoldCount } : null,
            bono: bono ? { status: bono.status } : null,
            paymentEvents: paymentEvents.map((e: any) => ({ processed: e.processed, error: e.error ?? null })),
        };
    },
});

/** Borra todo lo marcado. Idempotente. */
export const reset = internalMutation({
    args: {},
    handler: async (ctx) => {
        assertAuditDeployment();
        let deleted = 0;
        const users = (await ctx.db.query("users").collect()).filter((u: any) => String(u.email ?? "").startsWith(MARK));
        const userIds = new Set(users.map((u: any) => String(u._id)));
        for (const u of users) {
            for (const s of await ctx.db.query("sessions").withIndex("by_user", (q: any) => q.eq("userId", String(u._id))).collect()) {
                await ctx.db.delete(s._id); deleted++;
            }
            for (const c of await ctx.db.query("cart").withIndex("by_user", (q: any) => q.eq("userId", String(u._id))).collect()) {
                await ctx.db.delete(c._id); deleted++;
            }
            await ctx.db.delete(u._id); deleted++;
        }
        for (const l of (await ctx.db.query("listings").collect()).filter((l: any) => (l.tags ?? []).includes(MARK))) {
            await ctx.db.delete(l._id); deleted++;
        }
        for (const b of (await ctx.db.query("bonoRedemptions").collect()).filter((b: any) => userIds.has(String(b.sellerId)) || String(b.bonoCode).startsWith("AUD-"))) {
            await ctx.db.delete(b._id); deleted++;
        }
        for (const t of ["orders", "payments", "eventReservations", "stockReservations"] as const) {
            try {
                for (const d of (await (ctx.db as any).query(t).collect()).filter((d: any) => userIds.has(String(d.userId ?? d.buyerId ?? d.ownerUserId ?? "")))) {
                    await ctx.db.delete(d._id); deleted++;
                }
            } catch { /* stockReservations llega en H3; hasta entonces no existe */ }
        }
        for (const e of (await ctx.db.query("paymentEvents").collect()).filter((e: any) => String(e.stripeEventId).startsWith("evt_audit_"))) {
            await ctx.db.delete(e._id); deleted++;
        }
        return { deleted };
    },
});
