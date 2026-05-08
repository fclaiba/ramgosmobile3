/**
 * Observability helpers — structured logging for Stripe API calls.
 *
 * Convex backend doesn't have @sentry/node wired in yet (see
 * CREDENTIALS_HANDOFF_CHECKLIST.md), so for now this file emits
 * structured console.log lines that are easy to ingest by Convex
 * logs → log drain → Sentry. The tags match the plan
 * (`stripe.api`, `stripe.event_type`) so when Sentry is added these
 * become real breadcrumbs without changing call sites.
 *
 * Usage:
 *   import { logStripeBreadcrumb, withStripeBreadcrumb } from "./observability";
 *
 *   const pi = await withStripeBreadcrumb(
 *     { api: "paymentIntents.create", orderId },
 *     () => stripe.paymentIntents.create({ ... }),
 *   );
 */

export type StripeBreadcrumb = {
    api: string; // dotted call path: "paymentIntents.create"
    eventType?: string; // for webhook events
    orderId?: string;
    paymentId?: string;
    paymentIntentId?: string;
    accountId?: string;
    customerId?: string;
    subscriptionId?: string;
    [key: string]: unknown;
};

export const logStripeBreadcrumb = (
    crumb: StripeBreadcrumb,
    level: "info" | "warn" | "error" = "info",
): void => {
    const prefix =
        level === "error"
            ? "[stripe.api][error]"
            : level === "warn"
                ? "[stripe.api][warn]"
                : "[stripe.api]";
    try {
        const payload = JSON.stringify({
            tag: "stripe.api",
            level,
            timestamp: new Date().toISOString(),
            ...crumb,
        });
        if (level === "error") console.error(prefix, payload);
        else if (level === "warn") console.warn(prefix, payload);
        else console.log(prefix, payload);
    } catch {
        // Fallback to plain log if payload isn't JSON-serializable.
        console.log(prefix, crumb);
    }
};

/**
 * Wraps a Stripe SDK promise. Emits a breadcrumb on entry, success and
 * failure. Re-throws on error so callers can keep their try/catch.
 */
export const withStripeBreadcrumb = async <T>(
    crumb: StripeBreadcrumb,
    fn: () => Promise<T>,
): Promise<T> => {
    const start = Date.now();
    logStripeBreadcrumb({ ...crumb, phase: "start" });
    try {
        const result = await fn();
        logStripeBreadcrumb({
            ...crumb,
            phase: "success",
            durationMs: Date.now() - start,
        });
        return result;
    } catch (err: any) {
        logStripeBreadcrumb(
            {
                ...crumb,
                phase: "error",
                durationMs: Date.now() - start,
                error: err?.message ?? String(err),
                stripeCode: err?.code ?? null,
                stripeType: err?.type ?? null,
            },
            "error",
        );
        throw err;
    }
};
