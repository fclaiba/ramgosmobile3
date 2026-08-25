import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaymentMode = 'test' | 'live';

interface PaymentModeContextValue {
    mode: PaymentMode;
    isTest: boolean;
    isLive: boolean;
    toggle: () => void;
    setMode: (mode: PaymentMode) => void;
    stripePublishableKey: string | undefined;
}

const PaymentModeContext = createContext<PaymentModeContextValue>({
    mode: 'test',
    isTest: true,
    isLive: false,
    toggle: () => {},
    setMode: () => {},
    stripePublishableKey: undefined,
});

const STORAGE_KEY = '@ramgos_payment_mode';

export function PaymentModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<PaymentMode>('test');

    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored === 'test' || stored === 'live') {
                    setModeState(stored);
                }
            } catch {}
        })();
    }, []);

    const setMode = useCallback((newMode: PaymentMode) => {
        setModeState(newMode);
        AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
    }, []);

    const toggle = useCallback(() => {
        setMode(mode === 'test' ? 'live' : 'test');
    }, [mode, setMode]);

    // Antes, `EXPO_PUBLIC_STRIPE_KEY` (sin sufijo) era el fallback de LOS DOS
    // modos: si alguien la configuraba con una `pk_live_...`, el modo "test"
    // cobraba de verdad sin que nada lo avisara. Cada modo exige ahora su
    // variable explícita — sin fallback cruzado.
    const stripePublishableKey = mode === 'test'
        ? process.env.EXPO_PUBLIC_STRIPE_KEY_TEST
        : process.env.EXPO_PUBLIC_STRIPE_KEY_LIVE;

    if (__DEV__ && stripePublishableKey) {
        const expectedPrefix = mode === 'test' ? 'pk_test_' : 'pk_live_';
        if (!stripePublishableKey.startsWith(expectedPrefix)) {
            console.warn(
                `[PaymentMode] La clave configurada para modo "${mode}" no empieza con "${expectedPrefix}". ` +
                    'Revisá EXPO_PUBLIC_STRIPE_KEY_TEST / EXPO_PUBLIC_STRIPE_KEY_LIVE.',
            );
        }
    }

    const value: PaymentModeContextValue = {
        mode,
        isTest: mode === 'test',
        isLive: mode === 'live',
        toggle,
        setMode,
        stripePublishableKey,
    };

    return (
        <PaymentModeContext.Provider value={value}>
            {children}
        </PaymentModeContext.Provider>
    );
}

export function usePaymentMode() {
    return useContext(PaymentModeContext);
}