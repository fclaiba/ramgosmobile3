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

// Barre filas de "escribiendo…" abandonadas (app cerrada de golpe) y
// presencia muy vieja. El indicador ya desaparece solo en el cliente por
// TTL; esto es únicamente para que las tablas no acumulen basura.
crons.interval(
    "dm-sweep-ephemeral",
    { minutes: 15 },
    internal.social.dm.cleanupEphemeral,
    {},
);

// Moderación (Fase 2): reactiva cuentas cuya suspensión social ya venció.
crons.daily(
    "expire-social-suspensions",
    { hourUTC: 3, minuteUTC: 0 },
    internal.social.moderation.internalExpireSuspensions,
    {},
);

// Grafo social (Fase 4): recalcula `count24h` de tendencias desde las filas
// reales en vez de dejarlo crecer sin decaer.
crons.interval(
    "recompute-tag-stats",
    { hours: 1 },
    internal.social.hashtags.internalRecomputeTagStats,
    {},
);

// Borradores y programación (Fase 7): publica lo que ya venció.
crons.interval(
    "publish-scheduled-posts",
    { minutes: 5 },
    internal.social.drafts.internalPublishDueScheduled,
    {},
);

// Matching de eventos (Fase 8): purga opt-ins viejos. Los matches ya
// concretados (con chat real) sobreviven siempre.
crons.daily(
    "cleanup-event-matching",
    { hourUTC: 4, minuteUTC: 45 },
    internal.social.eventMatching.internalCleanupStaleMatching,
    {},
);

// Ranking dual (Fase 3, E-086): gradúa/suprime videos de Loops por
// percentil una vez que juntan suficientes vistas ("bandit-lite" sin ML
// real todavía). Cada 2h porque el volumen de vistas nuevas por hora no
// justifica correrlo más seguido.
crons.interval(
    "loops-tiering",
    { hours: 2 },
    internal.social.loopsTiering.internalGradeLoopsTier,
    {},
);

export default crons;
