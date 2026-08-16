/**
 * Web-only QR scanner for the business POS.
 * Uses getUserMedia + barcode-detector (zxing-wasm polyfill) — not expo-camera.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Camera as CameraIcon, RefreshCw, FlipHorizontal } from 'lucide-react-native';
import { BarcodeDetector } from 'barcode-detector';
import { Radius, Space } from '../../theme/tokens';

export type WebCameraFacing = 'environment' | 'user';

type Props = {
    active: boolean;
    /** When true, keep preview but stop emitting scans (parent lock / preview phase). */
    paused?: boolean;
    facing: WebCameraFacing;
    onScan: (data: string) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
    onFlipFacing?: () => void;
    onGoManual?: () => void;
    /** Bump to force a full camera restart from the parent. */
    restartToken?: number;
};

const SCAN_INTERVAL_MS = 280;

function stopStream(stream: MediaStream | null) {
    if (!stream) return;
    for (const track of stream.getTracks()) {
        try {
            track.stop();
        } catch {
            /* ignore */
        }
    }
}

async function requestCameraStream(facing: WebCameraFacing): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite acceso a la cámara.');
    }

    try {
        return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: facing },
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
        });
    } catch {
        return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
        });
    }
}

async function waitForVideoEl(
    getEl: () => HTMLVideoElement | null,
    cancelled: () => boolean,
): Promise<HTMLVideoElement | null> {
    for (let i = 0; i < 20; i++) {
        if (cancelled()) return null;
        const el = getEl();
        if (el) return el;
        await new Promise((r) => setTimeout(r, 50));
    }
    return getEl();
}

