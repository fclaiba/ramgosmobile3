const fs = require('fs');
const path = 'src/contexts/AuthContext.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add level and expProgress to PublicUser
content = content.replace(/tier: 'Bronze' \| 'Silver' \| 'Gold' \| 'Platinum';/, "tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';\n    level?: number;\n    expProgress?: number;");

// Update userData sync
content = content.replace(/tier: userData\.tier as any \|\| 'Bronze',/g, "tier: userData.tier as any || 'Bronze',\n                level: userData.level || 1,\n                expProgress: userData.expProgress || 0,");

// Update loginMutation result sync
content = content.replace(/tier: result\.tier \|\| 'Bronze',/g, "tier: result.tier || 'Bronze',\n                level: result.level || 1,\n                expProgress: result.expProgress || 0,");

fs.writeFileSync(path, content);
console.log('Added level and expProgress to AuthContext');
