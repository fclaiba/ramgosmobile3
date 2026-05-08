/**
 * Stripe Connect V2 sample — Express server.
 *
 * What this file does:
 *   1. Loads env vars from .env (must happen BEFORE requiring stripeClient,
 *      because stripeClient reads process.env at module-load time).
 *   2. Mounts the /webhook route with `express.raw` BEFORE `express.json`.
 *      The Stripe webhook signature is computed over the raw bytes; if Express
 *      parses JSON first, the signature check fails with an unhelpful error.
 *   3. Serves the static HTML/JS/CSS from /public.
 *   4. Exposes the API routes for: account creation, onboarding link, account
 *      status, product creation, product listing, and checkout.
 *
 * Designed to be runnable end-to-end with:
 *     npm install
 *     npm start
 * and (in a second shell, for webhooks):
 *     stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' --forward-thin-to http://localhost:4242/webhook
 */

// --- 1. Env loading ----------------------------------------------------------
require("dotenv").config();

const express = require("express");
const path = require("path");

const { stripeClient } = require("./lib/stripeClient");
const store = require("./lib/store");

const app = express();
const PORT = Number(process.env.PORT) || 4242;

// =============================================================================
// 2. Webhook route — mounted FIRST with express.raw so the body is the raw
// buffer Stripe used to compute the signature.
// =============================================================================

/**
 * POST /webhook
 *
 * Receives Stripe V2 *thin* events. Thin events only contain the event id and
 * type; we then call `v2.core.events.retrieve(thinEvent.id)` to get the full
 * payload. This is the recommended pattern for V2 because it survives schema
 * changes and lets you avoid storing event payloads at the edge.
 *
 * Configure your Stripe webhook destination to send:
 *   - v2.core.account[requirements].updated
 *   - v2.core.account[configuration.recipient].capability_status_updated
 *
 * Locally:
 *   stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' --forward-thin-to http://localhost:4242/webhook
 */
app.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        // Soft fail with a clear 503 instead of crashing if the operator forgot
        // to set the webhook secret. Keeps the rest of the demo usable.
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret || webhookSecret.includes("REPLACE_ME")) {
            console.warn(
                "[webhook] STRIPE_WEBHOOK_SECRET is not configured. Run `stripe listen` and copy the whsec_... value into .env.",
            );
            return res
                .status(503)
                .json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
        }

        const sig = req.headers["stripe-signature"];

        let thinEvent;
        try {
            // parseThinEvent verifies the signature AND returns the parsed
            // thin envelope: { id, type, created, ... }.
            thinEvent = stripeClient.parseThinEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error("[webhook] Signature verification failed:", err.message);
            return res.status(400).send(`Webhook signature error: ${err.message}`);
        }

        try {
            // For V2 thin events you almost always need to fetch the full event
            // because the thin payload is intentionally minimal.
            const event = await stripeClient.v2.core.events.retrieve(thinEvent.id);

            switch (event.type) {
                case "v2.core.account[requirements].updated": {
                    // The connected account's requirement set changed.
                    // In a real app: re-fetch the account + surface required
                    // actions to the user, send them a fresh onboarding link.
                    const accountId = event.related_object?.id;
                    console.log(
                        `[webhook] requirements updated for account=${accountId}`,
                    );
                    if (accountId) {
                        try {
                            const acct = await stripeClient.v2.core.accounts.retrieve(
                                accountId,
                                { include: ["requirements"] },
                            );
                            const summary = acct.requirements?.summary;
                            console.log("[webhook]   summary:", JSON.stringify(summary));
                        } catch (e) {
                            console.warn(
                                "[webhook]   could not retrieve account:",
                                e.message,
                            );
                        }
                    }
                    break;
                }

                case "v2.core.account[configuration.recipient].capability_status_updated": {
                    // A capability on the recipient configuration changed
                    // (e.g. stripe_balance.stripe_transfers went active).
                    const accountId = event.related_object?.id;
                    console.log(
                        `[webhook] recipient capability status updated for account=${accountId}`,
                    );
                    if (accountId) {
                        try {
                            const acct = await stripeClient.v2.core.accounts.retrieve(
                                accountId,
                                { include: ["configuration.recipient"] },
                            );
                            const transfersStatus =
                                acct.configuration?.recipient?.capabilities?.stripe_balance
                                    ?.stripe_transfers?.status;
                            console.log(
                                `[webhook]   stripe_transfers.status = ${transfersStatus}`,
                            );
                            if (transfersStatus === "active") {
                                console.log(
                                    "[webhook]   account is READY to receive payments",
                                );
                            }
                        } catch (e) {
                            console.warn(
                                "[webhook]   could not retrieve account:",
                                e.message,
                            );
                        }
                    }
                    break;
                }

                default: {
                    console.log(`[webhook] Unhandled event type: ${event.type}`);
                }
            }

            return res.json({ received: true });
        } catch (err) {
            console.error("[webhook] Handler error:", err);
            // Return 500 so Stripe retries — but only for handler errors, not
            // signature failures.
            return res.status(500).send(`Webhook handler error: ${err.message}`);
        }
    },
);

