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

async function seedUser(ctx: any, role: "business" | "consumer" | "admin", tag: string, suffix: string) {
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

/**
 * Escenario para `bonoRefund.integration.test.ts` (H2, E-149 BON-07):
 * una orden pagada de tipo bono, `escrowState: "held"`, con su bono
 * `issued` — todo lo que `internalBeginOrderRefund` necesita leer para
 * decidir si cancela el bono o bloquea el refund. `stripePaymentIntentId`
 * usa el prefijo `mock_pi_` (`_stripeEnv.ts:109`) para que el refund corra
 * sin pegarle a Stripe de verdad; requiere `ALLOW_STRIPE_MOCK=true` en el
 * deployment de audit.
 */
export const seedRefundScenario = internalMutation({
    args: {},
    handler: async (ctx) => {
        assertAuditDeployment();
        const suffix = Date.now().toString(36);
        const business = await seedUser(ctx, "business", "refund-business", suffix);
        const buyer = await seedUser(ctx, "consumer", "refund-buyer", suffix);
        const admin = await seedUser(ctx, "admin", "refund-admin", suffix);

        const bonoListingId = String(
            await ctx.db.insert("listings", {
                ...listingBase(business.id, "bono", `${MARK} bono refund`, suffix),
                stock: 9999,
                discountValue: 100,
                validityDays: 30,
            }),
        );

        const grossCents = 5000;
        const now = nowIso();
        const orderId = String(
            await ctx.db.insert("orders", {
                userId: buyer.id,
                sellerId: business.id,
                items: [{ listingId: bonoListingId, title: `${MARK} bono refund`, quantity: 1, price: 50 }],
                total: 50,
                currency: "USD" as const,
                status: "paid_escrow" as const,
                listingType: "bono",
                mode: "test" as const,
                escrowState: "held",
                grossCents,
                stripePaymentIntentId: `mock_pi_${MARK}_${suffix}`,
                createdAt: now,
                updatedAt: now,
            }),
        );

        const bonoCode = `AUDREF-${suffix}`.toUpperCase();
        const bonoId = String(
            await ctx.db.insert("bonoRedemptions", {
                bonoCode,
                listingId: bonoListingId,
                ownerUserId: buyer.id,
                sellerId: business.id,
                orderId,
                validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
                paidAmount: 50,
                creditTotal: 100,
                creditRemaining: 100,
                usesTotal: 1,
                usesRemaining: 1,
                status: "issued",
                createdAt: now,
            }),
        );

        return { suffix, business, buyer, admin, orderId, bonoId, bonoCode, bonoListingId };
    },
});

/**
 * H4 (E-149 AGD-06). Mismo molde que `seedRefundScenario`, para la orden con
 * una entrada de evento en vez de un bono. `reservationStatus` deja elegir el
 * escenario sin duplicar la función: `confirmed` (nadie usó la entrada) o
 * `checked_in` (el asistente ya entró).
 */
export const seedEventRefundScenario = internalMutation({
    args: { reservationStatus: v.union(v.literal("confirmed"), v.literal("checked_in")) },
    handler: async (ctx, args) => {
        assertAuditDeployment();
        const suffix = Date.now().toString(36);
        const business = await seedUser(ctx, "business", "event-refund-business", suffix);
        const buyer = await seedUser(ctx, "consumer", "event-refund-buyer", suffix);
        const admin = await seedUser(ctx, "admin", "event-refund-admin", suffix);

        const eventListingId = String(
            await ctx.db.insert("listings", {
                ...listingBase(business.id, "event", `${MARK} evento refund`, suffix),
                stock: 5,
                eventDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
            }),
        );

        const grossCents = 1000;
        const now = nowIso();
        const orderId = String(
            await ctx.db.insert("orders", {
                userId: buyer.id,
                sellerId: business.id,
                items: [{ listingId: eventListingId, title: `${MARK} evento refund`, quantity: 1, price: 10 }],
                total: 10,
                currency: "USD" as const,
                status: "paid_escrow" as const,
                listingType: "event",
                mode: "test" as const,
                escrowState: "held",
                grossCents,
                stripePaymentIntentId: `mock_pi_${MARK}_${suffix}`,
                createdAt: now,
                updatedAt: now,
            }),
        );

        const qrCode = `EVT-AUDREF-${suffix}`.toUpperCase();
        const reservationId = String(
            await ctx.db.insert("eventReservations", {
                listingId: eventListingId,
                userId: buyer.id,
                sellerId: business.id,
                orderId,
                quantity: 1,
                qrCode,
                status: args.reservationStatus,
                ...(args.reservationStatus === "checked_in" ? { checkedInAt: now } : {}),
                createdAt: now,
            }),
        );

        return { suffix, business, buyer, admin, orderId, reservationId, qrCode, eventListingId };
    },
});

/** Estado actual de los documentos que los tests afirman. */
export const inspect = internalQuery({
    args: {
        productId: v.optional(v.string()),
        eventId: v.optional(v.string()),
        bonoId: v.optional(v.string()),
        orderId: v.optional(v.string()),
        stripeEventId: v.optional(v.string()),
        reservationUserId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const get = async (table: string, id?: string) => (id ? await ctx.db.get(ctx.db.normalizeId(table as any, id) as any) : null);
        const product: any = await get("listings", args.productId);
        const event: any = await get("listings", args.eventId);
        const bono: any = await get("bonoRedemptions", args.bonoId);
        const order: any = await get("orders", args.orderId);
        const paymentEvents = args.stripeEventId
            ? await ctx.db.query("paymentEvents").withIndex("by_stripe_event", (q: any) => q.eq("stripeEventId", args.stripeEventId)).collect()
            : [];
        // Sin índice por orderId (audit_logs no lo tiene): aceptable acá
        // porque esto es un helper de test, nunca una query de producto.
        const auditLogs = args.orderId
            ? (await ctx.db.query("audit_logs").collect()).filter((l: any) => l.metadata?.orderId === args.orderId)
            : [];
        // Reservas de stock del comprador (H3): sin índice por userId a
        // propósito — la clave real es (cartId, userId) y esto es un helper de
        // test sobre un deployment con cuatro filas, no una query de producto.
        const reservations = args.reservationUserId
            ? (await ctx.db.query("stockReservations").collect()).filter(
                  (r: any) => String(r.userId) === args.reservationUserId,
              )
            : [];
        // Entradas de evento de la orden (H4): por el índice `by_order` que
        // usa `internalBeginOrderRefund` para bloquear/cancelar.
        const eventReservations = args.orderId
            ? await ctx.db.query("eventReservations").withIndex("by_order", (q: any) => q.eq("orderId", args.orderId)).collect()
            : [];

        return {
            reservations: reservations.map((r: any) => ({
                status: r.status,
                lines: r.lines,
                releaseReason: r.releaseReason ?? null,
            })),
            eventReservations: eventReservations.map((r: any) => ({ status: r.status, qrCode: r.qrCode })),
            product: product ? { stock: product.stock, available: product.available ?? null } : null,
            event: event ? { stock: event.stock, eventCapacity: event.eventCapacity, eventSoldCount: event.eventSoldCount } : null,
            bono: bono ? { status: bono.status } : null,
            order: order
                ? {
                      escrowState: order.escrowState ?? null,
                      refundedCents: order.refundedCents ?? 0,
                      status: order.status,
                      escrowRefundError: order.escrowRefundError ?? null,
                  }
                : null,
            paymentEvents: paymentEvents.map((e: any) => ({ processed: e.processed, error: e.error ?? null })),
            auditLogs: auditLogs.map((l: any) => ({ action: l.action, metadata: l.metadata ?? null })),
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
            } catch { /* tabla ausente en un deployment viejo: no es motivo para abortar el reset */ }
        }
        for (const e of (await ctx.db.query("paymentEvents").collect()).filter((e: any) => String(e.stripeEventId).startsWith("evt_audit_"))) {
            await ctx.db.delete(e._id); deleted++;
        }
        for (const l of (await ctx.db.query("audit_logs").collect()).filter(
            (l: any) => userIds.has(String(l.actorUserId)) || userIds.has(String(l.targetUserId)),
        )) {
            await ctx.db.delete(l._id); deleted++;
        }
        return { deleted };
    },
});
