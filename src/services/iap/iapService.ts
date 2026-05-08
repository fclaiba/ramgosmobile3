/**
 * src/services/iap/iapService.ts — react-native-iap (v15+) wrapper for Ramgos.
 *
 * What this owns:
 *   - Initializing the native IAP connection on iOS / Android.
 *   - Fetching subscription products (so the UI shows the localized price).
 *   - Triggering a purchase and returning the resolved transaction.
 *   - Restoring previous purchases (App Store / Play Store).
 *   - Acknowledging / finishing the transaction so the store stops billing.
 *
 * What this does NOT own:
 *   - Receipt validation. The receipt MUST be validated server-side via
 *     `convex/iapActions.ts:validateAppleReceipt` / `validateGoogleReceipt`.
 *     Until the backend confirms the receipt is real, we MUST NOT mark the
 *     user as `pro` in our database.
 *
 * Notes:
 *   - `react-native-iap` ships native code → it WILL NOT WORK in Expo Go.
 *     A development client (`eas build --profile development`) is required.
 *   - All store interactions are wrapped in try/finally to guarantee we
 *     always end the connection cleanly when callers don't care anymore.
 *   - SKU mapping lives at the bottom; keep App Store Connect /
 *     Play Console product IDs in sync with this file.
 */

import { Platform } from 'react-native';
import type { Product, Purchase, PurchaseError } from 'react-native-iap';

// We import lazily so that bundlers shipping this file to web (or to dev
// runtimes that don't ship the native module) don't crash at import time.
// All public methods short-circuit on web with isIapSupported() === false.
let RNIap: any = null;
const loadRNIap = (): any => {
    if (RNIap) return RNIap;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        RNIap = require('react-native-iap');
        return RNIap;
    } catch (err) {
        console.warn(
            '[IAP] react-native-iap could not be loaded — likely running in Expo Go.',
            err,
        );
        return null;
    }
};

export const isIapSupported = (): boolean => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
    return loadRNIap() !== null;
};

// ---------------------------------------------------------------------------
// SKU configuration. These IDs MUST match the products you create in
// App Store Connect (iOS) and Google Play Console (Android). To keep
// platforms in sync we use the same logical key on both stores.
// ---------------------------------------------------------------------------
export type IapSubscriptionTier = 'pro';

export const IAP_SKUS: Record<IapSubscriptionTier, { ios: string; android: string }> = {
    pro: {
        ios: 'pro_monthly',
        android: 'pro_monthly',
    },
};

const skuFor = (tier: IapSubscriptionTier): string => {
    const entry = IAP_SKUS[tier];
    return Platform.OS === 'ios' ? entry.ios : entry.android;
};

// ---------------------------------------------------------------------------
// Connection lifecycle.
// ---------------------------------------------------------------------------
let connectionInitialized = false;

export const initIapConnection = async (): Promise<boolean> => {
    const lib = loadRNIap();
    if (!lib) return false;
    if (connectionInitialized) return true;
    try {
        await lib.initConnection();
        connectionInitialized = true;
        return true;
    } catch (err) {
        console.error('[IAP] initConnection failed:', err);
        connectionInitialized = false;
        return false;
    }
};

export const endIapConnection = async (): Promise<void> => {
    const lib = loadRNIap();
    if (!lib || !connectionInitialized) return;
    try {
        await lib.endConnection();
    } catch (err) {
        console.warn('[IAP] endConnection:', err);
    } finally {
        connectionInitialized = false;
    }
};

// ---------------------------------------------------------------------------
// Product / subscription discovery (react-native-iap v15+ API).
// ---------------------------------------------------------------------------
export const fetchSubscriptions = async (
    tiers: IapSubscriptionTier[] = ['pro'],
): Promise<Product[]> => {
    const lib = loadRNIap();
    if (!lib) return [];
    await initIapConnection();
    const skus = tiers.map(skuFor);
    try {
        return await lib.fetchProducts({ skus, type: 'subs' });
    } catch (err) {
        console.error('[IAP] fetchProducts(subs) failed:', err);
        return [];
    }
};

export const fetchProductsBySku = async (skus: string[]): Promise<Product[]> => {
    const lib = loadRNIap();
    if (!lib) return [];
    await initIapConnection();
    try {
        return await lib.fetchProducts({ skus, type: 'in-app' });
    } catch (err) {
        console.error('[IAP] fetchProducts(in-app) failed:', err);
        return [];
    }
};

