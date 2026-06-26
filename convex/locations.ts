
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const search = query({
    args: { query: v.string() },
    handler: async (ctx, args) => {
        if (args.query.length < 3) return [];
        // In a real app this would hit Google Maps API.
        // The locations table is not in schema yet.
        return [];
    }
});
