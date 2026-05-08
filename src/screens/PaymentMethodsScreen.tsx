/**
 * PaymentMethodsScreen — manage saved Stripe cards.
 *
 * Architecture:
 *   - Lists saved cards via convex.action `stripe.listPaymentMethods`.
 *   - "Add card" → action `stripe.createSetupIntent` + Stripe SDK
 *     `initPaymentSheet({ setupIntentClientSecret })` → on success refreshes
 *     the list.
 *   - "Set default" → `stripe.setDefaultPaymentMethod`.
 *   - "Remove" → `stripe.detachPaymentMethod`.
 *
 * Notes:
 *   - We rely on the platform-level <StripeProvider> wrapper that already
 *     sets the publishable key — see `src/components/StripeWrapper.tsx`.
 *   - Stripe React Native is gated behind a development build (Expo Go has
 *     no native Stripe SDK). On unsupported runtimes, "Add card" surfaces a
 *     toast and bails out cleanly.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { CreditCard, Plus, Star, Trash2 } from 'lucide-react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

type PaymentMethod = {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
};

const brandLabel = (brand: string): string => {
    const b = brand.toLowerCase();
    if (b === 'visa') return 'Visa';
    if (b === 'mastercard') return 'Mastercard';
    if (b === 'amex') return 'American Express';
    return b.charAt(0).toUpperCase() + b.slice(1);
};

export default function PaymentMethodsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { user } = useAuth();
    const { show } = useToast();
    const stripe = useStripe();

    const _api = api as any;
    const listPaymentMethods = useAction(
        _api.stripe?.listPaymentMethods || api.users.syncUser,
    );
    const createSetupIntent = useAction(
        _api.stripe?.createSetupIntent || api.users.syncUser,
    );
    const detachPaymentMethod = useAction(
        _api.stripe?.detachPaymentMethod || api.users.syncUser,
    );
    const setDefaultPaymentMethod = useAction(
        _api.stripe?.setDefaultPaymentMethod || api.users.syncUser,
    );

    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [busyMethod, setBusyMethod] = useState<string | null>(null);

    const loadMethods = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = (await listPaymentMethods({
                actorId: user.id as any,
                userId: user.id as any,
            })) as { items: PaymentMethod[] };
            setMethods(res?.items ?? []);
        } catch (e: any) {
            show(e?.message ?? 'Error cargando tarjetas.', 'error');
        } finally {
            setLoading(false);
        }
    }, [user, listPaymentMethods, show]);

    useEffect(() => {
        loadMethods();
    }, [loadMethods]);

    const handleAddCard = async () => {
        if (!user) return;
        setAdding(true);
        try {
            const { clientSecret, isMock } = (await createSetupIntent({
                actorId: user.id as any,
                userId: user.id as any,
            })) as { clientSecret: string | null; isMock: boolean };

            if (!clientSecret) {
                show('No se pudo iniciar el alta de tarjeta.', 'error');
                return;
            }
            if (isMock) {
                show('Modo dev: tarjeta simulada agregada.', 'info');
                await loadMethods();
                return;
            }

            const { error: initError } = await stripe.initPaymentSheet({
                merchantDisplayName: 'Ramgos',
                setupIntentClientSecret: clientSecret,
                appearance: {
                    colors: {
                        primary: '#7C3AED',
                        background: isDark ? '#111827' : '#ffffff',
                        componentBackground: isDark ? '#1F2937' : '#f9fafb',
                        componentBorder: isDark ? '#374151' : '#e5e7eb',
                        primaryText: isDark ? '#f9fafb' : '#111827',
                        secondaryText: isDark ? '#9ca3af' : '#6b7280',
                    },
                    shapes: { borderRadius: 12, borderWidth: 1 },
                },
            });
            if (initError) {
                show(initError.message ?? 'Error preparando tarjeta.', 'error');
                return;
            }

            const { error } = await stripe.presentPaymentSheet();
            if (error) {
                if (error.code !== 'Canceled') {
                    show(error.message ?? 'Error agregando tarjeta.', 'error');
                }
                return;
            }
            show('Tarjeta agregada correctamente.', 'success');
            await loadMethods();
        } catch (e: any) {
            show(e?.message ?? 'Error agregando tarjeta.', 'error');
        } finally {
            setAdding(false);
        }
    };

    const handleSetDefault = async (pmId: string) => {
        if (!user) return;
        setBusyMethod(pmId);
        try {
            await setDefaultPaymentMethod({
                actorId: user.id as any,
                userId: user.id as any,
                paymentMethodId: pmId,
            });
            show('Tarjeta predeterminada actualizada.', 'success');
            await loadMethods();
        } catch (e: any) {
            show(e?.message ?? 'Error actualizando.', 'error');
        } finally {
            setBusyMethod(null);
        }
    };

    const handleDetach = (pmId: string) => {
        Alert.alert(
            'Eliminar tarjeta',
            '¿Querés eliminar esta tarjeta? Si la usabas para suscripciones, vas a tener que actualizar el método de pago.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        if (!user) return;
                        setBusyMethod(pmId);
                        try {
                            await detachPaymentMethod({
                                actorId: user.id as any,
                                userId: user.id as any,
                                paymentMethodId: pmId,
                            });
                            show('Tarjeta eliminada.', 'success');
                            await loadMethods();
                        } catch (e: any) {
                            show(e?.message ?? 'Error eliminando.', 'error');
                        } finally {
                            setBusyMethod(null);
                        }
                    },
                },
            ],
        );
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Métodos de pago"
                subtitle="Gestiona tus tarjetas guardadas"
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator color={isDark ? '#fff' : '#7C3AED'} />
                    </View>
                ) : methods.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <CreditCard size={40} color={isDark ? '#4B5563' : '#9CA3AF'} />
                        <Text style={styles.emptyTitle}>Sin tarjetas guardadas</Text>
                        <Text style={styles.emptySubtitle}>
                            Agregá una tarjeta para pagar más rápido en tus próximas compras.
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: 12 }}>
                        {methods.map((pm) => (
                            <View key={pm.id} style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.brandIcon}>
                                        <CreditCard size={20} color="#7C3AED" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.brandText}>
                                            {brandLabel(pm.brand)} •••• {pm.last4}
                                        </Text>
                                        <Text style={styles.expText}>
                                            Vence {String(pm.expMonth).padStart(2, '0')}/
                                            {String(pm.expYear).slice(-2)}
                                        </Text>
                                    </View>
                                    {pm.isDefault && (
                                        <View style={styles.defaultBadge}>
                                            <Star size={10} color="#fff" fill="#fff" />
                                            <Text style={styles.defaultText}>Por defecto</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.cardActions}>
                                    {!pm.isDefault && (
                                        <TouchableOpacity
                                            style={styles.actionBtn}
                                            disabled={busyMethod === pm.id}
                                            onPress={() => handleSetDefault(pm.id)}
                                        >
                                            <Text style={styles.actionText}>
                                                {busyMethod === pm.id
                                                    ? 'Actualizando...'
                                                    : 'Hacer predeterminada'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.actionBtn, styles.dangerBtn]}
                                        disabled={busyMethod === pm.id}
                                        onPress={() => handleDetach(pm.id)}
                                    >
                                        <Trash2 size={14} color="#EF4444" />
                                        <Text style={[styles.actionText, { color: '#EF4444' }]}>
                                            Eliminar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={handleAddCard}
                    disabled={adding}
                >
                    {adding ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Plus size={18} color="#fff" />
                            <Text style={styles.addBtnText}>Agregar tarjeta</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#111827' : '#F9FAFB',
        },
        content: {
            padding: 16,
            gap: 16,
        },
        loadingBox: {
            paddingVertical: 60,
            alignItems: 'center',
        },
        emptyBox: {
            paddingVertical: 60,
            alignItems: 'center',
            gap: 10,
        },
        emptyTitle: {
            color: isDark ? '#F3F4F6' : '#111827',
            fontSize: 16,
            fontWeight: '700',
            marginTop: 12,
        },
        emptySubtitle: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            fontSize: 13,
            textAlign: 'center',
            paddingHorizontal: 30,
            lineHeight: 18,
        },
        card: {
            backgroundColor: isDark ? '#1F2937' : '#fff',
            borderColor: isDark ? '#374151' : '#E5E7EB',
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            gap: 12,
        },
        cardHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        brandIcon: {
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE',
            alignItems: 'center',
            justifyContent: 'center',
        },
        brandText: {
            color: isDark ? '#F3F4F6' : '#111827',
            fontSize: 15,
            fontWeight: '700',
        },
        expText: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            fontSize: 12,
            marginTop: 2,
        },
        defaultBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: '#10B981',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
        },
        defaultText: {
            color: '#fff',
            fontSize: 10,
            fontWeight: '700',
        },
        cardActions: {
            flexDirection: 'row',
            gap: 8,
            paddingTop: 4,
            borderTopColor: isDark ? '#374151' : '#F3F4F6',
            borderTopWidth: 1,
        },
        actionBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: isDark ? '#374151' : '#F3F4F6',
        },
        dangerBtn: {
            backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEE2E2',
        },
        actionText: {
            color: isDark ? '#E5E7EB' : '#374151',
            fontSize: 13,
            fontWeight: '600',
        },
        addBtn: {
            backgroundColor: '#7C3AED',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderRadius: 12,
            marginTop: 8,
        },
        addBtnText: {
            color: '#fff',
            fontSize: 15,
            fontWeight: '700',
        },
    });
