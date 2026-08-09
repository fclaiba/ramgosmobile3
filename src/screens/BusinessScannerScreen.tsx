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
import { extractBarcodeScanData } from '../utils/extractBarcodeScanData';
import WebBonoQrScanner, {
    type WebCameraFacing,
} from '../components/scanner/WebBonoQrScanner';

const { width: WIN_W } = Dimensions.get('window');
const VIEWFINDER = Math.min(WIN_W * 0.88, 420);
const IS_WEB = Platform.OS === 'web';

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

function formatMoney(amount: unknown): string {
    const n = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(n)) return '—';
    return `$${n.toFixed(2)}`;
}

function formatExpiry(raw: unknown): string {
    if (!raw) return 'Sin vencimiento';
    try {
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) return String(raw);
        return d.toLocaleDateString();
    } catch {
        return String(raw);
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

    const role = user?.role;
    const canAccessPos =
        !!sessionToken &&
        !!user &&
        (role === 'business' || role === 'admin' || role === 'developer');
    const showKycWarning =
        role === 'business' && user?.kycStatus && user.kycStatus !== 'approved';

    const [mode, setMode] = useState<Mode>('scan');
    const [inputCode, setInputCode] = useState('');
    const [searchCode, setSearchCode] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [resultTitle, setResultTitle] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [scannedLock, setScannedLock] = useState(false);
    const [cameraError, setCameraError] = useState(false);
    const [webCameraReady, setWebCameraReady] = useState(false);
    const [webFacing, setWebFacing] = useState<WebCameraFacing>('environment');
    const [webRestartToken, setWebRestartToken] = useState(0);

    const [permission, requestPermission] = useCameraPermissions();
    const permissionGranted = !!permission?.granted;
    // Web uses its own getUserMedia pipeline; native needs expo-camera permission.
    const canUseNativeCamera =
        canAccessPos &&
        !IS_WEB &&
        permissionGranted &&
        !cameraError &&
        mode === 'scan';
    const canUseWebCamera = canAccessPos && IS_WEB && mode === 'scan';
    const canUseCamera = IS_WEB ? canUseWebCamera : canUseNativeCamera;

    // Native: ask camera permission once. Permanent deny → offer Código (no silent loop).
    useEffect(() => {
        if (!canAccessPos || mode !== 'scan' || IS_WEB) return;
        if (!permission) return;
        if (permission.granted) return;
        if (permission.canAskAgain === false) return;
        requestPermission().catch(() => {});
    }, [canAccessPos, mode, permission, requestPermission]);

    const sellerBonos = useQuery(
        api.bonos.getBonosBySeller,
        canAccessPos && user?.id && sessionToken
            ? { sessionToken, sellerId: user.id }
            : 'skip',
    );
    const lookupResult = useQuery(
        api.bonos.lookupBono,
        canAccessPos && searchCode && sessionToken
            ? { sessionToken, bonoCode: searchCode }
            : 'skip',
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
        if (IS_WEB) {
            setCameraError(false);
        }
    }, []);

    const beginLookup = useCallback(
        (raw: string) => {
            if (!canAccessPos) {
                show('Solo negocios pueden canjear bonos desde el POS.', 'error');
                return;
            }
            const code = parseScannedBonoCode(raw);
            if (!code) {
                setPhase('error');
                setResultTitle('Código inválido');
                setResultMessage(
                    'No pudimos leer un código de bono válido en ese QR.',
                );
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
        [canAccessPos, sessionToken, show],
    );

    useEffect(() => {
        if (!searchCode || phase !== 'preview') return;
        if (lookupResult === undefined) return;

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
            setResultTitle(
                lookupResult.status === 'redeemed'
                    ? 'Ya canjeado'
                    : 'Bono no canjeable',
            );
            setResultMessage(
                `Estado: ${statusLabel(lookupResult.status)}. Este código no se puede canjear.`,
            );
            return;
        }

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

    const handleBarCodeScanned = (payload: unknown) => {
        if (scannedLock || phase !== 'idle' || mode !== 'scan') return;
        const data = extractBarcodeScanData(payload);
        if (!data) return;
        beginLookup(data);
    };

    const handleWebScan = useCallback(
        (raw: string) => {
            if (scannedLock || phase !== 'idle' || mode !== 'scan') return;
            beginLookup(raw);
        },
        [scannedLock, phase, mode, beginLookup],
    );

    const openSettings = () => {
        if (IS_WEB) {
            setCameraError(false);
            setWebCameraReady(false);
            setWebRestartToken((n) => n + 1);
            return;
        }
        Linking.openSettings().catch(() => requestPermission());
    };

    const showResultPanel =
        phase === 'preview' ||
        phase === 'redeeming' ||
        phase === 'success' ||
        phase === 'error';

    const previewLoading =
        phase === 'preview' && searchCode && lookupResult === undefined;
    const canConfirm =
        phase === 'preview' &&
        lookupResult &&
        lookupResult.status === 'issued' &&
        (!user?.id ||
            !lookupResult.sellerId ||
            String(lookupResult.sellerId) === String(user.id) ||
            user.role === 'admin' ||
            user.role === 'developer');

    const scanStatusLabel = IS_WEB
        ? cameraError
            ? 'Sin cámara'
            : webCameraReady
              ? scannedLock
                  ? 'Bloqueado'
                  : 'Listo'
              : 'Preparando…'
        : !permission
          ? 'Preparando…'
          : canUseNativeCamera
            ? scannedLock
                ? 'Bloqueado'
                : 'Listo'
            : 'Sin cámara';

    const goManualFromCamera = () => {
        setMode('manual');
        resetScanner();
    };

    const renderScanViewfinder = () => (
        <View style={styles.viewfinderWrap}>
            <View style={styles.statusPill}>
                <View
                    style={[
                        styles.statusDot,
                        {
                            backgroundColor:
                                (IS_WEB ? webCameraReady && !cameraError : canUseNativeCamera)
                                    ? '#10B981'
                                    : '#F59E0B',
                        },
                    ]}
                />
                <Text style={styles.statusPillText}>{scanStatusLabel}</Text>
            </View>
            <View style={styles.viewfinder}>
                {IS_WEB ? (
                    <WebBonoQrScanner
                        active={canUseWebCamera && !showResultPanel}
                        paused={scannedLock || phase !== 'idle'}
                        facing={webFacing}
                        restartToken={webRestartToken}
                        onScan={handleWebScan}
                        onReady={() => {
                            setWebCameraReady(true);
                            setCameraError(false);
                        }}
                        onError={() => {
                            setWebCameraReady(false);
                            setCameraError(true);
                        }}
                        onFlipFacing={() =>
                            setWebFacing((f) =>
                                f === 'environment' ? 'user' : 'environment',
                            )
                        }
                        onGoManual={goManualFromCamera}
                    />
                ) : canUseNativeCamera ? (
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
                            Concedé el permiso o usá el modo Código para ingresar el BNO
                            a mano.
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
                                onPress={() => setCameraError(false)}
                            >
                                <RefreshCw size={16} color={c.primary} />
                                <Text style={styles.secondaryBtnText}>Reintentar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.ghostBtn}
                            onPress={goManualFromCamera}
                        >
                            <Text style={styles.ghostBtnText}>Ir a código manual</Text>
                        </TouchableOpacity>
                    </View>
                )}
                {(IS_WEB ? webCameraReady && !cameraError : canUseNativeCamera) && (
                    <View style={styles.scanFrame} pointerEvents="none">
                        <View style={[styles.corner, styles.tl]} />
                        <View style={[styles.corner, styles.tr]} />
                        <View style={[styles.corner, styles.bl]} />
                        <View style={[styles.corner, styles.br]} />
                        <ScanLine size={28} color="rgba(93, 211, 243, 0.9)" />
                    </View>
                )}
            </View>
            <Text style={styles.hint}>
                {IS_WEB
                    ? cameraError
                        ? 'Sin cámara: reintentá o usá el modo Código'
                        : 'Apuntá al QR del cliente — validamos antes de canjear'
                    : canUseNativeCamera
                      ? 'Apuntá al QR del cliente — validamos antes de canjear'
                      : 'Sin cámara: usá el modo Código'}
            </Text>
        </View>
    );

    if (!canAccessPos) {
        return (
            <View style={[styles.container, styles.gateWrap]}>
                <LinearGradient
                    colors={
                        isDark
                            ? ['#09090B', '#0C1222', '#09090B']
                            : ['#F8FAFC', '#EFF6FF', '#F8FAFC']
                    }
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                <AlertTriangle size={48} color="#EF4444" />
                <Text style={[styles.resultTitle, { color: c.text }]}>
                    Acceso solo negocio
                </Text>
                <Text style={styles.resultSub}>
                    {!sessionToken
                        ? 'Iniciá sesión con una cuenta de negocio para canjear bonos.'
                        : 'Esta pantalla es el POS de canje. Las cuentas de comprador o influencer no pueden usarla.'}
                </Text>
                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.primaryBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

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
                    <Text style={styles.headerTitle}>Canjear bono</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>
                        {user?.name || user?.nickname || 'Negocio'}
                        {issuedBonos.length > 0
                            ? ` · ${issuedBonos.length} pendiente${issuedBonos.length === 1 ? '' : 's'}`
                            : ''}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {showKycWarning ? (
                <View style={styles.kycBanner}>
                    <AlertTriangle size={16} color="#F59E0B" />
                    <Text style={styles.kycBannerText}>
                        KYC pendiente. Podés canjear, pero completá la verificación para
                        operar sin límites.
                    </Text>
                </View>
            ) : null}

            {!showResultPanel && (
                <View style={styles.modeRow}>
                    <TouchableOpacity
                        style={[styles.modeChip, mode === 'scan' && styles.modeChipActive]}
                        onPress={() => {
                            setMode('scan');
                            setCameraError(false);
                            setWebCameraReady(false);
                            if (IS_WEB) setWebRestartToken((n) => n + 1);
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
                        style={[
                            styles.modeChip,
                            mode === 'manual' && styles.modeChipActive,
                        ]}
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
                            Código
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Web: keep viewfinder outside ScrollView so <video> has stable size */}
            {IS_WEB && !showResultPanel && mode === 'scan' ? (
                <View style={styles.webScanDock}>
                    {renderScanViewfinder()}
                </View>
            ) : null}

            <ScrollView
                contentContainerStyle={[
                    styles.scroll,
                    { paddingBottom: insets.bottom + 28 },
                ]}
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
                                {searchCode ? (
                                    <Text style={styles.codeBadge}>{searchCode}</Text>
                                ) : null}
                                <TouchableOpacity
                                    style={styles.primaryBtn}
                                    onPress={resetScanner}
                                >
                                    <RefreshCw size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Otro canje</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.ghostBtn}
                                    onPress={() => navigation.goBack()}
                                >
                                    <Text style={styles.ghostBtnText}>Listo</Text>
                                </TouchableOpacity>
                            </>
                        ) : phase === 'error' ? (
                            <>
                                <AlertTriangle size={56} color="#EF4444" />
                                <Text style={[styles.resultTitle, { color: '#EF4444' }]}>
                                    {resultTitle || 'No se pudo canjear'}
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
                                    <Text style={styles.primaryBtnText}>
                                        Intentar de nuevo
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : canConfirm && lookupResult ? (
                            <>
                                <ShieldCheck size={48} color={c.primary} />
                                <Text style={styles.resultTitle}>Confirmar canje</Text>
                                <Text style={styles.previewTitle} numberOfLines={2}>
                                    {(lookupResult as any).listing?.title || 'Bono'}
                                </Text>
                                <View style={styles.previewMeta}>
                                    <Text style={styles.previewMetaLine}>
                                        Cliente:{' '}
                                        {(lookupResult as any).ownerName || 'Cliente'}
                                    </Text>
                                    <Text style={styles.previewMetaLine}>
                                        Crédito:{' '}
                                        {formatMoney(
                                            (lookupResult as any).creditRemaining ??
                                                (lookupResult as any).creditTotal,
                                        )}
                                    </Text>
                                    <Text style={styles.previewMetaLine}>
                                        Vence:{' '}
                                        {formatExpiry((lookupResult as any).validUntil)}
                                    </Text>
                                    <Text style={styles.codeBadge}>{searchCode}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.primaryBtn}
                                    onPress={handleConfirmRedeem}
                                >
                                    <CheckCircle size={18} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Canjear</Text>
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
                        {!IS_WEB && mode === 'scan' ? renderScanViewfinder() : null}

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
                                    <Text style={styles.primaryBtnText}>Buscar</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.listCard}>
                            <View style={styles.listHeader}>
                                <Ticket size={18} color={c.primary} />
                                <Text style={styles.sectionLabel}>
                                    Pendientes de canje
                                </Text>
                            </View>
                            {sellerBonos === undefined ? (
                                <ActivityIndicator
                                    color={c.primary}
                                    style={{ marginVertical: 16 }}
                                />
                            ) : issuedBonos.length === 0 ? (
                                <Text style={styles.emptyList}>
                                    No hay bonos pendientes. Cuando un cliente compre un
                                    bono tuyo, aparece acá.
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
                                            <Text
                                                style={styles.bonoTitle}
                                                numberOfLines={1}
                                            >
                                                {bono.listing?.title || 'Bono'}
                                            </Text>
                                            <Text
                                                style={styles.bonoMeta}
                                                numberOfLines={1}
                                            >
                                                {bono.bonoCode}
                                                {bono.buyer?.name || bono.buyer?.nickname
                                                    ? ` · ${bono.buyer?.name || bono.buyer?.nickname}`
                                                    : ''}
                                            </Text>
                                        </View>
                                        <View style={styles.redeemChip}>
                                            <Text style={styles.redeemChipText}>
                                                Ver
                                            </Text>
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
        gateWrap: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: Space[6],
            gap: Space[3],
        },
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
        headerTitle: {
            color: c.text,
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
        },
        headerSub: {
            color: c.textMuted,
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
        },
        kycBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: Space[4],
            marginTop: Space[2],
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: Radius.lg,
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderWidth: 1,
            borderColor: 'rgba(245, 158, 11, 0.35)',
        },
        kycBannerText: {
            flex: 1,
            color: isDark ? '#FCD34D' : '#92400E',
            fontSize: 12,
            fontWeight: '600',
            lineHeight: 16,
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
        webScanDock: {
            paddingHorizontal: Space[4],
            paddingTop: Space[2],
            paddingBottom: Space[1],
            alignItems: 'center',
        },
        viewfinderWrap: { alignItems: 'center', gap: Space[3], width: '100%' },
        statusPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.full,
            backgroundColor: glass.bg,
            borderWidth: 1,
            borderColor: glass.border,
        },
        statusDot: { width: 8, height: 8, borderRadius: 4 },
        statusPillText: {
            color: c.textMuted,
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.3,
        },
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
        previewMeta: {
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
        },
        previewMetaLine: {
            fontSize: 14,
            color: c.textMuted,
            textAlign: 'center',
            lineHeight: 20,
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
            marginTop: 4,
        },
        loadingText: {
            color: c.text,
            marginTop: 12,
            fontSize: 16,
            fontWeight: '600',
        },
    });
