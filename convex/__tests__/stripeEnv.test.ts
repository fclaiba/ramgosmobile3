import {
    isMockPaymentIntentId,
    modeFromKey,
    modeFromPublishableKey,
    mockTransferId,
    resolveStripeEnv,
} from "../_stripeEnv";

describe("modeFromKey", () => {
    it("detecta test/live por prefijo", () => {
        expect(modeFromKey("sk_test_abc")).toBe("test");
        expect(modeFromKey("sk_live_abc")).toBe("live");
        expect(modeFromKey("rk_live_abc")).toBe("live");
        expect(modeFromKey("whsec_x")).toBeNull();
        expect(modeFromKey(undefined)).toBeNull();
        expect(modeFromPublishableKey("pk_test_1")).toBe("test");
        expect(modeFromPublishableKey("pk_live_1")).toBe("live");
        expect(modeFromPublishableKey("sk_live_1")).toBeNull();
    });
});

describe("resolveStripeEnv", () => {
    it("sólo live", () => {
        const env = resolveStripeEnv({ STRIPE_SECRET_KEY: "sk_live_1", STRIPE_WEBHOOK_SECRET: "whsec_live" });
        expect(env.keys).toEqual({ live: "sk_live_1" });
        expect(env.availableModes).toEqual(["live"]);
        expect(env.webhookSecrets.live).toEqual(["whsec_live"]);
        expect(env.webhookSecrets.test).toEqual([]);
        expect(env.mockAllowed).toBe(false);
    });
    it("sólo test en STRIPE_SECRET_KEY: los secrets sin sufijo pasan a test", () => {
        const env = resolveStripeEnv({ STRIPE_SECRET_KEY: "sk_test_1", STRIPE_WEBHOOK_SECRET: "whsec_a" });
        expect(env.keys).toEqual({ test: "sk_test_1" });
        expect(env.availableModes).toEqual(["test"]);
        expect(env.webhookSecrets.test).toEqual(["whsec_a"]);
        expect(env.webhookSecrets.live).toEqual([]);
    });
    it("ambos modos, con thin secrets y alias V2", () => {
        const env = resolveStripeEnv({
            STRIPE_SECRET_KEY: "sk_live_1",
            STRIPE_SECRET_KEY_TEST: "sk_test_1",
            STRIPE_WEBHOOK_SECRET: "whsec_live",
            STRIPE_WEBHOOK_V2_SECRET: "whsec_live_thin",
            STRIPE_WEBHOOK_SECRET_TEST: "whsec_test",
            STRIPE_WEBHOOK_SECRET_THIN_TEST: "whsec_test_thin",
            ALLOW_STRIPE_MOCK: "true",
        });
        expect(env.availableModes).toEqual(["test", "live"]);
        expect(env.webhookSecrets.live).toEqual(["whsec_live", "whsec_live_thin"]);
        expect(env.webhookSecrets.test).toEqual(["whsec_test", "whsec_test_thin"]);
        expect(env.mockAllowed).toBe(true);
    });
    it("una sk_test_ en STRIPE_SECRET_KEY nunca sirve como live", () => {
        const env = resolveStripeEnv({ STRIPE_SECRET_KEY: "sk_test_1", STRIPE_SECRET_KEY_TEST: "sk_test_2" });
        expect(env.keys.live).toBeUndefined();
        expect(env.keys.test).toBe("sk_test_2");
    });
});

describe("ids simulados", () => {
    it("prefijos", () => {
        expect(isMockPaymentIntentId("mock_pi_cart1")).toBe(true);
        expect(isMockPaymentIntentId("pi_123")).toBe(false);
        expect(mockTransferId("o1", "seller")).toBe("mock_tr_o1_seller");
    });
});
