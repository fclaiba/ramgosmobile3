import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    ShieldCheck,
    RefreshCw,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { colors, Radius, Space } from '../theme/tokens';
import { glassTokens } from '../utils/glass';
import { toUserErrorTitle, toUserMessage } from '../utils/errors';
import { parseScannedBonoCode } from '../utils/parseScannedBonoCode';

const { width: WIN_W } = Dimensions.get('window');
const VIEWFINDER = Math.min(WIN_W * 0.88, 420);

type Mode = 'scan' | 'manual';
type Phase = 'idle' | 'preview' | 'redeeming' | 'success' | 'error';

function statusLabel(status: string | undefined): string {
    switch (status) {
        case 'issued':
            return 'Listo para canjear';
        case 'redeemed':
            return 'Ya canjeado';
        case 'expired':
            return 'Vencido';
        case 'cancelled':
            return 'Cancelado';
        default:
            return status || 'Desconocido';
    }
}

export default function BusinessScannerScreen() {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const glass = glassTokens(isDark);
    const styles = useMemo(() => getStyles(isDark, c, glass), [isDark, c, glass]);
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { user, sessionToken } = useAuth();
    const { show } = useToast();

    const [mode, setMode] = useState<Mode>('scan');
    const [inputCode, setInputCode] = useState('');
    const [searchCode, setSearchCode] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [resultTitle, setResultTitle] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [scannedLock, setScannedLock] = useState(false);
    const [cameraError, setCameraError] = useState(false);

    const [permission, requestPermission] = useCameraPermissions();
    const permissionGranted = !!permission?.granted;
    const canUseCamera = permissionGranted && !cameraError && mode === 'scan';

    // Ask once when opening scan mode (web + native).
    useEffect(() => {
        if (mode !== 'scan') return;
        if (!permission || permission.granted) return;
        if (permission.canAskAgain === false) return;
        requestPermission().catch(() => {});
    }, [mode, permission, requestPermission]);

    const sellerBonos = useQuery(
        api.bonos.getBonosBySeller,
        user?.id && sessionToken ? { sessionToken, sellerId: user.id } : 'skip',
    );
    const lookupResult = useQuery(
        api.bonos.lookupBono,
        searchCode ? { bonoCode: searchCode } : 'skip',
    );
    const redeemBonoMutation = useMutation(api.bonos.redeemBono);

    const issuedBonos = useMemo(() => {
        const list = (sellerBonos || []) as any[];
        return list.filter((b) => b.status === 'issued');
    }, [sellerBonos]);

    const resetScanner = useCallback(() => {
        setInputCode('');
        setSearchCode('');
        setPhase('idle');
        setResultTitle('');
        setResultMessage('');
        setScannedLock(false);
    }, []);

    const beginLookup = useCallback(
        (raw: string) => {
            const code = parseScannedBonoCode(raw);
            if (!code) {
                setPhase('error');
                setResultTitle('Código inválido');
                setResultMessage('No pudimos leer un código de bono válido en ese QR.');
                setScannedLock(true);
                return;
            }
            if (!sessionToken) {
                show('Tenés que iniciar sesión como el negocio emisor.', 'error');
                return;
            }
            setSearchCode(code);
            setInputCode(code);
            setPhase('preview');
            setScannedLock(true);
            setResultTitle('');
            setResultMessage('');
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
        },
        [sessionToken, show],
    );

    // Derive preview / error from lookup once code is set
    useEffect(() => {
        if (!searchCode || phase !== 'preview') return;
        if (lookupResult === undefined) return; // loading

        if (lookupResult === null) {
            setPhase('error');
            setResultTitle('Bono no encontrado');
            setResultMessage(
                `No hay ningún bono con el código ${searchCode}. Pedile al cliente que muestre el QR correcto.`,
            );
            return;
        }

        if (lookupResult.status !== 'issued') {
            setPhase('error');
            setResultTitle('Bono no canjeable');
            setResultMessage(
                `Estado: ${statusLabel(lookupResult.status)}. Este código no se puede canjear.`,
            );
            return;
        }

        // Wrong business: warn in preview (redeem will also reject)
        if (
            user?.id &&
            lookupResult.sellerId &&
            String(lookupResult.sellerId) !== String(user.id) &&
            user.role !== 'admin' &&
            user.role !== 'developer'
        ) {
            setPhase('error');
            setResultTitle('Bono de otro negocio');
            setResultMessage(
                'Este QR pertenece a otro comercio. Pedile al cliente el bono correcto.',
            );
        }
    }, [lookupResult, searchCode, phase, user?.id, user?.role]);

    const handleConfirmRedeem = async () => {
        if (!searchCode || !sessionToken || phase === 'redeeming') return;
        setPhase('redeeming');
        try {
            await redeemBonoMutation({
                bonoCode: searchCode,
                sessionToken,
            });
            setPhase('success');
            setResultTitle('¡Canje exitoso!');
            const title = (lookupResult as any)?.listing?.title || searchCode;
            setResultMessage(`${title} fue canjeado correctamente.`);
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (e: any) {
            const payload = e?.data ?? e?.message ?? e;
            setPhase('error');
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
        }
    };

    const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
        if (scannedLock || phase !== 'idle' || mode !== 'scan') return;
        beginLookup(data);
    };

    const openSettings = () => {
        if (Platform.OS === 'web') {
            requestPermission();
            return;
        }
        Linking.openSettings().catch(() => requestPermission());
    };

    const showResultPanel =
        phase === 'preview' ||
        phase === 'redeeming' ||
        phase === 'success' ||
        phase === 'error';

    const previewLoading = phase === 'preview' && searchCode && lookupResult === undefined;
    const canConfirm =
        phase === 'preview' &&
        lookupResult &&
        lookupResult.status === 'issued' &&
        (!user?.id ||
            !lookupResult.sellerId ||
            String(lookupResult.sellerId) === String(user.id) ||
            user.role === 'admin' ||
            user.role === 'developer');

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <LinearGradient
                colors={
                    isDark
                        ? ['#09090B', '#0C1222', '#09090B']
                        : ['#F8FAFC', '#EFF6FF', '#F8FAFC']
                }
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 10) }]}>
                <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="Cerrar"
                >
                    <X size={22} color={c.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>Validar bono</Text>
                    <Text style={styles.headerSub}>
                        {issuedBonos.length} pendiente{issuedBonos.length === 1 ? '' : 's'}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Mode chips */}
            {!showResultPanel && (
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeChip, mode === 'scan' && styles.modeChipActive]}
                        onPress={() => {
                            setMode('scan');
                            resetScanner();
                        }}
                    >
                        <CameraIcon
                            size={16}
                            color={mode === 'scan' ? '#fff' : c.textMuted}
                        />
                        <Text
                            style={[
                                styles.modeChipText,
                                mode === 'scan' && styles.modeChipTextActive,
                            ]}
                        >
                            Escanear
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeChip, mode === 'manual' && styles.modeChipActive]}
                        onPress={() => {
                            setMode('manual');
                            resetScanner();
                        }}
                    >
                        <Keyboard
                            size={16}
                            color={mode === 'manual' ? '#fff' : c.textMuted}
                        />
                        <Text
                            style={[
                                styles.modeChipText,
                                mode === 'manual' && styles.modeChipTextActive,
                            ]}
                        >
                            Código manual
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {showResultPanel ? (
                    <View style={styles.resultCard}>
                        {phase === 'redeeming' || previewLoading ? (
                            <>
                                <ActivityIndicator size="large" color={c.primary} />
                                <Text style={styles.loadingText}>
                                    {phase === 'redeeming'
                                        ? 'Canjeando bono…'
                                        : 'Buscando código…'}
                                </Text>
                            </>
                        ) : phase === 'success' ? (
                            <>
                                <View style={styles.successHalo}>
                                    <CheckCircle size={56} color="#10B981" />
                                </View>
                                <Text style={[styles.resultTitle, { color: '#10B981' }]}>
                                    {resultTitle}
                                </Text>
                                <Text style={styles.resultSub}>{resultMessage}</Text>
                                <TouchableOpacity
                                    style={styles.primaryBtn}
                                    onPress={resetScanner}
                                >
                                    <RefreshCw size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Validar otro</Text>
                                </TouchableOpacity>
                            </>
                        ) : phase === 'error' ? (
                            <>
                                <AlertTriangle size={56} color="#EF4444" />
                                <Text style={[styles.resultTitle, { color: '#EF4444' }]}>
                                    {resultTitle || 'No se pudo validar'}
                                </Text>
                                <Text style={styles.resultSub}>
                                    {toUserMessage(resultMessage)}
                                </Text>
                                {searchCode ? (
                                    <Text style={styles.codeBadge}>{searchCode}</Text>
                                ) : null}
                                <TouchableOpacity
                                    style={styles.primaryBtn}
                                    onPress={resetScanner}
                                >
                                    <Text style={styles.primaryBtnText}>Intentar de nuevo</Text>
                                </TouchableOpacity>
                            </>
                        ) : canConfirm && lookupResult ? (
                            <>
                                <ShieldCheck size={48} color={c.primary} />
                                <Text style={styles.resultTitle}>Confirmar canje</Text>
                                <Text style={styles.previewTitle} numberOfLines={2}>
                                    {(lookupResult as any).listing?.title || 'Bono'}
                                </Text>
                                <Text style={styles.resultSub}>
                                    Cliente:{' '}
                                    {(lookupResult as any).ownerName || 'Cliente'}
                                    {'\n'}
                                    Código: {searchCode}
                                    {(lookupResult as any).creditRemaining != null
                                        ? `\nCrédito: $${(lookupResult as any).creditRemaining}`
                                        : ''}
                                </Text>
                                <TouchableOpacity
                                    style={styles.primaryBtn}
                                    onPress={handleConfirmRedeem}
                                >
                                    <CheckCircle size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Confirmar canje</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.ghostBtn}
                                    onPress={resetScanner}
                                >
                                    <Text style={styles.ghostBtnText}>Cancelar</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <ActivityIndicator size="large" color={c.primary} />
                                <Text style={styles.loadingText}>Preparando…</Text>
                            </>
                        )}
                    </View>
                ) : (
                    <>
                        {mode === 'scan' && (
                            <View style={styles.viewfinderWrap}>
                                <View style={styles.viewfinder}>
                                    {canUseCamera ? (
                                        <CameraView
                                            style={StyleSheet.absoluteFill}
                                            facing="back"
                                            onBarcodeScanned={handleBarCodeScanned}
                                            barcodeScannerSettings={{
                                                barcodeTypes: ['qr'],
                                            }}
                                            onMountError={() => setCameraError(true)}
                                        />
                                    ) : (
                                        <View style={styles.cameraFallback}>
                                            <CameraIcon size={40} color={c.textMuted} />
                                            <Text style={styles.fallbackTitle}>
                                                {!permission
                                                    ? 'Preparando cámara…'
                                                    : permissionGranted
                                                      ? 'No se pudo iniciar la cámara'
                                                      : 'Se necesita permiso de cámara'}
                                            </Text>
                                            <Text style={styles.fallbackSub}>
                                                {Platform.OS === 'web'
                                                    ? 'Usá HTTPS o localhost. En el navegador, permití el acceso a la cámara.'
                                                    : 'Concedé el permiso para escanear el QR del cliente.'}
                                            </Text>
                                            {!permissionGranted && (
                                                <TouchableOpacity
                                                    style={styles.secondaryBtn}
                                                    onPress={openSettings}
                                                >
                                                    <CameraIcon size={16} color={c.primary} />
                                                    <Text style={styles.secondaryBtnText}>
                                                        Permitir cámara
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                            {permissionGranted && cameraError && (
                                                <TouchableOpacity
                                                    style={styles.secondaryBtn}
                                                    onPress={() => {
                                                        setCameraError(false);
                                                    }}
                                                >
                                                    <RefreshCw size={16} color={c.primary} />
                                                    <Text style={styles.secondaryBtnText}>
                                                        Reintentar
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                    {canUseCamera && (
                                        <View style={styles.scanFrame} pointerEvents="none">
                                            <View style={[styles.corner, styles.tl]} />
                                            <View style={[styles.corner, styles.tr]} />
                                            <View style={[styles.corner, styles.bl]} />
                                            <View style={[styles.corner, styles.br]} />
                                            <ScanLine
                                                size={28}
                                                color="rgba(93, 211, 243, 0.9)"
                                            />
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.hint}>
                                    {canUseCamera
                                        ? 'Apuntá al QR del cliente — validamos antes de canjear'
                                        : 'O pasá a código manual si la cámara no está disponible'}
                                </Text>
                            </View>
                        )}

                        {mode === 'manual' && (
                            <View style={styles.manualCard}>
                                <Text style={styles.sectionLabel}>Código del bono</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="BNO-XXXX-XXXX"
                                    placeholderTextColor={c.textSubtle}
                                    value={inputCode}
                                    onChangeText={setInputCode}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    autoFocus
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.primaryBtn,
                                        !inputCode.trim() && { opacity: 0.5 },
                                    ]}
                                    disabled={!inputCode.trim()}
                                    onPress={() => beginLookup(inputCode)}
                                >
                                    <Search size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Validar código</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.listCard}>
                            <View style={styles.listHeader}>
                                <Ticket size={18} color={c.primary} />
                                <Text style={styles.sectionLabel}>
                                    Bonos emitidos (pendientes)
                                </Text>
                            </View>
                            {sellerBonos === undefined ? (
                                <ActivityIndicator
                                    color={c.primary}
                                    style={{ marginVertical: 16 }}
                                />
                            ) : issuedBonos.length === 0 ? (
                                <Text style={styles.emptyList}>
                                    No hay bonos pendientes. Cuando un cliente compre un bono
                                    tuyo, aparece acá.
                                </Text>
                            ) : (
                                issuedBonos.map((bono: any) => (
                                    <TouchableOpacity
                                        key={bono._id}
                                        style={styles.bonoRow}
                                        activeOpacity={0.8}
                                        onPress={() => beginLookup(bono.bonoCode)}
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
                                            <Text style={styles.redeemChipText}>Validar</Text>
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

const getStyles = (
    isDark: boolean,
    c: ReturnType<typeof colors>,
    glass: ReturnType<typeof glassTokens>,
) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: c.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Space[4],
            paddingBottom: Space[3],
            gap: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: glass.border,
            backgroundColor: glass.bg,
        },
        headerTitle: { color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
        headerSub: {
            color: c.textMuted,
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
        },
        iconBtn: {
            width: 40,
            height: 40,
            borderRadius: Radius.xl,
            backgroundColor: glass.bg,
            borderWidth: 1,
            borderColor: glass.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        modeRow: {
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: Space[4],
            paddingTop: Space[3],
            paddingBottom: Space[1],
        },
        modeChip: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: Radius.full,
            backgroundColor: glass.bg,
            borderWidth: 1,
            borderColor: glass.border,
        },
        modeChipActive: {
            backgroundColor: c.primary,
            borderColor: c.primary,
        },
        modeChipText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
        modeChipTextActive: { color: '#fff' },
        scroll: { padding: Space[4], gap: Space[4], alignItems: 'stretch' },
        viewfinderWrap: { alignItems: 'center', gap: Space[3], width: '100%' },
        viewfinder: {
            width: VIEWFINDER,
            height: VIEWFINDER,
            maxWidth: '100%',
            borderRadius: Radius['2xl'],
            overflow: 'hidden',
            backgroundColor: '#000',
            borderWidth: 1,
            borderColor: 'rgba(93, 211, 243, 0.35)',
            ...Platform.select({
                web: { boxShadow: '0 24px 64px rgba(0,0,0,0.45)' } as any,
                default: {
                    shadowColor: '#000',
                    shadowOpacity: 0.35,
                    shadowRadius: 24,
                    shadowOffset: { width: 0, height: 12 },
                    elevation: 12,
                },
            }),
        },
        cameraFallback: {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            gap: 12,
            backgroundColor: isDark ? '#0F172A' : '#1E293B',
        },
        fallbackTitle: {
            color: '#F8FAFC',
            fontSize: 16,
            fontWeight: '700',
            textAlign: 'center',
        },
        fallbackSub: {
            color: '#94A3B8',
            fontSize: 13,
            textAlign: 'center',
            lineHeight: 18,
            marginBottom: 4,
        },
        scanFrame: {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
        },
        corner: {
            position: 'absolute',
            width: 32,
            height: 32,
            borderColor: '#5DD3F3',
        },
        tl: {
            top: 36,
            left: 36,
            borderTopWidth: 3,
            borderLeftWidth: 3,
            borderTopLeftRadius: 10,
        },
        tr: {
            top: 36,
            right: 36,
            borderTopWidth: 3,
            borderRightWidth: 3,
            borderTopRightRadius: 10,
        },
        bl: {
            bottom: 36,
            left: 36,
            borderBottomWidth: 3,
            borderLeftWidth: 3,
            borderBottomLeftRadius: 10,
        },
        br: {
            bottom: 36,
            right: 36,
            borderBottomWidth: 3,
            borderRightWidth: 3,
            borderBottomRightRadius: 10,
        },
        hint: {
            color: c.textMuted,
            fontSize: 13,
            textAlign: 'center',
            paddingHorizontal: 16,
            lineHeight: 18,
            maxWidth: VIEWFINDER,
        },
        manualCard: {
            backgroundColor: glass.bg,
            borderRadius: Radius.xl,
            padding: Space[4],
            borderWidth: 1,
            borderColor: glass.border,
            gap: Space[3],
            ...glass.shadow,
        },
        listCard: {
            backgroundColor: glass.bg,
            borderRadius: Radius.xl,
            padding: Space[4],
            borderWidth: 1,
            borderColor: glass.border,
            gap: Space[2],
            ...glass.shadow,
        },
        listHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
        },
        sectionLabel: {
            fontSize: 12,
            fontWeight: '700',
            color: c.text,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
        },
        emptyList: {
            color: c.textMuted,
            fontSize: 13,
            lineHeight: 18,
            paddingVertical: 8,
        },
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
        bonoMeta: {
            fontSize: 11,
            color: c.textMuted,
            marginTop: 2,
            fontVariant: ['tabular-nums'] as any,
        },
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
            paddingVertical: 15,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 360,
        },
        primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
        ghostBtn: {
            paddingVertical: 12,
            paddingHorizontal: 16,
        },
        ghostBtnText: { color: c.textMuted, fontWeight: '700', fontSize: 14 },
        secondaryBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: Radius.full,
            backgroundColor: 'rgba(33, 150, 243, 0.2)',
            marginTop: 4,
        },
        secondaryBtnText: { color: '#5DD3F3', fontWeight: '700', fontSize: 13 },
        input: {
            backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : '#fff',
            borderWidth: 2,
            borderColor: isDark ? '#334155' : '#E2E8F0',
            borderRadius: Radius.lg,
            padding: 18,
            fontSize: 20,
            color: c.text,
            textAlign: 'center',
            letterSpacing: 3,
            fontWeight: '800',
        },
        resultCard: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: Space[6],
            gap: Space[3],
            backgroundColor: glass.bg,
            borderRadius: Radius['2xl'],
            borderWidth: 1,
            borderColor: glass.border,
            minHeight: 300,
            ...glass.shadow,
        },
        successHalo: {
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        resultTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
        previewTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: c.text,
            textAlign: 'center',
        },
        resultSub: {
            fontSize: 14,
            color: c.textMuted,
            textAlign: 'center',
            marginBottom: 4,
            lineHeight: 21,
        },
        codeBadge: {
            fontSize: 13,
            fontWeight: '800',
            letterSpacing: 1.5,
            color: c.text,
            backgroundColor: c.primaryMuted,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.full,
            overflow: 'hidden',
        },
        loadingText: {
            color: c.text,
            marginTop: 12,
            fontSize: 16,
            fontWeight: '600',
        },
    });
