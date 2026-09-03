import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { modeFromPublishableKey } from '../../convex/_stripeEnv';
import { resolveEffectiveMode, type StoredMode } from '../payments/resolvePaymentMode';

export type PaymentMode = 'test' | 'live';

interface PaymentModeContextValue {
    mode: PaymentMode;
    isTest: boolean;
    isLive: boolean;
    toggle: () => void;
    setMode: (mode: PaymentMode) => void;
    stripePublishableKey: string | undefined;
    /** Modos con clave publicable en el app Y secret key en el backend. */
    availableModes: PaymentMode[];
    /** `ALLOW_STRIPE_MOCK=true` en Convex: el modo test puede simular pagos. */
    mockAllowed: boolean;
    /**
     * Si hay que hablar con Stripe de verdad. En modo test sin simulación
     * habilitada se cobra contra Stripe TEST con tarjetas 4242…; en live
     * siempre. Sólo con `mockAllowed` el modo test simula.
     */
    useRealStripe: boolean;
    /** El backend todavía no respondió qué modos tiene configurados. */
    configLoading: boolean;
}

const PaymentModeContext = createContext<PaymentModeContextValue>({
    mode: 'test',
    isTest: true,
    isLive: false,
    toggle: () => {},
    setMode: () => {},
    stripePublishableKey: undefined,
    availableModes: [],
    mockAllowed: false,
    useRealStripe: true,
    configLoading: true,
});

/**
 * v2: invalida a propósito el modo guardado por la versión anterior, que
 * escribía `'test'` en todos los dispositivos. Sin el bump, cualquiera que ya
 * hubiera abierto la app seguiría clavado en modo prueba aunque live esté
 * disponible — o sea, comprando sin que entre plata.
 */
const STORAGE_KEY = '@ramgos_payment_mode_v2';

/**
 * Claves publicables por modo.
 *
 * Explícitas: `EXPO_PUBLIC_STRIPE_KEY_TEST` / `EXPO_PUBLIC_STRIPE_KEY_LIVE`.
 * Fallback: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` o la legacy
 * `EXPO_PUBLIC_STRIPE_KEY`, asignadas al modo que declara su prefijo
 * (`pk_test_` → test, `pk_live_` → live). Nunca se cruza una clave de un
 * modo al otro.
 */
function resolvePublishableKeys(): Record<PaymentMode, string | undefined> {
    const keys: Record<PaymentMode, string | undefined> = {
        test: process.env.EXPO_PUBLIC_STRIPE_KEY_TEST || undefined,
        live: process.env.EXPO_PUBLIC_STRIPE_KEY_LIVE || undefined,
    };
    for (const candidate of [process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, process.env.EXPO_PUBLIC_STRIPE_KEY]) {
        const m = modeFromPublishableKey(candidate);
        if (m && !keys[m]) keys[m] = candidate;
    }
    for (const m of ['test', 'live'] as PaymentMode[]) {
        if (keys[m] && modeFromPublishableKey(keys[m]) !== m) {
            if (__DEV__) {
                console.warn(`[PaymentMode] La clave configurada para "${m}" no es pk_${m}_… Se ignora.`);
            }
            keys[m] = undefined;
        }
    }
    return keys;
}

export function PaymentModeProvider({ children }: { children: React.ReactNode }) {
    // `null` = sin leer todavía · `'none'` = leído, sin preferencia guardada.
    const [storedMode, setStoredMode] = useState<StoredMode>(null);
    const publishableKeys = useMemo(resolvePublishableKeys, []);
    const publicConfig = useQuery(api.stripe.getPublicConfig, {});

    // `null` = todavía no sabemos qué eligió este dispositivo. NO se cae a
    // 'test': el modo por defecto lo decide `mode` según lo que haya
    // disponible, y elegir 'test' acá haría que un usuario real pague en
    // modo prueba.
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                setStoredMode(stored === 'test' || stored === 'live' ? stored : 'none');
            } catch {
                setStoredMode('none');
            }
        })();
    }, []);

    const availableModes = useMemo<PaymentMode[]>(() => {
        const backend = publicConfig?.modes;
        return (['test', 'live'] as PaymentMode[]).filter(
            (m) => !!publishableKeys[m] && (backend ? backend[m] : true),
        );
    }, [publishableKeys, publicConfig]);

    // Default a `live` cuando está configurado. Ver `resolvePaymentMode.ts`.
    const mode: PaymentMode = useMemo(
        () => resolveEffectiveMode(storedMode, availableModes),
        [storedMode, availableModes],
    );

    const setMode = useCallback((newMode: PaymentMode) => {
        setStoredMode(newMode);
        AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
    }, []);

    const toggle = useCallback(() => {
        setMode(mode === 'test' ? 'live' : 'test');
    }, [mode, setMode]);

    const mockAllowed = !!publicConfig?.mockAllowed;
    const value: PaymentModeContextValue = {
        mode,
        isTest: mode === 'test',
        isLive: mode === 'live',
        toggle,
        setMode,
        stripePublishableKey: publishableKeys[mode],
        availableModes,
        mockAllowed,
        useRealStripe: mode === 'live' || !mockAllowed,
        configLoading: publicConfig === undefined || storedMode === null,
    };

    return <PaymentModeContext.Provider value={value}>{children}</PaymentModeContext.Provider>;
}

export function usePaymentMode() {
    return useContext(PaymentModeContext);
}
