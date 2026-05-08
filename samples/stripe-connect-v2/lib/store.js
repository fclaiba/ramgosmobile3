/**
 * Tiny JSON-file persistence for the sample.
 *
 * In a real app this would be Postgres / SQLite / Convex / etc. For a
 * standalone sample we keep things dependency-free: a single JSON file at
 * `data/store.json`, read into memory on startup, written back on every
 * mutation.
 *
 * What we persist:
 *   - accounts:  the mapping from "user" (display name + contact email) to the
 *                V2 connected account id we just created. The Stripe API is
 *                still the source of truth for capability/requirements status
 *                (the dashboard calls `accounts.retrieve` live, never reads
 *                this cache).
 *   - products:  a denormalized cache of products we created at the platform
 *                level along with the `accountId` they belong to. We ALSO put
 *                `connected_account_id` in the Stripe product `metadata` so
 *                the mapping survives even if `data/store.json` is wiped.
 *
 * Concurrency note: Node is single-threaded for JS code, and our writes are
 * synchronous. That's enough for a sample. Don't reuse this in production.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const EMPTY_STATE = { accounts: [], products: [] };

/** Load the store from disk. Returns EMPTY_STATE if the file doesn't exist or is invalid. */
function load() {
    try {
        if (!fs.existsSync(STORE_PATH)) return { ...EMPTY_STATE };
        const raw = fs.readFileSync(STORE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        return {
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            products: Array.isArray(parsed.products) ? parsed.products : [],
        };
    } catch (err) {
        console.warn(
            `[store] Could not read ${STORE_PATH}, starting fresh:`,
            err.message,
        );
        return { ...EMPTY_STATE };
    }
}

/** Persist the in-memory state to disk. */
function persist() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

const state = load();

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Persist a newly created connected account locally so the dashboard knows
 * which display name / contact email belongs to it.
 */
function addAccount({ id, displayName, contactEmail }) {
    const record = {
        id,
        displayName,
        contactEmail,
        createdAt: new Date().toISOString(),
    };
    // Replace if already exists (idempotent for re-runs).
    const idx = state.accounts.findIndex((a) => a.id === id);
    if (idx >= 0) state.accounts[idx] = record;
    else state.accounts.push(record);
    persist();
    return record;
}

function getAccount(id) {
    return state.accounts.find((a) => a.id === id) || null;
}

function listAccounts() {
    return [...state.accounts];
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Cache a product we created via the platform Products API along with the
 * connected account it belongs to. We use this to power the storefront list
 * without re-paginating Stripe.
 */
function addProduct({
    productId,
    defaultPriceId,
    accountId,
    name,
    description,
    priceInCents,
    currency,
}) {
    const record = {
        productId,
        defaultPriceId,
        accountId,
        name,
        description,
        priceInCents,
        currency,
        createdAt: new Date().toISOString(),
    };
    state.products.push(record);
    persist();
    return record;
}

function listProducts() {
    return [...state.products];
}

function getProduct(productId) {
    return state.products.find((p) => p.productId === productId) || null;
}

module.exports = {
    addAccount,
    getAccount,
    listAccounts,
    addProduct,
    listProducts,
    getProduct,
};
