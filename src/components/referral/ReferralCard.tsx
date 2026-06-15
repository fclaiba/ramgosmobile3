import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Share2, Sparkles } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

interface ReferralCardProps {
    code: string;
    onShare: () => void;
}

export const ReferralCard: React.FC<ReferralCardProps> = ({ code, onShare }) => {
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handleCopy = async () => {
        await Clipboard.setStringAsync(code);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        show('¡Código copiado al portapapeles!', 'success');
    };

    return (
        <View style={[styles.container, isDark && styles.containerDark]}>
            <LinearGradient
                colors={isDark ? ['#4C1D95', '#2E1065'] : ['#8B5CF6', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Sparkles color="#FFD700" size={24} style={{ marginRight: 8 }} />
                        <Text style={styles.title}>Tu Código Mágico</Text>
                    </View>

                    <Text style={styles.description}>
                        Comparte este código y gana $0.05 por cada amigo que se registre.
                    </Text>

                    <View style={styles.codeContainer}>
                        <Text style={styles.code}>{code || 'CARGANDO...'}</Text>
                        <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
                            <Copy size={20} color={isDark ? "#FFF" : "#4B5563"} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={onShare} style={styles.shareButton}>
                        <Share2 size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.shareButtonText}>Compartir Link</Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        borderRadius: 24,
        overflow: 'hidden',
        marginVertical: 16,
        elevation: 8,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    containerDark: {
        shadowColor: isDark ? '#F9FAFB' : '#000',
    },
    gradient: {
        padding: 24,
    },
    content: {
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: isDark ? '#1F2937' : '#fff',
    },
    description: {
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 16,
    },
    codeContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 16,
        padding: 4,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    code: {
        fontSize: 28,
        fontWeight: 'bold',
        color: isDark ? '#1F2937' : '#fff',
        letterSpacing: 2,
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    copyButton: {
        backgroundColor: 'rgba(255,255,255,0.9)',
        padding: 12,
        borderRadius: 12,
        marginRight: 4,
    },
    shareButton: {
        flexDirection: 'row',
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 100,
        alignItems: 'center',
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    shareButtonText: {
        color: isDark ? '#1F2937' : '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
