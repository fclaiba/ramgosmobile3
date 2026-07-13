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

// Fase 5: la app opera SOLO en modo test hasta Bloque D (pagos live).
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
                // Fase 5: 'live' persistido de sesiones viejas se ignora hasta
                // Bloque D — la app queda clavada en test.
                if (stored === 'test') {
                    setModeState(stored);
                }
            } catch {}
        })();
    }, []);

    const setMode = useCallback((newMode: PaymentMode) => {
        // Fase 5: pagos live deshabilitados hasta Bloque D.
        const clamped: PaymentMode = newMode === 'live' ? 'test' : newMode;
        setModeState(clamped);
        AsyncStorage.setItem(STORAGE_KEY, clamped).catch(() => {});
    }, []);

    const toggle = useCallback(() => {
        // Fase 5: no hay modo live al que alternar; se mantiene test.
        setMode('test');
    }, [setMode]);

    const stripePublishableKey = mode === 'test'
        ? (process.env.EXPO_PUBLIC_STRIPE_KEY_TEST || process.env.EXPO_PUBLIC_STRIPE_KEY)
        : (process.env.EXPO_PUBLIC_STRIPE_KEY_LIVE || process.env.EXPO_PUBLIC_STRIPE_KEY);

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