const { ConvexHttpClient } = require('convex/browser');

const client = new ConvexHttpClient('https://academic-lapwing-311.convex.cloud');

async function testCart() {
    try {
        const users = await client.query("users:listUsers", {});
        const businessUser = users.find(u => u.role === 'business');
        
        const items = await client.query("listings:getFeed", { viewerId: businessUser._id });
        const item = items[0];
        
        console.log("Adding item:", item.title, item._id);

        await client.mutation("cart:addToCart", {
            userId: businessUser._id,
            listingId: item._id,
            quantity: 1,
            snapshot: {
                title: item.title,
                price: item.price,
                image: item.image,
                sellerId: item.sellerId,
                type: item.type,
                sellerName: "Test Seller",
                condition: item.condition,
                shippingWeightKg: item.shippingWeightKg,
                shippingDimensionsCm: item.shippingDimensionsCm,
                distanceKm: 0,
            }
        });

        console.log("Added to cart!");
        const cart = await client.query("cart:getMyCart", { userId: businessUser._id });
        console.log("Cart items:", cart.length);
    } catch (e) {
        console.error("Error:", e);
    }
}

testCart();
