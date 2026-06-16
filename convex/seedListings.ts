import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const run = mutation({
    args: {},
    handler: async (ctx) => {
        // 1. Get the seller (business@test.com)
        const seller = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", "business@test.com")).first();
        if (!seller) throw new Error("Business user not found. Please run seed:seedUsers first.");

        const sellerId = seller._id;

        const types = ['product', 'service', 'event', 'bono'] as const;
        const locations = [
            { 
                region: 'NY', 
                areas: [
                    { name: 'Manhattan, NY', lat: 40.7831, lng: -73.9712 },
                    { name: 'Brooklyn, NY', lat: 40.6782, lng: -73.9442 },
                    { name: 'Queens, NY', lat: 40.7282, lng: -73.7949 }
                ]
            },
            {
                region: 'AR',
                areas: [
                    { name: 'Palermo, CABA, Argentina', lat: -34.5888, lng: -58.4305 },
                    { name: 'Recoleta, CABA, Argentina', lat: -34.5895, lng: -58.3974 },
                    { name: 'Belgrano, CABA, Argentina', lat: -34.5627, lng: -58.4583 }
                ]
            }
        ];

        let count = 0;

        for (const loc of locations) {
            // 25 items per region
            for (let i = 0; i < 25; i++) {
                const type = types[i % 4];
                const area = loc.areas[i % 3];
                const typeName = type.charAt(0).toUpperCase() + type.slice(1);
                const title = `${typeName} Premium en ${area.name.split(',')[0]} #${i+1}`;
                
                // Jitter coordinates slightly
                const lat = area.lat + (Math.random() - 0.5) * 0.02;
                const lng = area.lng + (Math.random() - 0.5) * 0.02;

                await ctx.db.insert("listings", {
                    title,
                    description: `Excelente ${type} disponible en la zona de ${area.name}. Perfecto para disfrutar.`,
                    price: Math.floor(Math.random() * 100) + 10,
                    currency: 'USD',
                    type,
                    category: 'General',
                    tags: [loc.region, type],
                    sellerId: sellerId,
                    stock: Math.floor(Math.random() * 50) + 5,
                    status: 'active',
                    slug: `listing-${loc.region.toLowerCase()}-${type}-${i}-${Date.now()}`,
                    location: {
                        name: area.name,
                        lat,
                        lng,
                        address: area.name,
                        distanceKm: 0,
                    },
                    createdAt: new Date().toISOString()
                });
                count++;
            }
        }
        return `Successfully seeded ${count} listings.`;
    }
});
