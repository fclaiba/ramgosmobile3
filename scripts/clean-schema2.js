const fs = require('fs');

let content = fs.readFileSync('convex/schema.ts', 'utf8');

// The block starts with "    pointsLedger: defineTable({" and ends right before "gameScores: defineTable({"
content = content.replace(/ {4}pointsLedger: defineTable\(\{[\s\S]*?\}\)\r?\n {4}\.index\("by_user", \["userId"\]\)\r?\n {4}\.index\("by_user_type", \["userId", "type"\]\),\r?\n/g, '');

fs.writeFileSync('convex/schema.ts', content, 'utf8');
console.log('Duplicate pointsLedger removed');
