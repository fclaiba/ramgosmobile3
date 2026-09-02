/**
 * Crons — sólo `crons.cron` / `crons.interval` (guidelines de Convex).
 *
 * Orden diario relevante para pagos (UTC):
 *   04:00 events-auto-release      → órdenes de eventos pasados (+24h)
 *   04:30 services-auto-release    → servicios entregados hace 7 días
 *   05:30 marketplace-auto-release → productos (10d) / bonos (1d) / alquileres
 *   06:15 influencer-due-payouts   → comisiones vencidas (10d post-liberación)
 *   07:00 stripe-bt-reconciliation → DESPUÉS de mover plata, para ver el día completo
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("check-influencer-metrics", "0 0 * * *", internal.users.checkInfluencerMetrics, {});

crons.cron("events-auto-release", "0 4 * * *", internal.events.internalAutoReleaseEvents, {});

crons.cron("services-auto-release", "30 4 * * *", internal.events.internalAutoReleaseServices, {});

crons.cron("marketplace-auto-release", "30 5 * * *", internal.stripe.internalCronAutoReleaseEscrows, {});

crons.cron("influencer-due-payouts", "15 6 * * *", internal.stripe.internalPayDueInfluencerPayouts, {});

crons.cron(
    "stripe-bt-reconciliation",
    "0 7 * * *",
    internal.reconciliation.internalReconcileStripeBalanceTransactions,
    {},
);

crons.interval("expire-stories", { hours: 1 }, internal.social.internalExpireStories, {});

crons.interval("dm-sweep-ephemeral", { minutes: 15 }, internal.social.dm.cleanupEphemeral, {});

crons.cron("expire-social-suspensions", "0 3 * * *", internal.social.moderation.internalExpireSuspensions, {});

crons.interval("recompute-tag-stats", { hours: 1 }, internal.social.hashtags.internalRecomputeTagStats, {});

crons.interval("publish-scheduled-posts", { minutes: 5 }, internal.social.drafts.internalPublishDueScheduled, {});

crons.cron("cleanup-event-matching", "45 4 * * *", internal.social.eventMatching.internalCleanupStaleMatching, {});

crons.interval("loops-tiering", { hours: 2 }, internal.social.loopsTiering.internalGradeLoopsTier, {});

export default crons;
