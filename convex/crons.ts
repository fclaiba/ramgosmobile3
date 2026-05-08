import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily to check for underperforming influencers
crons.daily(
    "check-influencer-metrics",
    { hourUTC: 0, minuteUTC: 0 },
    internal.users.checkInfluencerMetrics
);

// Auto-release event escrows once the event date has passed by 24h+.
// Without this, organisers would have to wait for the buyer to manually
// confirm — which buyers rarely do post-event.
crons.daily(
    "events-auto-release",
    { hourUTC: 4, minuteUTC: 0 },
    internal.events.internalAutoReleaseEvents,
);

// Auto-release service escrows after 7 days in 'delivered' state.
crons.daily(
    "services-auto-release",
    { hourUTC: 4, minuteUTC: 30 },
    internal.events.internalAutoReleaseServices,
);

// Daily reconciliation against Stripe Balance Transactions. Surfaces drift
// between our payments/payouts ledger and Stripe's source-of-truth as
// `reconciliationFlags` rows that admins triage in AdminFinanceScreen.
crons.daily(
    "stripe-bt-reconciliation",
    { hourUTC: 5, minuteUTC: 0 },
    internal.reconciliation.internalReconcileStripeBalanceTransactions,
    {},
);

// Hourly soft-delete of expired social stories. Keeps the feed query
// cheap by ensuring `getStoriesForFollowing` doesn't need to filter
// large arrays of dead rows.
crons.interval(
    "expire-stories",
    { hours: 1 },
    internal.social.internalExpireStories,
    {},
);

export default crons;
