/**
 * ConnectReturnScreen — destino de `…/connect/return?mode=…` y
 * `…/connect/refresh?mode=…` (Stripe vuelve acá al terminar o abandonar el
 * onboarding hosted).
 *
 * Cierra la sesión de auth del browser, relee el estado de la cuenta en Stripe
 * y devuelve al usuario a donde estaba.
 *
 * Ojo con el timing: entrando por universal link con la app fría, este efecto
 * corre ANTES de que hidrate la sesión. La versión anterior armaba el latch en
 * el primer render, así que `refresh()` salía sin llamar a Stripe (no había
 * `sessionToken`), el latch impedía reintentar, y como `user.role` también era
 * undefined el `reset` depositaba al usuario en `Home`. Por eso acá se espera
 * a que `status` deje de ser 'loading' (E-148).
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../contexts/AuthContext';
import { useConnectOnboarding } from '../hooks/useConnectOnboarding';
import { consumeConnectReturnTarget } from '../hooks/connectReturnTarget';
import type { PaymentMode } from '../contexts/PaymentModeContext';

export default function ConnectReturnScreen({ navigation, route }: any) {
    const { user, sessionToken, status } = useAuth();
    const paramMode = route?.params?.mode;
    const mode: PaymentMode | undefined = paramMode === 'live' || paramMode === 'test' ? paramMode : undefined;
    const result: string = route?.params?.result ?? 'return';
    const { refresh, start } = useConnectOnboarding(mode ? { mode } : undefined);
    const done = useRef(false);
    const role = (user as any)?.role;

    useEffect(() => {
        if (done.current) return;
        // Todavía hidratando: no armar el latch ni decidir destino.
        if (status === 'loading') return;
        // Con sesión, esperamos también el rol: es lo que elige el dashboard.
        if (status === 'authenticated' && (!sessionToken || !role)) return;
        done.current = true;

        try {
            WebBrowser.maybeCompleteAuthSession();
        } catch {}

        (async () => {
            const dashboard =
                role === 'influencer'
                    ? 'InfluencerDashboard'
                    : role === 'business'
                      ? 'BusinessDashboard'
                      : 'Home';

            // Se consume una sola vez, acá arriba: `start()` lo vuelve a
            // guardar para el próximo retorno, así que leerlo después sería
            // una carrera contra el mount que abra el link nuevo.
            const target = consumeConnectReturnTarget();

            if (status === 'authenticated') {
                if (result === 'refresh') {
                    // Stripe manda al refresh_url cuando el account link venció
                    // o se recargó. Lo que espera es que generemos uno nuevo y
                    // lo reabramos, no que mostremos un spinner y sigamos.
                    await start(target ? { returnTo: target } : undefined);
                } else {
                    await refresh();
                }
            }

            if (target && target.screen !== dashboard) {
                navigation.reset({
                    index: 1,
                    routes: [{ name: dashboard }, { name: target.screen, params: target.params }],
                });
            } else {
                navigation.reset({ index: 0, routes: [{ name: dashboard }] });
            }
        })();
    }, [status, sessionToken, role, result, refresh, start, navigation]);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator size="large" />
            <Text>
                {result === 'refresh'
                    ? 'Reabriendo el onboarding de Stripe…'
                    : 'Verificando tu cuenta de pagos…'}
            </Text>
        </View>
    );
}
