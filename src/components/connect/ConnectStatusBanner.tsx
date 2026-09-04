/**
 * ConnectStatusBanner — estado de la cuenta de Stripe Connect + su CTA.
 *
 * Fuente única del branching. Antes cada pantalla lo resolvía a mano y el
 * dashboard de Influencer lo resolvía MAL: ramificaba por "¿existe
 * accountId?", y como `ensureConnectAccount` persiste la cuenta antes de que
 * el usuario complete el formulario, quien cancelaba en Stripe se quedaba sin
 * botón para reintentar, para siempre (E-148).
 *
 *   variant='banner' → fila compacta, para los dashboards.
 *   variant='card'   → bloque con botones, para la pantalla de saldo. Incluye
 *                      un "Actualizar estado" permanente: es la salida cuando
 *                      el onboarding quedó a medias.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CheckCircle2, Clock, CreditCard, ExternalLink, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Radius, colors } from '../../theme/tokens';
import { Skeleton } from '../ui/skeleton';
import type { ConnectPhase, ConnectStartResult, useConnectOnboarding } from '../../hooks/useConnectOnboarding';
import type { ConnectReturnTarget } from '../../hooks/connectReturnTarget';

type Connect = ReturnType<typeof useConnectOnboarding>;

type Props = {
    connect: Connect;
    variant?: 'banner' | 'card';
    /** Adónde volver al terminar el onboarding (ver connectReturnTarget). */
    returnTo?: ConnectReturnTarget;
    onStarted?: (result: ConnectStartResult) => void;
    onRefreshed?: () => void;
    containerStyle?: any;
};

type Palette = { border: string; bg: string; icoBg: string; text: string; desc: string };

const paletteFor = (phase: ConnectPhase, isDark: boolean): Palette => {
    if (phase === 'ready') {
        return {
            border: isDark ? '#064E3B' : '#A7F3D0',
            bg: isDark ? 'rgba(5,150,105,0.15)' : '#ECFDF5',
            icoBg: isDark ? '#065F46' : '#D1FAE5',
            text: isDark ? '#6EE7B7' : '#065F46',
            desc: isDark ? '#A7F3D0' : '#047857',
        };
    }
    if (phase === 'pending' || phase === 'review') {
        return {
            border: isDark ? '#78350F' : '#FEF3C7',
            bg: isDark ? 'rgba(120,53,15,0.15)' : '#FFFBEB',
            icoBg: isDark ? '#92400E' : '#FDE68A',
            text: isDark ? '#FCD34D' : '#92400E',
            desc: isDark ? '#FDE68A' : '#B45309',
        };
    }
    if (phase === 'unconfigured') {
        const c = colors(isDark);
        return {
            border: c.glassBorder,
            bg: c.glass,
            icoBg: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
            text: c.textSecondary,
            desc: c.textMuted,
        };
    }
    return {
        border: isDark ? '#1E3A5F' : '#BFDBFE',
        bg: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF',
        icoBg: isDark ? '#1E40AF' : '#DBEAFE',
        text: isDark ? '#93C5FD' : '#1D4ED8',
        desc: isDark ? '#BFDBFE' : '#1E40AF',
    };
};

const titleFor = (phase: ConnectPhase): string => {
    switch (phase) {
        case 'ready':
            return 'Cuenta de pagos lista';
        case 'review':
            return 'Stripe está revisando tu cuenta';
        case 'pending':
            return 'Te falta terminar el onboarding';
        case 'unconfigured':
            return 'Pagos no configurados';
        default:
            return 'Conectar cuenta de pagos';
    }
};

const descFor = (phase: ConnectPhase, accountId: string | null, mode: string): string => {
    switch (phase) {
        case 'ready':
            return `Stripe Connect activo · ${accountId ? `${accountId.slice(0, 16)}…` : ''}`;
        case 'review':
            return 'Stripe está revisando tus datos. Te avisamos apenas quede habilitada.';
        case 'pending':
            return 'Faltan datos para activar tus cobros. Podés continuar donde lo dejaste.';
        case 'unconfigured':
            return `Los pagos no están configurados en modo "${mode}".`;
        default:
            return 'Vinculá tu cuenta bancaria para recibir tus pagos vía Stripe Connect.';
    }
};

/** `none`/`pending` abren Stripe; `review` sólo relee; `ready` no ofrece nada. */
const ctaFor = (phase: ConnectPhase): { label: string; action: 'start' | 'refresh' } | null => {
    switch (phase) {
        case 'none':
            return { label: 'Conectar cuenta de pagos', action: 'start' };
        case 'pending':
            return { label: 'Continuar onboarding', action: 'start' };
        case 'review':
            return { label: 'Actualizar estado', action: 'refresh' };
        default:
            return null;
    }
};