// =============================================================================
// 3. JSON body parser + static files for everything else.
// =============================================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =============================================================================
// 4. API routes
// =============================================================================

/**
 * Build a fully-qualified base URL from the incoming request.
 *
 * We use `req.protocol` and the `Host` header so the sample works whether you
 * hit it via http://localhost:4242, an ngrok tunnel, or a deployed URL — no
 * config needed.
 */
function baseUrl(req) {
    const host = req.get("host");
    return `${req.protocol}://${host}`;
}

// ---------------------------------------------------------------------------
// POST /api/accounts
// Create a V2 connected account using EXACTLY the property shape the user
// requested. Notice: NO top-level `type` field. Instead we use:
//   - dashboard: "express"
//   - defaults.responsibilities (platform = fees + losses collector)
//   - configuration.recipient.capabilities.stripe_balance.stripe_transfers
// ---------------------------------------------------------------------------
app.post("/api/accounts", async (req, res) => {
    const { displayName, contactEmail } = req.body || {};
    if (!displayName || !contactEmail) {
        return res
            .status(400)
            .json({ error: "displayName and contactEmail are required" });
    }

    try {
        const account = await stripeClient.v2.core.accounts.create({
            display_name: displayName,
            contact_email: contactEmail,
            identity: {
                country: "us",
            },
            // "express" gives the connected user a Stripe-hosted dashboard
            // (vs. "none" for fully white-labeled / API-only experiences).
            dashboard: "express",
            defaults: {
                // The PLATFORM (your app) collects all Stripe fees and absorbs
                // any negative-balance / chargeback losses. This matches the
                // destination-charge model used in /api/checkout below.
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "application",
                },
            },
            configuration: {
                // Mark this account as a "recipient" — it can receive funds
                // from the platform via stripe_transfers. This is what unlocks
                // `transfer_data.destination` in checkout sessions.
                recipient: {
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: {
                                requested: true,
                            },
                        },
                    },
                },
            },
        });

        // Persist the (display name -> account id) mapping locally so the
        // dashboard can show a friendly name later.
        const record = store.addAccount({
            id: account.id,
            displayName,
            contactEmail,
        });

        return res.json({ account: record });
    } catch (err) {
        console.error("[/api/accounts] create error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/accounts/:id/onboarding-link
// Create a V2 Account Link that the connected user opens to complete KYC.
// ---------------------------------------------------------------------------
app.post("/api/accounts/:id/onboarding-link", async (req, res) => {
    const accountId = req.params.id;

    try {
        const link = await stripeClient.v2.core.accountLinks.create({
            account: accountId,
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    // We only requested the recipient configuration on the
                    // account, so we onboard exactly that.
                    configurations: ["recipient"],
                    // refresh_url: where Stripe sends the user if the link
                    // expires or they need to retry.
                    refresh_url: `${baseUrl(req)}/dashboard.html?accountId=${accountId}`,
                    // return_url: where Stripe sends the user after they
                    // finish (or abandon) onboarding.
                    return_url: `${baseUrl(req)}/dashboard.html?accountId=${accountId}`,
                },
            },
        });
        return res.json({ url: link.url });
    } catch (err) {
        console.error("[/api/accounts/:id/onboarding-link] error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/accounts/:id/status
// ALWAYS reads from the Stripe API directly — no DB cache, per the brief.
// Returns a small derived view: are payments unlocked? are requirements due?
// ---------------------------------------------------------------------------
app.get("/api/accounts/:id/status", async (req, res) => {
    const accountId = req.params.id;

    try {
        // We pass `include` so Stripe expands the recipient capability block
        // and the requirements summary; without these, the response is just
        // the bare account envelope.
        const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
            include: ["configuration.recipient", "requirements"],
        });

        const transfersStatus =
            account?.configuration?.recipient?.capabilities?.stripe_balance
                ?.stripe_transfers?.status;
        const readyToReceivePayments = transfersStatus === "active";

        const requirementsStatus =
            account?.requirements?.summary?.minimum_deadline?.status;
        const onboardingComplete =
            requirementsStatus !== "currently_due" &&
            requirementsStatus !== "past_due";

        // Augment with our local cache so the UI can display the friendly
        // display name + contact email we collected up-front.
        const local = store.getAccount(accountId);

        return res.json({
            accountId,
            displayName: local?.displayName ?? account.display_name ?? null,
            contactEmail: local?.contactEmail ?? account.contact_email ?? null,
            readyToReceivePayments,
            onboardingComplete,
            requirementsStatus: requirementsStatus ?? null,
            transfersStatus: transfersStatus ?? null,
        });
    } catch (err) {
        console.error("[/api/accounts/:id/status] error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/products
// Platform-level product creation. Per the brief we DO NOT create products
// on the connected account; we keep them on the platform and tag them with
// `metadata.connected_account_id` so checkout can route the payment.
// ---------------------------------------------------------------------------
app.post("/api/products", async (req, res) => {
    const { name, description, priceInCents, currency, accountId } =
        req.body || {};

    if (!name || !priceInCents || !currency || !accountId) {
        return res.status(400).json({
            error: "name, priceInCents, currency and accountId are required",
        });
    }

    const account = store.getAccount(accountId);
    if (!account) {
        return res
            .status(404)
            .json({ error: `Unknown accountId ${accountId} (not in local store)` });
    }

    try {
        const product = await stripeClient.products.create({
            name,
            description: description || undefined,
            default_price_data: {
                unit_amount: priceInCents,
                currency,
            },
            // Store the connected_account_id ON the product so we can survive
            // the local cache being deleted — a future `products.list` would
            // still let us reconstruct the storefront from Stripe alone.
            metadata: {
                connected_account_id: accountId,
            },
        });

        // `default_price` is returned as a string id when the price was created
        // alongside the product via `default_price_data`.
        const defaultPriceId =
            typeof product.default_price === "string"
                ? product.default_price
                : product.default_price?.id;

        const record = store.addProduct({
            productId: product.id,
            defaultPriceId,
            accountId,
            name,
            description: description ?? null,
            priceInCents,
            currency,
        });

        return res.json({ product: record });
    } catch (err) {
        console.error("[/api/products] create error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/products
// Storefront feed. Joins the local product cache with the local account cache
// so the UI can show "Product X by Seller Y".
// ---------------------------------------------------------------------------
app.get("/api/products", (_req, res) => {
    const accounts = new Map(store.listAccounts().map((a) => [a.id, a]));
    const items = store.listProducts().map((p) => {
        const seller = accounts.get(p.accountId) || null;
        return {
            ...p,
            sellerDisplayName: seller?.displayName ?? "Unknown seller",
            sellerContactEmail: seller?.contactEmail ?? null,
        };
    });
    return res.json({ products: items });
});

// ---------------------------------------------------------------------------
// POST /api/checkout
// Hosted Checkout Session using the Destination Charge model:
//   - The platform charges the buyer.
//   - `application_fee_amount` is kept by the platform.
//   - `transfer_data.destination` routes the rest to the connected account.
// ---------------------------------------------------------------------------
const APPLICATION_FEE_PCT = 10; // platform keeps 10%

app.post("/api/checkout", async (req, res) => {
    const { productId } = req.body || {};
    if (!productId) {
        return res.status(400).json({ error: "productId is required" });
    }

    const product = store.getProduct(productId);
    if (!product) {
        return res
            .status(404)
            .json({ error: `Unknown productId ${productId}` });
    }

    // 10% of the price, rounded — must be an integer in the product currency's
    // smallest unit (cents for USD).
    const applicationFee = Math.round(
        (product.priceInCents * APPLICATION_FEE_PCT) / 100,
    );

    try {
        const session = await stripeClient.checkout.sessions.create({
            mode: "payment",
            line_items: [
                {
                    // We can pass either `price: <priceId>` (preferred) or a
                    // full `price_data` object. We use the price id we already
                    // created on the platform.
                    price: product.defaultPriceId,
                    quantity: 1,
                },
            ],
            payment_intent_data: {
                application_fee_amount: applicationFee,
                transfer_data: {
                    destination: product.accountId,
                },
                // Useful when reconciling later — every payment will carry
                // these in the resulting PaymentIntent's metadata.
                metadata: {
                    sample: "stripe-connect-v2",
                    productId: product.productId,
                    connected_account_id: product.accountId,
                },
            },
            success_url: `${baseUrl(req)}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl(req)}/cancel.html`,
        });

        return res.json({ url: session.url });
    } catch (err) {
        console.error("[/api/checkout] error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// 5. Boot
// =============================================================================
app.listen(PORT, () => {
    console.log(
        `\n[stripe-connect-v2] Sample running at http://localhost:${PORT}`,
    );
    console.log("  - Open the URL above to onboard a seller or browse the storefront.");
    if (
        !process.env.STRIPE_WEBHOOK_SECRET ||
        process.env.STRIPE_WEBHOOK_SECRET.includes("REPLACE_ME")
    ) {
        console.log(
            "  - Heads-up: STRIPE_WEBHOOK_SECRET is not set; the /webhook route will return 503 until you configure it.",
        );
    }
    console.log("");
});
