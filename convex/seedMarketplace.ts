import { mutation } from "./_generated/server";

export const seed = mutation({
    args: {},
    handler: async (ctx) => {
        // 1. Get business user
        const businessUser = await ctx.db.query("users")
            .withIndex("by_email", q => q.eq("email", "business@test.com"))
            .first();

        if (!businessUser) {
            return "Error: No se encontró business@test.com. Ejecuta seedUsers primero.";
        }

        const sellerId = businessUser._id;

        const locations = [
            { lat: 40.7831, lng: -73.9712, name: 'Manhattan, NY', address: 'Manhattan, New York, NY' },
            { lat: 40.6782, lng: -73.9442, name: 'Brooklyn, NY', address: 'Brooklyn, New York, NY' },
            { lat: 40.7282, lng: -73.7949, name: 'Queens, NY', address: 'Queens, New York, NY' }
        ];

        const types = ["product", "service", "bono", "event"] as const;
        const categories = ["Tecnología", "Hogar", "Clases", "Entradas", "Descuentos"];
        const images = [
            "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
            "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f"
        ];

        let count = 0;
        for (let i = 0; i < 25; i++) {
            const type = types[i % 4];
            const loc = locations[i % 3];
            const isOpen = i % 2 === 0;

            await ctx.db.insert("listings", {
                sellerId,
                type,
                title: `${type.toUpperCase()} de Prueba #${i + 1}`,
                description: `Descripción generada automáticamente para este ${type} en ${loc.name}.`,
                price: Math.floor(Math.random() * 500) + 10,
                stock: Math.floor(Math.random() * 100) + 1,
                category: categories[i % categories.length],
                condition: "new",
                image: images[i % images.length],
                gallery: [],
                status: "active",

                location: loc,
                shippingProfile: {
                    weightKg: 1,
                    allowPickup: true,
                    shipsFromCity: loc.name
                },
                openPromotion: isOpen,
                openCommissionRate: isOpen ? 15 : undefined,
                eventDate: type === "event" ? "2026-12-31" : undefined,
                eventTime: type === "event" ? "20:00" : undefined,
                validUntil: type === "bono" ? "2026-12-31" : undefined,
                discountValue: type === "bono" ? 20 : undefined,
                discountType: type === "bono" ? "percentage" : undefined,
                currency: "USD",
                tags: [],
                slug: `${type}-de-prueba-${i + 1}-${Math.random().toString(36).substring(7)}`,
                createdAt: new Date().toISOString(),
            });
            count++;
        }

        return `✅ ${count} ítems sembrados para business@test.com en NY.`;
    }
});