export default function WebBonoQrScanner({
    active,
    paused = false,
    facing,
    onScan,
    onReady,
    onError,
    onFlipFacing,
    onGoManual,
    restartToken = 0,
}: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<InstanceType<typeof BarcodeDetector> | null>(null);
    const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const runningRef = useRef(false);
    const pausedRef = useRef(paused);
    const onScanRef = useRef(onScan);
    const onReadyRef = useRef(onReady);
    const onErrorRef = useRef(onError);

    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);
    useEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);
    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    const cleanup = useCallback(() => {
        runningRef.current = false;
        if (loopTimerRef.current) {
            clearTimeout(loopTimerRef.current);
            loopTimerRef.current = null;
        }
        stopStream(streamRef.current);
        streamRef.current = null;
        const video = videoRef.current;
        if (video) {
            video.srcObject = null;
        }
    }, []);

    const startDetectLoop = useCallback(() => {
        const tick = async () => {
            if (!runningRef.current) return;
            const video = videoRef.current;
            const detector = detectorRef.current;
            try {
                if (
                    !pausedRef.current &&
                    video &&
                    detector &&
                    video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
                    video.videoWidth > 0
                ) {
                    const bitmap = await createImageBitmap(video);
                    try {
                        const codes = await detector.detect(bitmap);
                        const first = codes?.[0] as { rawValue?: string } | undefined;
                        const raw =
                            first && typeof first.rawValue === 'string'
                                ? first.rawValue.trim()
                                : '';
                        if (raw) {
                            onScanRef.current(raw);
                        }
                    } finally {
                        bitmap.close();
                    }
                }
            } catch {
                // Frame drop — keep looping
            }
            if (runningRef.current) {
                loopTimerRef.current = setTimeout(tick, SCAN_INTERVAL_MS);
            }
        };
        if (loopTimerRef.current) {
            clearTimeout(loopTimerRef.current);
        }
        loopTimerRef.current = setTimeout(tick, SCAN_INTERVAL_MS);
    }, []);

    useEffect(() => {
        if (!active) {
            cleanup();
            setStatus('loading');
            return;
        }

        let cancelled = false;
        setStatus('loading');
        setErrorMessage('');

        const boot = async () => {
            if (typeof window !== 'undefined' && !window.isSecureContext) {
                const msg =
                    'La cámara en el navegador requiere HTTPS o localhost. Abrí la app en un contexto seguro.';
                if (!cancelled) {
                    setStatus('error');
                    setErrorMessage(msg);
                    onErrorRef.current?.(msg);
                }
                return;
            }

            try {
                if (!detectorRef.current) {
                    detectorRef.current = new BarcodeDetector({
                        formats: ['qr_code'],
                    });
                }

                const stream = await requestCameraStream(facing);
                if (cancelled) {
                    stopStream(stream);
                    return;
                }

                streamRef.current = stream;
                const video = await waitForVideoEl(
                    () => videoRef.current,
                    () => cancelled,
                );
                if (!video) {
                    stopStream(stream);
                    throw new Error('No se pudo inicializar el preview de cámara.');
                }

                video.srcObject = stream;
                video.setAttribute('playsinline', 'true');
                video.muted = true;
                await video.play().catch(() => {
                    /* muted + playsinline usually satisfies autoplay */
                });

                if (cancelled) {
                    cleanup();
                    return;
                }

                setStatus('ready');
                onReadyRef.current?.();
                runningRef.current = true;
                startDetectLoop();
            } catch (e: any) {
                if (cancelled) return;
                const msg =
                    e?.name === 'NotAllowedError'
                        ? 'Permiso de cámara denegado. Permití el acceso o usá el modo Código.'
                        : e?.message ||
                          'No se pudo iniciar la cámara. Probá de nuevo o usá el modo Código.';
                setStatus('error');
                setErrorMessage(msg);
                onErrorRef.current?.(msg);
                cleanup();
            }
        };

        void boot();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [active, facing, retryKey, restartToken, cleanup, startDetectLoop]);

    return (
        <View style={styles.wrap}>
            <video
                ref={(el: HTMLVideoElement | null) => {
                    videoRef.current = el;
                }}
                style={videoStyle as any}
                muted
                playsInline
                autoPlay
            />

            {status === 'loading' && (
                <View style={styles.overlayCenter}>
                    <ActivityIndicator size="large" color="#5DD3F3" />
                    <Text style={styles.overlayText}>Iniciando cámara…</Text>
                </View>
            )}

            {status === 'error' && (
                <View style={styles.overlayCenter}>
                    <CameraIcon size={40} color="#94A3B8" />
                    <Text style={styles.overlayTitle}>No se pudo usar la cámara</Text>
                    <Text style={styles.overlayText}>{errorMessage}</Text>
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => setRetryKey((k) => k + 1)}
                    >
                        <RefreshCw size={16} color="#5DD3F3" />
                        <Text style={styles.secondaryBtnText}>Reintentar</Text>
                    </TouchableOpacity>
                    {onFlipFacing ? (
                        <TouchableOpacity style={styles.ghostBtn} onPress={onFlipFacing}>
                            <FlipHorizontal size={16} color="#CBD5E1" />
                            <Text style={styles.ghostBtnText}>Cambiar cámara</Text>
                        </TouchableOpacity>
                    ) : null}
                    {onGoManual ? (
                        <TouchableOpacity style={styles.ghostBtn} onPress={onGoManual}>
                            <Text style={styles.ghostBtnText}>Ir a código manual</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}

            {status === 'ready' && onFlipFacing ? (
                <TouchableOpacity
                    style={styles.flipFab}
                    onPress={onFlipFacing}
                    accessibilityLabel="Cambiar cámara"
                >
                    <FlipHorizontal size={18} color="#fff" />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const videoStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    backgroundColor: '#000',
};

const styles = StyleSheet.create({
    wrap: {
        ...StyleSheet.absoluteFill,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    overlayCenter: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Space[5],
        gap: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
    },
    overlayTitle: {
        color: '#F8FAFC',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    overlayText: {
        color: '#94A3B8',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
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
    ghostBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    ghostBtnText: { color: '#CBD5E1', fontWeight: '700', fontSize: 13 },
    flipFab: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
});
