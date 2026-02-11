import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily to check for underperforming influencers
crons.daily(
    "check-influencer-metrics",
    { hourUTC: 0, minuteUTC: 0 },
    internal.users.checkInfluencerMetrics
);

export default crons;
