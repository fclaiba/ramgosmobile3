import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedUsers = mutation({
    args: {},
    handler: async (ctx) => {
        const usersToCreate = [
            { email: "consumer@test.com", name: "consumer", role: "consumer" },
            { email: "business@test.com", name: "business", role: "business" },
            { email: "influencer@test.com", name: "influencer", role: "influencer" },
            { email: "admin@test.com", name: "admin", role: "admin" }
        ];

        // Cleanup old spanish named accounts to avoid confusion
        const oldEmails = ["consumidor@test.com", "negocio@test.com"];
        for (const email of oldEmails) {
            const old = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).first();
            if (old) {
                await ctx.db.delete(old._id);
            }
        }

        const hashPassword = (password: string) => {
            return `hashed_${password.split('').reverse().join('')}`;
        };

        for (const u of usersToCreate) {
            // Check if exists
            const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", u.email)).first();
            if (!existing) {
                await ctx.db.insert("users", {
                    uid: Math.random().toString(36).slice(2),
                    email: u.email,
                    name: u.name,
                    role: u.role as any,
                    password: hashPassword("password123"),
                    isTest: true,
                    kycStatus: "verified",
                    joinedAt: new Date().toISOString()
                });
            } else {
                // Update to ensure verified and correct password
                await ctx.db.patch(existing._id, {
                    kycStatus: "verified",
                    password: hashPassword("password123")
                });
            }
        }
        
        return "Users created and verified successfully";
    }
});

export const seedRegionalListings = mutation({
    args: {},
    handler: async (ctx) => {
        const seller = await ctx.db.query('users').withIndex('by_email', q => q.eq('email', 'business@test.com')).first();
        if (!seller) throw new Error('Business user not found.');

        const sellerId = seller._id;

        const types = ['product', 'service', 'event', 'bono'];
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
            for (let i = 0; i < 25; i++) {
                const type = types[i % 4];
                const area = loc.areas[i % 3];
                const typeName = type.charAt(0).toUpperCase() + type.slice(1);
                const title = typeName + ' Premium en ' + area.name.split(',')[0] + ' #' + (i+1);
                
                const lat = area.lat + (Math.random() - 0.5) * 0.02;
                const lng = area.lng + (Math.random() - 0.5) * 0.02;

                await ctx.db.insert('listings', {
                    title,
                    description: 'Excelente ' + type + ' disponible en la zona de ' + area.name + '. Perfecto para disfrutar.',
                    price: Math.floor(Math.random() * 100) + 10,
                    currency: 'USD',
                    type: type as any,
                    category: 'General',
                    tags: [loc.region, type],
                    sellerId: sellerId,
                    stock: Math.floor(Math.random() * 50) + 5,
                    status: 'active',
                    slug: 'listing-' + loc.region.toLowerCase() + '-' + type + '-' + i + '-' + Date.now(),
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
        return count + ' listings created.';
    }
});
