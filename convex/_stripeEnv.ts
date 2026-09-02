/**
 * Resolución del entorno Stripe — módulo puro (sin imports de Convex ni del
 * SDK), testeable con jest.
 *
 * POR QUÉ EXISTE
 *
 * El backend es BI-MODAL: la app conserva el toggle test/live para QA, así
 * que conviven una cuenta Stripe en modo test y otra en modo live. Antes
 * cada módulo elegía su clave a mano (`stripe.ts` transfería con la de
 * test, `http.ts`/`connect.ts` leían con la live) y el resultado era que
 * un cobro hecho en un modo se intentaba liberar en el otro.
 *
 * Acá se decide UNA sola vez qué clave y qué secretos de webhook pertenecen
 * a cada modo. El modo de un pago se persiste en la fila (`payments.mode`,
 * `orders.mode`, `payouts.mode`) y todo lo posterior lo respeta.
 */

export type StripeMode = "test" | "live";

export const STRIPE_MODES: readonly StripeMode[] = ["test", "live"];

/** Modo que declara una secret/restricted key por su prefijo, o null. */
export function modeFromKey(key?: string | null): StripeMode | null {
    if (!key) return null;
    if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
    if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
    return null;
}

/** Modo que declara una publishable key por su prefijo, o null. */
export function modeFromPublishableKey(key?: string | null): StripeMode | null {
    if (!key) return null;
    if (key.startsWith("pk_test_")) return "test";
    if (key.startsWith("pk_live_")) return "live";
    return null;
}

export interface StripeEnvResolution {
    keys: Partial<Record<StripeMode, string>>;
    /** Secretos de firma de webhook por modo (snapshot + thin). */
    webhookSecrets: Record<StripeMode, string[]>;
    /** `ALLOW_STRIPE_MOCK=true`: habilita PaymentIntents/transfers simulados. */
    mockAllowed: boolean;
    /** Modos con secret key configurada. */
    availableModes: StripeMode[];
}

type Env = Record<string, string | undefined>;

const compact = (...values: Array<string | undefined>): string[] =>
    Array.from(new Set(values.filter((x): x is string => !!x && x.trim().length > 0)));

/**
 * Reglas:
 *   - `keys.test`  = STRIPE_SECRET_KEY_TEST, o STRIPE_SECRET_KEY si ésta es sk_test_.
 *   - `keys.live`  = STRIPE_SECRET_KEY sólo si es sk_live_ (nunca una de test).
 *   - secrets live = STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_THIN
 *                    (alias histórico: STRIPE_WEBHOOK_V2_SECRET), STRIPE_WEBHOOK_SECRET_CONNECT.
 *   - secrets test = STRIPE_WEBHOOK_SECRET_TEST, STRIPE_WEBHOOK_SECRET_THIN_TEST,
 *                    STRIPE_WEBHOOK_SECRET_CONNECT_TEST.
 */
export function resolveStripeEnv(env: Env): StripeEnvResolution {
    const primary = env.STRIPE_SECRET_KEY;
    const primaryMode = modeFromKey(primary);

    const keys: Partial<Record<StripeMode, string>> = {};
    const explicitTest = env.STRIPE_SECRET_KEY_TEST;
    if (explicitTest && modeFromKey(explicitTest) === "test") {
        keys.test = explicitTest;
    } else if (primaryMode === "test" && primary) {
        keys.test = primary;
    }
    if (primaryMode === "live" && primary) {
        keys.live = primary;
    }

    const webhookSecrets: Record<StripeMode, string[]> = {
        live: compact(
            env.STRIPE_WEBHOOK_SECRET,
            env.STRIPE_WEBHOOK_SECRET_LIVE,
            env.STRIPE_WEBHOOK_SECRET_THIN,
            env.STRIPE_WEBHOOK_V2_SECRET,
            env.STRIPE_WEBHOOK_SECRET_CONNECT,
        ),
        test: compact(
            env.STRIPE_WEBHOOK_SECRET_TEST,
            env.STRIPE_WEBHOOK_SECRET_THIN_TEST,
            env.STRIPE_WEBHOOK_SECRET_CONNECT_TEST,
        ),
    };

    // Si la única clave configurada es de test, los secretos "live" sin
    // sufijo pertenecen en realidad al modo test (setup de un solo modo).
    if (!keys.live && keys.test && webhookSecrets.test.length === 0) {
        webhookSecrets.test = webhookSecrets.live;
        webhookSecrets.live = [];
    }

    const availableModes = STRIPE_MODES.filter((m) => !!keys[m]);

    return {
        keys,
        webhookSecrets,
        mockAllowed: env.ALLOW_STRIPE_MOCK === "true",
        availableModes,
    };
}

/** PaymentIntents simulados (sólo con ALLOW_STRIPE_MOCK). */
export const MOCK_PI_PREFIX = "mock_pi_";

export function isMockPaymentIntentId(id?: string | null): boolean {
    return !!id && id.startsWith(MOCK_PI_PREFIX);
}

export function mockPaymentIntentId(cartId: string): string {
    return `${MOCK_PI_PREFIX}${cartId}`;
}

export function mockTransferId(orderId: string, kind: "seller" | "influencer"): string {
    return `mock_tr_${orderId}_${kind}`;
}

export function mockRefundId(orderId: string, n: number): string {
    return `mock_re_${orderId}_${n}`;
}

export function mockReversalId(orderId: string, kind: "seller" | "influencer", n: number): string {
    return `mock_trr_${orderId}_${kind}_${n}`;
}
