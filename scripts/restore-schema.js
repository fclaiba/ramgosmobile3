const fs = require('fs');
let schemaContent = fs.readFileSync('convex/schema.ts', 'utf8');

// Restore level & expProgress to users table if missing
if (!schemaContent.includes('level: v.optional(v.number()),')) {
    schemaContent = schemaContent.replace(
        'emailVerified: v.optional(v.boolean()),',
        'emailVerified: v.optional(v.boolean()),\n        level: v.optional(v.number()),\n        expProgress: v.optional(v.number()),'
    );
}

// Add the 3 missing tables at the end
if (!schemaContent.includes('gameScores: defineTable')) {
    // Find the last closing brace and add the tables before it
    const newTables = `
    locations: defineTable({
        name: v.string(),
        address: v.string(),
        placeId: v.string(),
    }),

    gameScores: defineTable({
        userId: v.string(),
        gameId: v.string(),
        score: v.number(),
        metadata: v.optional(v.any()),
        playedAt: v.string(),
    })
    .index("by_user", ["userId"])
    .index("by_game", ["gameId"])
    .index("by_user_game", ["userId", "gameId"]),

    achievements: defineTable({
        userId: v.string(),
        achievementId: v.string(),
        unlockedAt: v.string(),
        metadata: v.optional(v.any()),
    })
    .index("by_user", ["userId"])
    .index("by_user_achievement", ["userId", "achievementId"]),
`;
    // We just replace the last "});" with our tables and then "});"
    const lastIndex = schemaContent.lastIndexOf('});');
    if (lastIndex !== -1) {
        schemaContent = schemaContent.substring(0, lastIndex) + newTables + '\n});\n';
    }
}

fs.writeFileSync('convex/schema.ts', schemaContent, 'utf8');
console.log('Restored schema additions successfully.');
