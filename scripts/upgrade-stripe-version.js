const fs = require('fs');
const glob = ['convex/payments/actions.ts', 'convex/payments/webhooks.ts', 'convex/http.ts'];
for (const file of glob) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/apiVersion: ["']2023-10-16["']/, 'apiVersion: "2026-06-24.dahlia" as any');
        content = content.replace(/apiVersion: ["']2024-04-10["'] as any/, 'apiVersion: "2026-06-24.dahlia" as any');
        fs.writeFileSync(file, content);
    }
}
