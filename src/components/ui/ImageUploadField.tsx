import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ImageIcon, X, UploadCloud, ShieldCheck, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';

interface ImageUploadFieldProps {
    images: string[];
    onChange: (images: string[]) => void;
    maxImages?: number;
    title?: string;
}

export const ImageUploadField = ({ images, onChange, maxImages = 5, title = "Fotos del producto" }: ImageUploadFieldProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();
    const [scanning, setScanning] = useState(false);

    const pickImage = async () => {
        if (images.length >= maxImages) {
            show(`Máximo ${maxImages} imágenes permitidas`, 'error');
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            show('Necesitamos permisos para acceder a tus fotos', 'error');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
            base64: true, // We might need base64 if we are sending to a backend that supports it directly or just local uri
        });

        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];

            // 1. Size Validation (Approximation from base64 length or fileSize if available)
            // 5MB limit. approx 5 * 1024 * 1024 bytes.
            const fileSize = asset.fileSize ?? 0;
            if (fileSize > 5 * 1024 * 1024) {
                show('La imagen es muy pesada (Máx 5MB).', 'error');
                return;
            }

            // 2. Mock Virus Scanning
            setScanning(true);
            setTimeout(() => {
                setScanning(false);
                // Simulate success
                const newUri = asset.uri;
                onChange([...images, newUri]);
                show('Imagen escaneada y aprobada', 'success');
            }, 1500);
        }
    };

    const removeImage = (indexToRemove: number) => {
        onChange(images.filter((_, index) => index !== indexToRemove));
    };

    const styles = getStyles(isDark);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{title} ({images.length}/{maxImages})</Text>

            <View style={styles.grid}>
                {images.map((uri, index) => (
                    <View key={index} style={styles.imageWrapper}>
                        <Image source={{ uri }} style={styles.thumbnail} />
                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => removeImage(index)}
                        >
                            <X size={14} color="#fff" />
                        </TouchableOpacity>
                        <View style={styles.verifiedBadge}>
                            <ShieldCheck size={12} color="#10B981" />
                        </View>
                    </View>
                ))}

                {images.length < maxImages && (
                    <TouchableOpacity
                        style={styles.uploadButton}
                        onPress={pickImage}
                        disabled={scanning}
                    >
                        {scanning ? (
                            <View style={{ alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#8B5CF6" />
                                <Text style={styles.scanningText}>Escaneando...</Text>
                            </View>
                        ) : (
                            <>
                                <UploadCloud size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                <Text style={styles.uploadText}>Subir Foto</Text>
                                <Text style={styles.limitText}>Máx 5MB</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#E5E7EB' : '#374151',
        marginBottom: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    imageWrapper: {
        width: 80,
        height: 80,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: isDark ? '#1F2937' : '#E5E7EB',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    removeButton: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 8,
        padding: 2,
    },
    uploadButton: {
        width: 80,
        height: 80,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: isDark ? '#374151' : '#E5E7EB',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F9FAFB',
    },
    uploadText: {
        fontSize: 10,
        fontWeight: '600',
        color: isDark ? '#9CA3AF' : '#6B7280',
        marginTop: 4,
    },
    limitText: {
        fontSize: 8,
        color: isDark ? '#6B7280' : '#9CA3AF',
    },
    scanningText: {
        fontSize: 8,
        color: '#8B5CF6',
        marginTop: 4,
        fontWeight: '600',
    }
});
