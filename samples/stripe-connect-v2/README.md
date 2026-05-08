# Stripe Connect V2 sample

A standalone, runnable sample showing the full Stripe Connect **V2** flow:

- Create connected accounts via `v2.core.accounts.create` (no top-level `type`, uses `dashboard: "express"` and the recipient configuration).
- Onboard accounts via `v2.core.accountLinks.create`.
- Read live status via `v2.core.accounts.retrieve` (no DB cache).
- Receive V2 **thin** webhooks (`v2.core.account[requirements].updated` and `v2.core.account[configuration.recipient].capability_status_updated`) via `parseThinEvent` + `v2.core.events.retrieve`.
- Create products at the platform level and tag the connected account in `metadata`.
- Display every product in a multi-seller storefront.
- Accept payment via hosted Checkout using a **Destination Charge** (`payment_intent_data.transfer_data.destination` + `application_fee_amount`).

This sample is **completely isolated** from the rest of the repository (no React Native, no Convex). You can copy it out into another folder and run it standalone.

---

## Prerequisites

- Node.js **>= 18.17** (uses `fetch`, no extra polyfills)
- A Stripe **test-mode** account: <https://dashboard.stripe.com/register>
- (Optional, for webhooks) The Stripe CLI: <https://docs.stripe.com/stripe-cli>

---

## Setup

```bash
cd samples/stripe-connect-v2
cp .env.example .env
# Open .env and replace STRIPE_SECRET_KEY with your sk_test_... value
npm install
npm start
```

Then open <http://localhost:4242>.

If you forget to set `STRIPE_SECRET_KEY`, the server prints a helpful error and exits before doing anything.

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Test secret key from <https://dashboard.stripe.com/test/apikeys>. Must start with `sk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | Only for `/webhook` | Printed by `stripe listen`, or copied from a webhook destination in the dashboard. The route returns `503` until this is set so the rest of the demo stays usable. |
| `PORT` | No | Defaults to `4242`. |

---

## End-to-end flow

1. Open <http://localhost:4242>.
2. **Become a seller** form -> creates a V2 connected account, redirects to the dashboard.
3. Click **Onboard to collect payments** -> opens the Stripe-hosted onboarding (Express dashboard).
4. After onboarding finishes, you return to the dashboard. The status badge updates to **Ready to receive payments** once `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === "active"`.
5. Create a product (form on the dashboard).
6. Open the **Storefront** and click **Buy**. Use any Stripe test card such as `4242 4242 4242 4242`.
7. After successful payment you land on `/success.html`. The Checkout used a destination charge that splits funds: 10% application fee to the platform, the remainder transferred to the connected account.

---

## Webhooks (V2 thin events)

In a second terminal, run:

```bash
stripe listen \
  --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' \
  --forward-thin-to http://localhost:4242/webhook
```

Copy the printed `whsec_...` value into your `.env` as `STRIPE_WEBHOOK_SECRET` and restart `npm start`.

The handler in [server.js](server.js):

1. Verifies the signature with `stripeClient.parseThinEvent(req.body, sig, webhookSecret)`.
2. Calls `stripeClient.v2.core.events.retrieve(thinEvent.id)` to load the full event payload.
3. Dispatches on `event.type` and re-fetches the connected account with the right `include` to log the relevant change.

To configure a real webhook destination (not local dev), follow these steps in your Stripe dashboard:

1. Open Developers -> Webhooks -> **+ Add destination**.
2. In **Events from**, select **Connected accounts**.
3. **Show advanced options** -> Payload style: **Thin**.
4. Search for `v2` and add:
   - `v2.core.account[requirements].updated`
   - `v2.core.account[configuration.recipient].capability_status_updated`

---

## File layout

```
samples/stripe-connect-v2/
  README.md             this file
  package.json
  .env.example
  .gitignore
  server.js             Express server, all API + webhook routes
  lib/
    stripeClient.js     singleton Stripe client (with helpful missing-key error)
    store.js            tiny JSON-file persistence for accounts + product cache
  public/
    styles.css          shared styling, palette borrowed from the host app
    index.html          landing: become a seller / browse storefront
    dashboard.html      seller dashboard: status, onboarding, product creation
    storefront.html     buyer storefront: list every product, click to checkout
    success.html        post-checkout confirmation
    cancel.html         post-cancel page
  data/
    store.json          auto-created at runtime (gitignored)
```

---

## How the V2 connected-account shape is set

We use exactly the structure required for a platform that collects fees and absorbs losses, with the seller as a recipient that can receive `stripe_balance` transfers:

```js
const account = await stripeClient.v2.core.accounts.create({
    display_name: displayName,
    contact_email: contactEmail,
    identity: { country: "us" },
    dashboard: "express",
    defaults: {
        responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
        },
    },
    configuration: {
        recipient: {
            capabilities: {
                stripe_balance: {
                    stripe_transfers: { requested: true },
                },
            },
        },
    },
});
```

There is **no top-level `type`** field. (Don't use `type: "express"` / `"standard"` / `"custom"` here -- those are V1.)

---

## Reset

To wipe local state (you will lose the account/product cache, but Stripe still has them):

```bash
rm data/store.json
```
