import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const wipeAndSeedBonos = mutation({
    args: {},
    handler: async (ctx) => {
        // 1. Delete all existing bonos
        const existingBonos = await ctx.db
            .query("listings")
            .withIndex("by_type", (q) => q.eq("type", "bono"))
            .collect();
            
        for (const bono of existingBonos) {
            await ctx.db.delete(bono._id);
        }

        // 2. We need a business user to attach the new bonos to
        const businessUsers = await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("role"), "business"))
            .collect();

        if (businessUsers.length === 0) {
            console.log("No hay negocios creados en la BD para asignar bonos.");
            return { success: false, message: "No businesses found" };
        }

        const tematicas = ["Fin de Semana", "Almuerzo Ejecutivo", "Cena Romántica", "After Office"];
        let count = 0;

        // 3. Crear 1 bono por negocio (de $100 que vale por $200)
        for (let i = 0; i < businessUsers.length; i++) {
            const business = businessUsers[i];
            const tematica = tematicas[i % tematicas.length];
            const isOpenPromotion = i % 2 === 0; // La mitad permite promoción libre, la otra mitad requiere whitelist

            await ctx.db.insert("listings", {
                title: `Bono ${tematica} - ${business.name || 'Local'}`,
                description: `Pagas $100 y consumes $200 en todo el menú. Descuento del 50%.`,
                price: 100, // Precio de venta
                discountValue: 100, // Descuento de 50%
                discountType: "percentage",
                currency: "USD",
                type: "bono",
                category: "Gastronomía",
                tags: ["promo", "bono"],
                sellerId: business._id,
                stock: 100,
                status: "active",
                slug: `bono-${tematica.toLowerCase().replace(/ /g, '-')}-${business._id}`,
                createdAt: new Date().toISOString(),
                
                // Lógica de Influencers
                openPromotion: isOpenPromotion,
                openCommissionRate: 0.10, // 10% para el influencer ($10 por venta)
            });
            count++;
        }

        return { success: true, deleted: existingBonos.length, inserted: count };
    }
});