export function ConnectStatusBanner({
    connect,
    variant = 'banner',
    returnTo,
    onStarted,
    onRefreshed,
    containerStyle,
}: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const [refreshing, setRefreshing] = useState(false);

    const { phase } = connect;

    // Mientras la query reactiva no respondió NO se muestra "no tenés cuenta":
    // ese flash es lo que hacía creer que la conexión se había perdido.
    if (phase === 'loading') {
        return <Skeleton style={[styles.skeleton, containerStyle]} />;
    }

    const palette = paletteFor(phase, isDark);
    const title = titleFor(phase);
    const desc = descFor(phase, connect.accountId, connect.mode);
    const cta = ctaFor(phase);
    const Icon = phase === 'ready' ? CheckCircle2 : phase === 'review' ? Clock : phase === 'unconfigured' ? AlertCircle : CreditCard;

    const handleStart = async () => {
        const result = await connect.start(returnTo ? { returnTo } : undefined);
        if (result.outcome === 'error' || result.outcome === 'unauthenticated') {
            show(result.message || 'No se pudo abrir el onboarding de Stripe.', 'error');
        } else if (result.ready) {
            show('Tu cuenta de pagos quedó habilitada.', 'success');
        } else {
            show('El onboarding quedó a medias. Podés continuarlo cuando quieras.', 'info');
        }
        onStarted?.(result);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const result = await connect.refresh();
            if (!result.ok) {
                show(result.message || 'No pudimos verificar tu cuenta.', 'error');
            } else if (result.status?.canPayout) {
                show('Tu cuenta de pagos está habilitada.', 'success');
            } else {
                show('Stripe todavía no habilitó tus cobros.', 'info');
            }
            onRefreshed?.();
        } finally {
            setRefreshing(false);
        }
    };

    const busy = connect.loading || refreshing;

    if (variant === 'banner') {
        return (
            <TouchableOpacity
                activeOpacity={cta ? 0.85 : 1}
                onPress={cta ? (cta.action === 'start' ? handleStart : handleRefresh) : undefined}
                disabled={!cta || busy}
                style={[styles.banner, { borderColor: palette.border, backgroundColor: palette.bg }, containerStyle]}
            >
                <View style={[styles.icon, { backgroundColor: palette.icoBg }]}>
                    <Icon size={18} color={palette.text} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={[styles.desc, { color: palette.desc }]} numberOfLines={2}>
                        {desc}
                    </Text>
                </View>
                {busy ? (
                    <ActivityIndicator size="small" color={palette.text} />
                ) : (
                    cta && <ExternalLink size={18} color={palette.text} />
                )}
            </TouchableOpacity>
        );
    }

    return (
        <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.bg }, containerStyle]}>
            <View style={styles.cardHeader}>
                <View style={[styles.icon, { backgroundColor: palette.icoBg }]}>
                    <Icon size={18} color={palette.text} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
                    <Text style={[styles.desc, { color: palette.desc }]}>{desc}</Text>
                </View>
            </View>

            <View style={styles.actions}>
                {cta && (
                    <TouchableOpacity
                        onPress={cta.action === 'start' ? handleStart : handleRefresh}
                        disabled={busy}
                        style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    >
                        {connect.loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.primaryBtnText}>{cta.label}</Text>
                        )}
                    </TouchableOpacity>
                )}
                {/* Salida permanente: si el estado quedó desincronizado (volviste
                    de Stripe y la app no se enteró), esto lo vuelve a leer. */}
                {phase !== 'unconfigured' && (
                    <TouchableOpacity
                        onPress={handleRefresh}
                        disabled={busy}
                        style={[styles.secondaryBtn, { borderColor: palette.border }, busy && styles.btnDisabled]}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color={palette.text} />
                        ) : (
                            <>
                                <RefreshCw size={14} color={palette.text} />
                                <Text style={[styles.secondaryBtnText, { color: palette.text }]}>Actualizar estado</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        skeleton: { height: 76, borderRadius: Radius.md, marginBottom: 12 },
        banner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderWidth: 1,
            borderRadius: Radius.md,
        },
        card: {
            padding: 16,
            borderWidth: 1,
            borderRadius: Radius.lg,
            gap: 14,
        },
        cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
        icon: {
            width: 36,
            height: 36,
            borderRadius: Radius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        title: { fontWeight: '800', fontSize: 15 },
        desc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
        actions: { gap: 10 },
        primaryBtn: {
            backgroundColor: c.primary,
            paddingVertical: 13,
            borderRadius: Radius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        primaryBtnText: { color: '#FAFAFA', fontWeight: '700', fontSize: 15 },
        secondaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 11,
            borderRadius: Radius.md,
            borderWidth: 1,
        },
        secondaryBtnText: { fontWeight: '700', fontSize: 14 },
        btnDisabled: { opacity: 0.6 },
    });
};
