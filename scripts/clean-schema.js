const fs = require('fs');
const path = 'convex/schema.ts';
let content = fs.readFileSync(path, 'utf8');

// Find the start of the bad block and the end of achievements
const startStr = `    pointsLedger: defineTable({
        userId: v.id("users"),
        points: v.number(),
        type: v.string(), // "earn", "redeem", "convert", "challenge"
        description: v.string(),
        source: v.optional(v.string()), // 'purchase' | 'game' | 'referral' | 'bonus' | 'manual'
        metadata: v.optional(v.any()),
        createdAt: v.string(),
    })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"]),`;

// Only remove the bad pointsLedger block that was added
content = content.replace(startStr, '');

fs.writeFileSync(path, content);
console.log('Cleaned duplicated pointsLedger in schema');
