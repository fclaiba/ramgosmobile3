import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Share2, Copy } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { glassSurface } from '../../utils/glass';
import { useToast } from '../../contexts/ToastContext';

interface Props {
    referralLink: string;
    containerWidth?: number;
}

export default function AffiliateLinkCard({ referralLink, containerWidth }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();

    const handleShare = async () => {
        try {
            await Share.share({
                message: `¡Únete a Ramgos usando mi enlace de afiliado y obtén beneficios exclusivos! ${referralLink}`,
            });
        } catch (error) {
            show('No se pudo compartir', 'error');
        }
    };

    const handleCopy = async () => {
        try {
            const Clipboard = await import('expo-clipboard');
            await Clipboard.setStringAsync(referralLink);
            show('Enlace copiado al portapapeles', 'success');
        } catch (error) {
            show('Error al copiar el enlace', 'error');
        }
    };

    return (
        <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined, glassSurface(isDark, 'regular')]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Share2 size={20} color={isDark ? "#818cf8" : "#4f46e5"} />
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>Tu Enlace de Afiliado</Text>
                </View>
                <Text style={[styles.subtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }]}>
                    Cópialo y pégalo en tu Link in Bio
                </Text>
            </View>
            <View style={styles.codeBox}>
                <View style={styles.codeTextWrapper}>
                    <Text style={[styles.codeText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                        {referralLink}
                    </Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={handleCopy} style={[styles.btn, styles.btnGhost]}>
                        <Copy size={16} color="#4f46e5" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleShare} style={[styles.btn, styles.btnPrimary]}>
                        <Share2 size={16} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 16,
        padding: 16,
    },
    header: {
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    title: {
        fontWeight: '700',
        fontSize: 16,
    },
    subtitle: {
        fontSize: 13,
    },
    codeBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(128,128,128,0.1)',
        borderRadius: 8,
        padding: 8,
        paddingLeft: 12,
    },
    codeTextWrapper: {
        flex: 1,
        minWidth: 0,
        marginRight: 8,
    },
    codeText: {
        fontSize: 14,
        fontFamily: 'monospace',
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    btn: {
        padding: 8,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnGhost: {
        backgroundColor: 'rgba(79,70,229,0.1)',
    },
    btnPrimary: {
        backgroundColor: '#4f46e5',
    },
});
