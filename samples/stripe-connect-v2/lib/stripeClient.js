/**
 * Single Stripe Client used everywhere in this sample.
 *
 * Why a singleton:
 *   - Stripe recommends reusing a single client per process. It internally
 *     manages keep-alive HTTP connections, retries, telemetry, and idempotency
 *     state. Creating a new `Stripe(...)` per request wastes resources and can
 *     subtly break idempotency handling.
 *
 * API version:
 *   - We intentionally DO NOT pass `apiVersion`. The SDK pins the API version
 *     it was generated against (currently `2026-04-22.dahlia` preview), which
 *     is exactly what the user requested.
 */
const Stripe = require("stripe");

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;

/**
 * Validate the secret key BEFORE constructing the client.
 *
 * `new Stripe(undefined)` throws a confusing low-level error from inside the
 * SDK. Catching it here lets us print an actionable message that points the
 * developer at the .env.example file and the Stripe dashboard.
 */
if (!SECRET_KEY || SECRET_KEY.includes("REPLACE_ME")) {
    /* eslint-disable no-console */
    console.error("\n[stripe-connect-v2] Missing STRIPE_SECRET_KEY.");
    console.error("  1. Copy .env.example to .env in this folder:");
    console.error("       cp .env.example .env");
    console.error("  2. Open https://dashboard.stripe.com/test/apikeys");
    console.error('  3. Copy your test "Secret key" (starts with "sk_test_") into .env');
    console.error("  4. Restart the server with `npm start`.\n");
    /* eslint-enable no-console */
    throw new Error("STRIPE_SECRET_KEY is not configured. See messages above.");
}

/**
 * The Stripe Client used by every route in this sample.
 *
 * Use it for:
 *   - V2 endpoints:         stripeClient.v2.core.accounts.create(...)
 *                           stripeClient.v2.core.accountLinks.create(...)
 *                           stripeClient.v2.core.events.retrieve(...)
 *   - V1 endpoints:         stripeClient.products.create(...)
 *                           stripeClient.checkout.sessions.create(...)
 *   - Webhook parsing:      stripeClient.parseThinEvent(rawBody, sig, secret)
 */
const stripeClient = new Stripe(SECRET_KEY);

module.exports = { stripeClient };
