import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const seedE2E = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("🌱 Iniciando seeder para E2E testing...");

    // 1. Crear usuarios de prueba
    const sellerId = await ctx.db.insert("users", {
      uid: "test_seller_1",
      name: "Vendedor de Prueba",
      email: "vendedor@prueba.com",
      role: "business",
      isTest: true,
      stripeConnectAccountId: "acct_test123", // Dummy ID
      stripeConnectStatus: "active",
      joinedAt: new Date().toISOString(),
    });

    const buyerId = await ctx.db.insert("users", {
      uid: "test_buyer_1",
      name: "Comprador de Prueba",
      email: "comprador@prueba.com",
      role: "consumer",
      isTest: true,
      joinedAt: new Date().toISOString(),
    });

    const influencerId = await ctx.db.insert("users", {
      uid: "test_influencer_1",
      name: "Influencer Prueba",
      email: "influencer@prueba.com",
      role: "influencer",
      isTest: true,
      joinedAt: new Date().toISOString(),
    });

    // 2. Crear un producto
    const listingId = await ctx.db.insert("listings", {
      title: "Auriculares Inalámbricos E2E",
      description: "Producto de prueba para el seeder",
      price: 150.0,
      currency: "USD",
      type: "product",
      category: "Electrónica",
      tags: ["prueba", "e2e"],
      sellerId: sellerId,
      stock: 10,
      status: "active",
      slug: "auriculares-e2e",
      createdAt: new Date().toISOString(),
      shippingProfile: {
        weightKg: 1,
        allowPickup: true,
        shipsFrom: { city: "Buenos Aires", country: "AR", postalCode: "1000" },
        handlingTimeHours: 24,
      }
    });

    // 3. Crear una orden en estado Escrow
    const orderId = await ctx.db.insert("orders", {
      userId: buyerId,
      sellerId: sellerId,
      items: [{
        listingId: listingId,
        title: "Auriculares Inalámbricos E2E",
        quantity: 1,
        price: 150.0,
      }],
      total: 150.0,
      currency: "USD",
      status: "paid_escrow", // Para probar el botón "Confirmar Recepción"
      escrowState: "held",
      netAmountCents: 13200, // $132.00 (descontando 12% comisión)
      commissionCents: 1800, // $18.00
      transferGroup: "cart_e2e_test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log("✅ Seed completado con éxito.");
    return { success: true, orderId, sellerId, buyerId, influencerId, listingId };
  }
});
