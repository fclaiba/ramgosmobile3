const { ConvexHttpClient } = require('convex/browser');
const { api } = require('./convex/_generated/api.js');
require('dotenv').config({ path: '.env.local' });

const client = new ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL);

async function check() {
    try {
        console.log("Conectando a:", process.env.EXPO_PUBLIC_CONVEX_URL);
        const feed = await client.query(api.listings.getFeed);
        console.log("✅ getFeed respondió exitosamente:", feed.length, "items.");
    } catch (e) {
        console.error("❌ ERROR en getFeed:", e);
    }
}

check();
