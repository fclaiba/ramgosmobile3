import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
    X,
    CheckCircle,
    AlertTriangle,
    Search,
    Camera as CameraIcon,
    Keyboard,
    Ticket,
    ScanLine,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { colors, Radius, Space } from '../theme/tokens';
import { toUserErrorTitle, toUserMessage } from '../utils/errors';


const { width } = Dimensions.get('window');
const VIEWFINDER = Math.min(width * 0.86, 340);

export default function BusinessScannerScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, sessionToken } = useAuth();

    const [inputCode, setInputCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<'success' | 'error' | null>(null);
    const [resultTitle, setResultTitle] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [isManualMode, setIsManualMode] = useState(false);
    const [scannedLock, setScannedLock] = useState(false);

    const [permission, requestPermission] = useCameraPermissions();
    const canUseCamera = !!permission?.granted && Platform.OS !== 'web';

    const sellerBonos = useQuery(
        api.bonos.getBonosBySeller,
        user?.id && sessionToken ? { sessionToken, sellerId: user.id } : 'skip',
    );

    const redeemBonoMutation = useMutation(api.bonos.redeemBono);

    const issuedBonos = useMemo(() => {
        const list = (sellerBonos || []) as any[];
        return list.filter((b) => b.status === 'issued');
    }, [sellerBonos]);

    const handleValidate = async (codeToValidate?: string) => {
        const code = codeToValidate || inputCode;
        const trimmed = code.trim().toUpperCase();
        if (!trimmed || loading) return;

        setLoading(true);
        setScannedLock(true);
        try {
            await redeemBonoMutation({
                bonoCode: trimmed,
                sessionToken,
            });
            setResult('success');
            setResultTitle('Bono canjeado');
            setResultMessage(`Canje confirmado · ${trimmed}`);
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (e: any) {
            // Prefer ConvexError `.data`; never show Request ID / stack to the user.
            const payload = e?.data ?? e?.message ?? e;
            setResult('error');
            setResultTitle(toUserErrorTitle(payload, 'No se pudo canjear'));
            setResultMessage(
                toUserMessage(
                    payload,
                    'No se pudo validar el bono. Revisá el código e intentá de nuevo.',
                ),
            );
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
        if (loading || result || scannedLock) return;
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
        handleValidate(data);
    };

    const resetScanner = () => {
        setInputCode('');
        setResult(null);
        setResultTitle('');
        setResultMessage('');
        setScannedLock(false);
    };

    const openSettings = () => {
        if (Platform.OS === 'web') {
            requestPermission();
            return;
        }
        Linking.openSettings().catch(() => requestPermission());
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 10) }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <X size={22} color={c.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>Validar Bono</Text>
                    <Text style={styles.headerSub}>
                        {issuedBonos.length} pendiente{issuedBonos.length === 1 ? '' : 's'}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                        setIsManualMode((v) => !v);
                        resetScanner();
                    }}
                >
                    {isManualMode ? (
                        <CameraIcon size={22} color={c.text} />
                    ) : (
                        <Keyboard size={22} color={c.text} />
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Result */}
                {result ? (
                    <View style={styles.resultCard}>
                        {result === 'success' ? (
                            <CheckCircle size={64} color="#10B981" />
                        ) : (
                            <AlertTriangle size={64} color="#EF4444" />
                        )}
                        <Text
                            style={[
                                styles.resultTitle,
                                { color: result === 'success' ? '#10B981' : '#EF4444' },
                            ]}
                        >
                            {resultTitle ||
                                (result === 'success' ? 'Bono canjeado' : 'No se pudo canjear')}
                        </Text>
                        <Text style={styles.resultSub}>
                            {result === 'error' ? toUserMessage(resultMessage) : resultMessage}
                        </Text>
                        <TouchableOpacity style={styles.primaryBtn} onPress={resetScanner}>
                            <Text style={styles.primaryBtnText}>Validar otro código</Text>
                        </TouchableOpacity>
                    </View>
                ) : loading ? (
                    <View style={styles.resultCard}>
                        <ActivityIndicator size="large" color={c.primary} />
                        <Text style={styles.loadingText}>Validando bono...</Text>
                    </View>
                ) : (
                    <>
                        {/* Camera / simulation — always shown unless manual-only preference */}
                        {!isManualMode && (
                            <View style={styles.viewfinderWrap}>
                                <View style={styles.viewfinder}>
                                    {canUseCamera ? (
                                        <CameraView
                                            style={StyleSheet.absoluteFill}
                                            facing="back"
                                            onBarcodeScanned={handleBarCodeScanned}
                                            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                                        />
                                    ) : (
                                        <SimulatedCamera isDark={isDark} c={c} />
                                    )}
                                    <View style={styles.scanFrame} pointerEvents="none">
                                        <View style={[styles.corner, styles.tl]} />
                                        <View style={[styles.corner, styles.tr]} />
                                        <View style={[styles.corner, styles.bl]} />
                                        <View style={[styles.corner, styles.br]} />
                                        <ScanLine size={28} color="rgba(33, 150, 243,0.85)" />
                                    </View>
                                </View>
                                <Text style={styles.hint}>
                                    {canUseCamera
                                        ? 'Apuntá al QR del cliente'
                                        : Platform.OS === 'web'
                                          ? 'Simulación de cámara (web). Elegí un bono abajo o ingresá el código.'
                                          : 'Cámara no disponible. Concedé permiso o canjeá desde la lista.'}
                                </Text>
                                {!canUseCamera && Platform.OS !== 'web' && (
                                    <TouchableOpacity style={styles.secondaryBtn} onPress={openSettings}>
                                        <CameraIcon size={16} color={c.primary} />
                                        <Text style={styles.secondaryBtnText}>Activar cámara</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Manual input */}
                        {(isManualMode || !canUseCamera) && (
                            <View style={styles.manualCard}>
                                <Text style={styles.sectionLabel}>Código manual</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="BNO-XXXX-XXXX"
                                    placeholderTextColor={c.textSubtle}
                                    value={inputCode}
                                    onChangeText={setInputCode}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity
                                    style={[styles.primaryBtn, !inputCode.trim() && { opacity: 0.5 }]}
                                    disabled={!inputCode.trim()}
                                    onPress={() => handleValidate()}
                                >
                                    <Search size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Validar código</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Issued bonos from this business — must use real data */}
                        <View style={styles.listCard}>
                            <View style={styles.listHeader}>
                                <Ticket size={18} color={c.primary} />
                                <Text style={styles.sectionLabel}>Bonos emitidos (pendientes)</Text>
                            </View>
                            {sellerBonos === undefined ? (
                                <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
                            ) : issuedBonos.length === 0 ? (
                                <Text style={styles.emptyList}>
                                    No hay bonos pendientes de canje. Cuando un cliente compre un bono tuyo, aparece acá.
                                </Text>
                            ) : (
                                issuedBonos.map((bono: any) => (
                                    <TouchableOpacity
                                        key={bono._id}
                                        style={styles.bonoRow}
                                        activeOpacity={0.8}
                                        onPress={() => handleValidate(bono.bonoCode)}
                                    >
                                        <View style={styles.bonoIcon}>
                                            <Ticket size={16} color="#fff" />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.bonoTitle} numberOfLines={1}>
                                                {bono.listing?.title || 'Bono'}
                                            </Text>
                                            <Text style={styles.bonoMeta} numberOfLines={1}>
                                                {bono.bonoCode}
                                                {bono.buyer?.name || bono.buyer?.nickname
                                                    ? ` · ${bono.buyer?.name || bono.buyer?.nickname}`
                                                    : ''}
                                            </Text>
                                        </View>
                                        <View style={styles.redeemChip}>
                                            <Text style={styles.redeemChipText}>Canjear</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function SimulatedCamera({
    isDark,
    c,
}: {
    isDark: boolean;
    c: ReturnType<typeof colors>;
}) {
    return (
        <LinearGradient
            colors={
                isDark
                    ? ['#18181B', '#27272A', '#0F172A']
                    : ['#E4E4E7', '#F4F4F5', '#DBEAFE']
            }
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <View style={simStyles.grid}>
                {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={[simStyles.cell, { borderColor: c.border }]} />
                ))}
            </View>
            <View style={simStyles.badge}>
                <CameraIcon size={14} color="#fff" />
                <Text style={simStyles.badgeText}>SIMULACIÓN</Text>
            </View>
            <Text style={[simStyles.caption, { color: c.textMuted }]}>
                Vista previa de cámara
            </Text>
        </LinearGradient>
    );
}

const simStyles = StyleSheet.create({
    grid: {
        ...StyleSheet.absoluteFill,
        flexDirection: 'row',
        flexWrap: 'wrap',
        opacity: 0.35,
        padding: 8,
    },
    cell: {
        width: '25%',
        height: '33.33%',
        borderWidth: StyleSheet.hairlineWidth,
    },
    badge: {
        position: 'absolute',
        top: 12,
        left: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: Radius.full,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    caption: {
        position: 'absolute',
        bottom: 14,
        alignSelf: 'center',
        fontSize: 12,
        fontWeight: '600',
    },
});

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: c.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Space[4],
            paddingBottom: Space[3],
            gap: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border,
            backgroundColor: c.glassStrong,
        },
        headerTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
        headerSub: { color: c.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
        iconBtn: {
            width: 40,
            height: 40,
            borderRadius: Radius.xl,
            backgroundColor: c.glass,
            alignItems: 'center',
            justifyContent: 'center',
        },
        scroll: { padding: Space[4], gap: Space[4] },
        viewfinderWrap: { alignItems: 'center', gap: Space[3] },
        viewfinder: {
            width: VIEWFINDER,
            height: VIEWFINDER,
            borderRadius: Radius['2xl'],
            overflow: 'hidden',
            backgroundColor: '#000',
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        scanFrame: {
            ...StyleSheet.absoluteFill,
            alignItems: 'center',
            justifyContent: 'center',
        },
        corner: {
            position: 'absolute',
            width: 28,
            height: 28,
            borderColor: c.primary,
        },
        tl: { top: 28, left: 28, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
        tr: { top: 28, right: 28, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
        bl: { bottom: 28, left: 28, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
        br: { bottom: 28, right: 28, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
        hint: {
            color: c.textMuted,
            fontSize: 13,
            textAlign: 'center',
            paddingHorizontal: 12,
            lineHeight: 18,
        },
        manualCard: {
            backgroundColor: c.glassStrong,
            borderRadius: Radius.xl,
            padding: Space[4],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            gap: Space[3],
        },
        listCard: {
            backgroundColor: c.glassStrong,
            borderRadius: Radius.xl,
            padding: Space[4],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            gap: Space[2],
        },
        listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
        sectionLabel: { fontSize: 13, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.4 },
        emptyList: { color: c.textMuted, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
        bonoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.divider,
        },
        bonoIcon: {
            width: 36,
            height: 36,
            borderRadius: Radius.md,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        bonoTitle: { fontSize: 14, fontWeight: '700', color: c.text },
        bonoMeta: { fontSize: 11, color: c.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] as any },
        redeemChip: {
            backgroundColor: c.primaryMuted,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: Radius.full,
        },
        redeemChipText: { color: c.primarySoft, fontSize: 12, fontWeight: '700' },
        primaryBtn: {
            backgroundColor: c.primary,
            borderRadius: Radius.lg,
            paddingVertical: 14,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
        },
        primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
        secondaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: Radius.full,
            backgroundColor: c.primaryMuted,
        },
        secondaryBtnText: { color: c.primarySoft, fontWeight: '700', fontSize: 13 },
        input: {
            backgroundColor: c.bg,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: Radius.lg,
            padding: 16,
            fontSize: 18,
            color: c.text,
            textAlign: 'center',
            letterSpacing: 2,
            fontWeight: '700',
        },
        resultCard: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: Space[6],
            gap: Space[3],
            backgroundColor: c.glassStrong,
            borderRadius: Radius['2xl'],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            minHeight: 280,
        },
        resultTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
        resultSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 8 },
        loadingText: { color: c.text, marginTop: 12, fontSize: 16, fontWeight: '600' },
    });
