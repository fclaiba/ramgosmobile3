import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireActor } from "./authHelpers";

export const getDisputedOrEscrowOrders = query({
    args: {},
    handler: async (ctx) => {
        const actor = await requireActor(ctx);
        if (actor.role !== "admin" && actor.role !== "developer") {
            throw new Error("No autorizado");
        }

        // Obtener órdenes en escrow o disputadas
        const orders = await ctx.db
            .query("orders")
            .filter((q) => q.or(
                q.eq(q.field("status"), "paid_escrow"),
                q.eq(q.field("status"), "disputed")
            ))
            .order("desc")
            .take(50); // Límite de 50 para el panel MVP

        return orders;
    }
});
