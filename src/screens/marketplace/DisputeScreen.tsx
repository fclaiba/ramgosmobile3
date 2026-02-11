import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { MobileHeader } from '../../components/MobileHeader';
import {
    AlertTriangle,
    Camera,
    ShieldCheck,
    Eye,
    Package,
    HeartCrack,
    HelpCircle,
    BadgeAlert,
    CheckCircle2,
    MessageSquare,
    Upload,
    FileImage,
    XCircle,
    ChevronRight,
} from 'lucide-react-native';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { useToast } from '../../contexts/ToastContext';
import { EscrowSheet } from '../../components/marketplace/EscrowSheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';

// Use a local interface to avoid import issues if the global one is complex
interface DisputeScreenProps {
    navigation: any;
    route: {
        params?: {
            orderId?: string;
            prefillReason?: string;
            prefillDescription?: string;
        };
    };
}

const REASONS = [
    { label: 'Producto no recibido', code: 'not_received', Icon: Package, description: 'No llegó el pedido en el plazo acordado' },
    { label: 'Producto dañado', code: 'damaged', Icon: HeartCrack, description: 'Llegó roto, defectuoso o en mal estado' },
    { label: 'No es lo que pedí', code: 'not_as_described', Icon: HelpCircle, description: 'Diferente a las fotos o descripción' },
    { label: 'Faltan piezas', code: 'missing_parts', Icon: BadgeAlert, description: 'Incompleto o sin accesorios prometidos' },
    { label: 'Producto falso', code: 'counterfeit', Icon: AlertTriangle, description: 'Réplica o imitación no autorizada' },
] as const;

