import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Platform,
    KeyboardAvoidingView,
    ActivityIndicator,
    StatusBar,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    AlertTriangle,
    Camera,
    Package,
    HeartCrack,
    HelpCircle,
    Puzzle,
    AlertOctagon,
    CheckCircle2,
    ChevronLeft,
    X,
    Upload,
} from 'lucide-react-native';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import * as ImagePicker from 'expo-image-picker';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const REASONS = [
    { id: 'not_received', label: 'Producto no recibido', Icon: Package, description: 'No llegó el pedido en el plazo acordado' },
    { id: 'damaged', label: 'Producto dañado', Icon: HeartCrack, description: 'Llegó roto, defectuoso o en mal estado' },
    { id: 'not_as_described', label: 'No coincide con la descripción', Icon: HelpCircle, description: 'Diferente a las fotos o descripción' },
    { id: 'missing_parts', label: 'Faltan partes/accesorios', Icon: Puzzle, description: 'Incompleto o sin accesorios prometidos' },
    { id: 'counterfeit', label: 'Falso / réplica', Icon: AlertOctagon, description: 'Réplica o imitación no autorizada' },
] as const;

export default function DisputeReasonScreen({ route, navigation }: any) {
    const { orderId } = route.params || {};
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const styles = getStyles(isDark, insets);
    const { user } = useAuth();

    const [reason, setReason] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const addEvidence = useMutation(api.disputes.addEvidence);

    const scrollY = useSharedValue(0);
    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [60, 120], [0, 1], Extrapolation.CLAMP),
    }));

    const handleUploadEvidence = async () => {
        if (!user) { show('Debes iniciar sesión', 'error'); return; }
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { show('Permiso de galería requerido', 'error'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsMultipleSelection: false,
        });
        if (result.canceled || !result.assets[0]) return;

        setUploading(true);
        try {
            const uploadUrl = await generateUploadUrl({});
            const asset = result.assets[0];
            let blob: Blob;
            try {
                const fetchResponse = await fetch(asset.uri);
                blob = await fetchResponse.blob();
            } catch (err) {
                blob = await new Promise<Blob>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function() { resolve(xhr.response); };
                    xhr.onerror = function() { reject(new TypeError('Network request failed')); };
                    xhr.responseType = 'blob';
                    xhr.open('GET', asset.uri, true);
                    xhr.send(null);
                });
            }

            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
                body: blob,
            });
            const { storageId } = await response.json();
            const fileUrl = `convex-storage:${storageId}`;

            await addEvidence({
                orderId,
                uploadedBy: 'buyer',
                type: 'photo',
                url: fileUrl,
                description: description || reason || 'Evidencia fotográfica',
            });

            setEvidenceUrls((prev) => [...prev, fileUrl]);
            show('Evidencia subida correctamente', 'success');
        } catch (e: any) {
            show(e.message || 'Error al subir evidencia', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveEvidence = (index: number) => {
        setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if (!reason || !description.trim()) {
            show('Selecciona motivo y describe el problema', 'error');
            return;
        }
        navigation.navigate('Dispute', { orderId, prefillReason: reason, prefillDescription: description });
    };

    const selectedReason = REASONS.find((r) => r.id === reason);

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <View style={styles.headerTitles}>
                    <Text style={styles.headerTitle}>Reportar Problema</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <Animated.View style={[styles.stickyHeader, headerOpacity]}>
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyTitle}>Reportar Problema</Text>
                </View>
            </Animated.View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                    scrollEventThrottle={16}
                >
                    {/* Intro */}
                    <View style={styles.introCard}>
                        <View style={styles.introIconWrap}>
                            <AlertTriangle size={28} color="#EF4444" />
                        </View>
                        <Text style={styles.introTitle}>¿Qué salió mal?</Text>
                        <Text style={styles.introText}>
                            Elegí un motivo y describí el problema. Después vas a poder adjuntar evidencias y abrir el chat de disputa.
                        </Text>
                    </View>

                    {/* Reasons */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Motivo del reclamo</Text>
                        {REASONS.map((r) => {
                            const Icon = r.Icon;
                            const active = reason === r.id;
                            return (
                                <TouchableOpacity
                                    key={r.id}
                                    style={[styles.reasonRow, active && styles.reasonRowActive]}
                                    onPress={() => setReason(r.id)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.reasonIconWrap, active && { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }]}>
                                        <Icon size={20} color={active ? '#EF4444' : isDark ? '#9CA3AF' : '#6B7280'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.reasonLabel, active && { color: '#EF4444' }]}>{r.label}</Text>
                                        <Text style={styles.reasonDesc}>{r.description}</Text>
                                    </View>
                                    {active && <CheckCircle2 size={22} color="#EF4444" />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Evidence */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Evidencias (opcional)</Text>
                        <TouchableOpacity style={styles.uploadBox} onPress={handleUploadEvidence} disabled={uploading} activeOpacity={0.8}>
                            {uploading ? (
                                <ActivityIndicator size="small" color="#7C3AED" />
                            ) : (
                                <>
                                    <Camera size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                    <Text style={styles.uploadText}>
                                        {evidenceUrls.length > 0 ? `${evidenceUrls.length} foto(s) adjunta(s)` : 'Subir fotos / video'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {evidenceUrls.length > 0 && (
                            <View style={styles.evidenceGrid}>
                                {evidenceUrls.map((url, index) => (
                                    <View key={`${url}-${index}`} style={styles.evidenceItem}>
                                        <Image source={{ uri: url.replace('convex-storage:', 'https://storage.convex.cloud/') }} style={styles.evidenceImage} />
                                        <TouchableOpacity style={styles.evidenceRemove} onPress={() => handleRemoveEvidence(index)}>
                                            <X size={14} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Describe el problema</Text>
                        <View style={styles.inputWrap}>
                            <TextInput
                                style={styles.input}
                                placeholder="Explica detalladamente lo sucedido..."
                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                multiline
                                textAlignVertical="top"
                                value={description}
                                onChangeText={setDescription}
                            />
                        </View>
                        <Text style={[styles.charCount, description.length > 0 && description.length < 10 && { color: '#EF4444' }]}>
                            {description.length} caracteres (mínimo 10)
                        </Text>
                    </View>

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.footerBtn, (!reason || !description.trim()) && styles.footerBtnDisabled]}
                        onPress={handleSubmit}
                        activeOpacity={0.85}
                        disabled={!reason || !description.trim()}
                    >
                        <Text style={[styles.footerBtnText, (!reason || !description.trim()) && styles.footerBtnTextDisabled]}>
                            Continuar
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

import { StyleSheet } from 'react-native';

function getStyles(isDark: boolean, insets: any) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = '#7C3AED';

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },

        header: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
        },
        iconBtn: {
            width: 42,
            height: 42,
            borderRadius: 21,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.9)',
        },
        headerTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
        headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },

        stickyHeader: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            height: insets.top + 56,
            overflow: 'hidden',
        },
        stickyHeaderContent: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 60,
        },
        stickyTitle: { fontSize: 17, fontWeight: '800', color: text },

        scroll: { flex: 1 },
        scrollContent: { paddingTop: insets.top + 70, paddingHorizontal: 16, paddingBottom: 24 },

        introCard: {
            backgroundColor: surface,
            borderRadius: 20,
            padding: 22,
            alignItems: 'center',
            marginBottom: 18,
            borderWidth: 1,
            borderColor: border,
        },
        introIconWrap: {
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 14,
        },
        introTitle: { fontSize: 20, fontWeight: '800', color: text, marginBottom: 6 },
        introText: { fontSize: 14, color: muted, textAlign: 'center', lineHeight: 20 },

        section: { marginBottom: 20 },
        sectionTitle: { fontSize: 17, fontWeight: '800', color: text, marginBottom: 12 },
        reasonRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: surface,
            borderRadius: 16,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: border,
        },
        reasonRowActive: {
            borderColor: '#EF4444',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : '#FEF2F2',
        },
        reasonIconWrap: {
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        reasonLabel: { fontSize: 15, fontWeight: '700', color: text },
        reasonDesc: { fontSize: 12, color: muted, marginTop: 2 },

        uploadBox: {
            height: 90,
            borderRadius: 18,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: border,
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
        },
        uploadText: { fontSize: 14, color: muted, fontWeight: '600' },
        evidenceGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 14,
        },
        evidenceItem: {
            width: 80,
            height: 80,
            borderRadius: 14,
            overflow: 'hidden',
            position: 'relative',
        },
        evidenceImage: { width: '100%', height: '100%' },
        evidenceRemove: {
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
        },

        inputWrap: {
            backgroundColor: surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: border,
            padding: 16,
        },
        input: {
            minHeight: 140,
            fontSize: 15,
            color: text,
            lineHeight: 22,
        },
        charCount: { fontSize: 12, color: muted, marginTop: 8, textAlign: 'right', fontWeight: '500' },

        footer: {
            backgroundColor: surface,
            borderTopWidth: 1,
            borderTopColor: border,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
        },
        footerBtn: {
            backgroundColor: '#EF4444',
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
        },
        footerBtnDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
        footerBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
        footerBtnTextDisabled: { color: muted },
    });
}