// ---------------------------------------------------------------------------
// Purchase flow.
// ---------------------------------------------------------------------------
export type IapPurchaseResult = {
    sku: string;
    transactionId: string;
    transactionReceipt?: string; // iOS base64 receipt (legacy StoreKit1)
    jwsRepresentationIos?: string; // iOS JWS (StoreKit2)
    purchaseToken?: string; // Android purchase token
    raw: Purchase;
};

const normalizePurchase = (purchase: Purchase): IapPurchaseResult => {
    const p: any = purchase;
    return {
        sku: String(p.productId ?? p.sku ?? ''),
        transactionId: String(p.transactionId ?? p.purchaseToken ?? ''),
        transactionReceipt: p.transactionReceipt as string | undefined,
        jwsRepresentationIos: (p.jwsRepresentationIos ?? p.purchaseToken) as string | undefined,
        purchaseToken: p.purchaseToken as string | undefined,
        raw: purchase,
    };
};

/**
 * Trigger a subscription purchase. Resolves with the purchase payload that
 * MUST be sent to the backend for validation BEFORE granting any features.
 *
 * Implementation note: react-native-iap v15+ delivers purchases through a
 * listener (`purchaseUpdatedListener`) — `requestPurchase` itself returns
 * void / a stub. To present a request/response interface we set up a
 * one-shot listener around the purchase request that resolves on the next
 * matching purchase or rejects on the next purchase error.
 */
export const requestSubscription = async (
    tier: IapSubscriptionTier,
): Promise<IapPurchaseResult> => {
    const lib = loadRNIap();
    if (!lib) {
        throw new Error('IAP no disponible en este entorno (requiere development build).');
    }
    await initIapConnection();
    const sku = skuFor(tier);

    return await new Promise<IapPurchaseResult>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            try {
                purchaseSub.remove();
            } catch { }
            try {
                errorSub.remove();
            } catch { }
        };

        const purchaseSub = lib.purchaseUpdatedListener((purchase: Purchase) => {
            if (settled) return;
            const p: any = purchase;
            const sameSku =
                p.productId === sku ||
                p.sku === sku ||
                (Array.isArray(p.productIds) && p.productIds.includes(sku));
            if (!sameSku) return;
            settled = true;
            cleanup();
            resolve(normalizePurchase(purchase));
        });
        const errorSub = lib.purchaseErrorListener((error: PurchaseError) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error((error as any)?.message ?? 'Compra cancelada o falló.'));
        });

        try {
            const requestArg =
                Platform.OS === 'ios'
                    ? { request: { apple: { sku } }, type: 'subs' }
                    : {
                          request: {
                              google: {
                                  skus: [sku],
                                  // offerToken is required on Android subscriptions; passing
                                  // empty selects the default offer for the SKU.
                                  subscriptionOffers: [{ sku, offerToken: '' }],
                              },
                          },
                          type: 'subs',
                      };

            Promise.resolve(lib.requestPurchase(requestArg)).catch((err: any) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
            });
        } catch (err) {
            settled = true;
            cleanup();
            reject(err);
        }
    });
};

/**
 * Tells the store the purchase is delivered so it stops billing or
 * returning the same purchase to listeners. Call AFTER the backend has
 * persisted the receipt.
 */
export const finishPurchase = async (
    purchase: IapPurchaseResult,
    isConsumable = false,
): Promise<void> => {
    const lib = loadRNIap();
    if (!lib) return;
    try {
        await lib.finishTransaction({
            purchase: purchase.raw as any,
            isConsumable,
        });
    } catch (err) {
        console.warn('[IAP] finishTransaction failed:', err);
    }
};

/**
 * Returns purchases the user has previously made (Apple "restore" flow,
 * Android "active subscriptions" query). Caller should batch-validate
 * each one with the backend.
 */
export const restorePurchases = async (): Promise<IapPurchaseResult[]> => {
    const lib = loadRNIap();
    if (!lib) return [];
    await initIapConnection();
    try {
        const purchases: Purchase[] = await lib.getAvailablePurchases({
            onlyIncludeActiveItemsIOS: true,
        });
        return purchases.map(normalizePurchase);
    } catch (err) {
        console.error('[IAP] getAvailablePurchases failed:', err);
        return [];
    }
};
