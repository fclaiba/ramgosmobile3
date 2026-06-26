const fs = require('fs');

// 1. Create convex/locations.ts
fs.writeFileSync('convex/locations.ts', `
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const search = query({
    args: { query: v.string() },
    handler: async (ctx, args) => {
        if (args.query.length < 3) return [];
        // In a real app this would hit Google Maps API.
        // For now, we query a locations table or return a filtered array.
        const allLocations = await ctx.db.query("locations").collect();
        const lowerQuery = args.query.toLowerCase();
        return allLocations.filter(p => 
            p.name.toLowerCase().includes(lowerQuery) || 
            p.address.toLowerCase().includes(lowerQuery)
        );
    }
});
`, 'utf8');

// 2. Add locations table to schema.ts
let schemaContent = fs.readFileSync('convex/schema.ts', 'utf8');
const tableDef = `
    locations: defineTable({
        name: v.string(),
        address: v.string(),
        placeId: v.string(),
    }),`;
if (!schemaContent.includes('locations: defineTable')) {
    schemaContent = schemaContent.replace('export default defineSchema({', 'export default defineSchema({' + tableDef);
    fs.writeFileSync('convex/schema.ts', schemaContent, 'utf8');
}

// 3. Update BusinessLocationSearch.tsx
const path = 'src/components/business/BusinessLocationSearch.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /import \{ Search, MapPin \} from 'lucide-react-native';/,
    `import { Search, MapPin } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';`
);

content = content.replace(/const MOCK_PLACES = \[\s+[\s\S]+?\];/, '');

content = content.replace(
    /const \[results, setResults\] = useState<typeof MOCK_PLACES>\(\[\]\);\s+const handleSearch = \(text: string\) => \{[\s\S]+?\} else \{\s+setResults\(\[\]\);\s+\}\s+\};/,
    `const dbResults = useQuery(api.locations.search, { query: query.length > 2 ? query : "" });
    const results = dbResults || [];

    const handleSearch = (text: string) => {
        setQuery(text);
    };`
);

fs.writeFileSync(path, content);
console.log('Phase 5 Marketplace Search done.');