export default function DisputeScreen({ navigation, route }: DisputeScreenProps) {
    // 1. Safe Params Access
    const params = route?.params || {};
    const orderId = params.orderId;

    // 2. Context Access (Defensive)
    const marketplace = useMarketplace();
    const { user } = useAuth();
    const openDisputeMutation = useMutation(api.orders.openDispute);
    const toast = useToast();
    const theme = useTheme();

    const orders = marketplace?.orders || [];
    const showToast = toast?.show || Alert.alert;
    const colorScheme = theme?.colorScheme || 'light';
    const isDark = colorScheme === 'dark';

    // 3. State
    const [reason, setReason] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [escrowOpen, setEscrowOpen] = useState(false);

    // 4. Constants
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isSmall = width < 375;

    // 5. Derived State
    const order = useMemo(() => {
        if (!orderId) return undefined;
        return orders.find((o) => o.id === orderId);
    }, [orders, orderId]);

    const isAlreadyDisputed = !!order?.dispute || order?.escrow?.state === 'disputed';

    // 6. Effects
    useEffect(() => {
        if (params.prefillReason && !reason) {
            const exists = REASONS.find(r => r.label === params.prefillReason);
            if (exists) setReason(exists.label);
        }
        if (params.prefillDescription && !description) {
            setDescription(params.prefillDescription);
        }
    }, [params]);

    // 7. Handlers
    const handleSubmit = async () => {
        if (!orderId) return;

        if (isAlreadyDisputed) {
            navigation.navigate('DisputeChat', { orderId });
            return;
        }

        if (!reason || !description.trim()) {
            showToast('Por favor, completá todos los campos', 'error');
            return;
        }

        const selectedReason = REASONS.find(r => r.label === reason);
        if (!selectedReason) {
            showToast('Motivo inválido', 'error');
            return;
        }

        try {
            if (!user) {
                showToast('Debes iniciar sesión', 'error');
                return;
            }
            // Convex Mutation
            await openDisputeMutation({
                orderId: orderId as any,
                userId: user.id, // Buyer
                reason: selectedReason.code,
            });

            showToast('Disputa iniciada correctamente', 'success');
            navigation.replace('DisputeChat', { orderId });

        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Error al iniciar disputa', 'error');
        }
    };

    // 8. Colors & Styles
    const colors = {
        bg: isDark ? 'bg-[#0f172a]' : 'bg-[#f8fafc]',
        card: isDark ? 'bg-[#1e293b]' : 'bg-white',
        text: isDark ? 'text-slate-100' : 'text-slate-900',
        subtext: isDark ? 'text-slate-400' : 'text-slate-500',
        border: isDark ? 'border-slate-800' : 'border-slate-200',
        primary: isDark ? 'text-blue-400' : 'text-blue-600',
        danger: isDark ? 'text-red-400' : 'text-red-600',
    };

    // 9. Early Returns
    if (!orderId || !order) {
        return (
            <View className={`flex-1 ${colors.bg}`}>
                <MobileHeader title="Iniciar Reclamo" backButton onBack={() => navigation.goBack()} />
                <View className="flex-1 items-center justify-center p-8">
                    <View className={`w-20 h-20 rounded-full items-center justify-center mb-4 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        <XCircle size={40} color={isDark ? '#94a3b8' : '#64748b'} />
                    </View>
                    <Text className={`text-xl font-bold text-center mb-2 ${colors.text}`}>
                        Orden no encontrada
                    </Text>
                    <Text className={`text-center mb-8 ${colors.subtext}`}>
                        No pudimos encontrar la información de la orden #{orderId || '???'}.
                    </Text>
                    <TouchableOpacity
                        className={`px-6 py-3 rounded-xl ${isDark ? 'bg-blue-600' : 'bg-blue-600'}`}
                        onPress={() => navigation.goBack()}
                    >
                        <Text className="text-white font-bold">Volver atrás</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // 10. Render
    const releaseDateStr = order.escrow.releaseScheduledAt
        ? new Date(order.escrow.releaseScheduledAt).toLocaleDateString()
        : 'A confirmar';

    const canSubmit = reason !== '' && description.trim().length >= 10;

    return (
        <View className={`flex-1 ${colors.bg}`}>
            <MobileHeader title="Iniciar Reclamo" backButton onBack={() => navigation.goBack()} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingTop: 16,
                        paddingBottom: Math.max(insets.bottom, 24) + 100
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header Alert */}
                    <View className="flex-row p-4 mb-4 rounded-xl bg-orange-50 border border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/30">
                        <AlertTriangle size={20} color="#f97316" style={{ marginTop: 2 }} />
                        <View className="ml-3 flex-1">
                            <Text className={`font-bold text-orange-800 dark:text-orange-200`}>
                                Centro de Disputas
                            </Text>
                            <Text className="text-xs text-orange-700 mt-1 dark:text-orange-300">
                                Tu pago está protegido por el Escrow hasta que se resuelva el problema.
                            </Text>
                        </View>
                    </View>

                    {/* Order Summary */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setEscrowOpen(true)}
                        className={`mb-6 p-4 rounded-2xl border ${colors.card} ${colors.border}`}
                    >
                        <View className="flex-row justify-between items-start mb-3">
                            <View>
                                <Text className={`text-xs font-bold uppercase tracking-wider ${colors.subtext}`}>
                                    Orden #{order.id.slice(-6).toUpperCase()}
                                </Text>
                                <Text className={`text-lg font-bold mt-1 ${colors.text}`}>
                                    ${(order.totals?.grandTotal || 0).toLocaleString()} USD
                                </Text>
                            </View>
                            <View className={`px-3 py-1 rounded-full ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                                <Text className={`text-xs font-bold ${colors.primary}`}>
                                    {order.escrow.state.toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        <View className="flex-row items-center justify-between border-t pt-3 border-gray-100 dark:border-gray-800">
                            <Text className={`text-xs ${colors.subtext}`}>
                                Liberación estimada: {releaseDateStr}
                            </Text>
                            <View className="flex-row items-center">
                                <Text className={`text-xs font-bold mr-1 ${colors.primary}`}>Ver detalles</Text>
                                <ChevronRight size={12} color={isDark ? '#60a5fa' : '#2563eb'} />
                            </View>
                        </View>
                    </TouchableOpacity>

                    {/* Reason Select */}
                    {!isAlreadyDisputed && (
                        <View className="mb-6">
                            <Text className={`text-base font-bold mb-3 ${colors.text}`}>
                                ¿Cuál es el problema?
                            </Text>
                            {REASONS.map((r) => {
                                const isActive = reason === r.label;
                                const Icon = r.Icon;
                                return (
                                    <TouchableOpacity
                                        key={r.code}
                                        onPress={() => setReason(r.label)}
                                        activeOpacity={0.7}
                                        className={`flex-row items-center p-4 mb-2 rounded-xl border ${isActive
                                            ? (isDark ? 'bg-blue-500/10 border-blue-500' : 'bg-blue-50 border-blue-500')
                                            : `${colors.card} ${colors.border}`
                                            }`}
                                    >
                                        <View className={`w-10 h-10 rounded-full items-center justify-center ${isActive
                                            ? (isDark ? 'bg-blue-500/20' : 'bg-blue-100')
                                            : (isDark ? 'bg-slate-800' : 'bg-slate-100')
                                            }`}>
                                            <Icon size={20} color={isActive ? '#3b82f6' : '#94a3b8'} />
                                        </View>
                                        <View className="ml-3 flex-1">
                                            <Text className={`font-semibold ${isActive ? colors.primary : colors.text}`}>
                                                {r.label}
                                            </Text>
                                        </View>
                                        {isActive && <CheckCircle2 size={20} color="#3b82f6" />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {/* Description Input */}
                    {!isAlreadyDisputed && (
                        <View className="mb-6">
                            <Text className={`text-base font-bold mb-3 ${colors.text}`}>
                                Descripción detallada
                            </Text>
                            <View className={`rounded-xl border ${colors.border} ${colors.card} p-4`}>
                                <TextInput
                                    multiline
                                    placeholder="Explica el problema con detalle..."
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                    className={`min-h-[120px] text-base ${colors.text}`}
                                    style={{ textAlignVertical: 'top' }}
                                    value={description}
                                    onChangeText={setDescription}
                                />
                            </View>
                            <Text className={`text-right text-xs mt-2 ${description.length < 10 ? 'text-red-500' : colors.subtext}`}>
                                {description.length} caracteres (mínimo 10)
                            </Text>
                        </View>
                    )}

                    {/* Submit Button Placeholder for Layout */}
                    <View className="h-20" />
                </ScrollView>

                {/* Sticky Footer */}
                <View className={`absolute bottom-0 left-0 right-0 p-4 border-t ${colors.bg} ${colors.border}`}
                    style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
                    {isAlreadyDisputed ? (
                        <TouchableOpacity
                            onPress={() => navigation.navigate('DisputeChat', { orderId })}
                            className="w-full h-14 bg-amber-500 rounded-xl items-center justify-center flex-row shadow-sm"
                        >
                            <MessageSquare size={20} color="white" className="mr-2" />
                            <Text className="text-white font-bold text-lg ml-2">Ir al Chat</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            className={`w-full h-14 rounded-xl items-center justify-center shadow-sm ${canSubmit
                                ? 'bg-red-600'
                                : (isDark ? 'bg-slate-800' : 'bg-slate-200')
                                }`}
                        >
                            <Text className={`font-bold text-lg ${canSubmit ? 'text-white' : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
                                Iniciar Reclamo
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

            <EscrowSheet
                open={escrowOpen}
                onOpenChange={setEscrowOpen}
                order={order}
                role="buyer"
            />
        </View>
    );
}
