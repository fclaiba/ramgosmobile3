/**
 * ConnectReturnScreen — destino de `ramgos://connect/return?mode=…` y
 * `ramgos://connect/refresh?mode=…` (Stripe vuelve acá al terminar o
 * abandonar el onboarding hosted).
 *
 * Cierra la sesión de auth del browser, relee el estado de la cuenta en
 * Stripe y manda al usuario a su dashboard.
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../contexts/AuthContext';
import { useConnectOnboarding } from '../hooks/useConnectOnboarding';
import type { PaymentMode } from '../contexts/PaymentModeContext';

export default function ConnectReturnScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const paramMode = route?.params?.mode;
    const mode: PaymentMode | undefined = paramMode === 'live' || paramMode === 'test' ? paramMode : undefined;
    const result: string = route?.params?.result ?? 'return';
    const { refresh } = useConnectOnboarding(mode ? { mode } : undefined);
    const done = useRef(false);

    useEffect(() => {
        if (done.current) return;
        done.current = true;
        try {
            WebBrowser.maybeCompleteAuthSession();
        } catch {}
        (async () => {
            await refresh();
            const role = (user as any)?.role;
            const target = role === 'influencer' ? 'InfluencerDashboard' : role === 'business' ? 'BusinessDashboard' : 'Home';
            navigation.reset({ index: 0, routes: [{ name: target }] });
        })();
    }, [refresh, navigation, user]);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator size="large" />
            <Text>{result === 'refresh' ? 'Actualizando el onboarding de Stripe…' : 'Verificando tu cuenta de pagos…'}</Text>
        </View>
    );
}
