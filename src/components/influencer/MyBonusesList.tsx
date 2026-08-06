import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform, Image } from 'react-native';
import { Copy, Gift, Share2 } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { glassSurface, glassChip } from '../../utils/glass';
import { useReferral } from '../../contexts/ReferralContext';
import { buildBonoShareLink } from '../../utils/bonoDeepLink';

interface BonusItem {
    _id: string;
    title: string;
    description: string;
    price?: number;
    discountValue?: number;
    discountPercent?: number;
    status: string;
    image?: string;
}

interface Props {
    bonuses: BonusItem[];
    containerWidth?: number;
}

function formatMoney(n: number | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `$${Number(n)}`;
}

export default function MyBonusesList({ bonuses, containerWidth }: Props) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const { show } = useToast();
    const { referralLink, referralCode } = useReferral();

    const shareBase = referralLink || referralCode || '';

    const buildLink = (bonus: BonusItem) =>
        buildBonoShareLink({
            referralCodeOrLink: shareBase,
            listingId: bonus._id,
        });

    const handleCopy = async (bonus: BonusItem) => {
        try {
            const Clipboard = await import('expo-clipboard');
            const bonusLink = buildLink(bonus);
            if (!bonusLink) {
                show('No se pudo armar el enlace', 'error');
                return;
            }
            await Clipboard.setStringAsync(bonusLink);
            show('Enlace del bono copiado', 'success');
        } catch {
            show('Error al copiar', 'error');
        }
    };

    const handleShare = async (bonus: BonusItem) => {
        try {
            const bonusLink = buildLink(bonus);
            if (!bonusLink) {
                show('No se pudo armar el enlace', 'error');
                return;
            }
            await Share.share({
                title: bonus.title,
                message:
                    Platform.OS === 'ios'
                        ? `${bonus.title}\nPagás ${formatMoney(bonus.price)} · Crédito ${formatMoney(bonus.discountValue)}\n${bonusLink}`
                        : `${bonus.title} — Pagás ${formatMoney(bonus.price)} · Crédito ${formatMoney(bonus.discountValue)}\n${bonusLink}`,
                url: Platform.OS === 'ios' ? bonusLink : undefined,
            });
        } catch {
            /* user cancelled */
        }
    };

    if (bonuses.length === 0) {
        return (
            <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined]}>
                <View style={styles.header}>
                    <Gift size={20} color={isDark ? '#818cf8' : '#4f46e5'} />
                    <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>Mis Bonos</Text>
                </View>
                <View style={[styles.emptyBox, glassSurface(isDark, 'subtle')]}>
                    <Text style={[styles.emptyTitle, { color: isDark ? '#fff' : '#111827' }]}>
                        Todavía no tenés bonos
                    </Text>
                    <Text style={[styles.emptySub, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                        Usá “Crear bono” arriba. Acá vas a ver Pagás / Crédito y podés copiar o compartir el link.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, containerWidth ? { maxWidth: containerWidth } : undefined]}>
            <View style={styles.header}>
                <Gift size={20} color={isDark ? '#818cf8' : '#4f46e5'} />
                <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>Mis Bonos Activos</Text>
            </View>

            <View style={styles.list}>
                {bonuses.map((bonus) => {
                    const paid = bonus.price;
                    const credit = bonus.discountValue;
                    const chipLabel =
                        paid != null && credit != null
                            ? `Pagás ${formatMoney(paid)} · Crédito ${formatMoney(credit)}`
                            : credit != null
                              ? `Crédito ${formatMoney(credit)}`
                              : 'Bono';

                    return (
                        <View key={bonus._id} style={[styles.bonusCard, glassSurface(isDark, 'subtle')]}>
                            <View style={styles.bonusHeaderRow}>
                                {bonus.image ? (
                                    <Image
                                        source={{ uri: bonus.image }}
                                        style={styles.bonusThumb}
                                        resizeMode="cover"
                                    />
                                ) : null}
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={[styles.bonusTitle, { color: isDark ? '#fff' : '#111827' }]}
                                        numberOfLines={1}
                                    >
                                        {bonus.title}
                                    </Text>
                                    <Text
                                        style={[styles.bonusDesc, { color: isDark ? '#9CA3AF' : '#6B7280' }]}
                                        numberOfLines={2}
                                    >
                                        {bonus.description}
                                    </Text>
                                </View>
                                <View style={[glassChip(isDark, '#059669'), { maxWidth: 140 }]}>
                                    <Text
                                        style={{
                                            color: '#059669',
                                            fontWeight: 'bold',
                                            fontSize: 11,
                                            textAlign: 'center',
                                        }}
                                    >
                                        {chipLabel}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.bonusFooter}>
                                <View
                                    style={[
                                        styles.statusBadge,
                                        {
                                            backgroundColor:
                                                bonus.status === 'active'
                                                    ? isDark
                                                        ? 'rgba(52, 211, 153, 0.2)'
                                                        : '#D1FAE5'
                                                    : isDark
                                                      ? 'rgba(156, 163, 175, 0.2)'
                                                      : '#F3F4F6',
                                        },
                                    ]}
                                >
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            fontWeight: '600',
                                            color:
                                                bonus.status === 'active'
                                                    ? isDark
                                                        ? '#34D399'
                                                        : '#059669'
                                                    : isDark
                                                      ? '#9CA3AF'
                                                      : '#4B5563',
                                        }}
                                    >
                                        {bonus.status === 'active' ? 'Activo' : 'Pausado'}
                                    </Text>
                                </View>
                                <View style={styles.actions}>
                                    <TouchableOpacity
                                        onPress={() => handleShare(bonus)}
                                        style={[styles.btn, styles.btnOutline]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Compartir enlace del bono"
                                    >
                                        <Share2 size={14} color={isDark ? '#E2E8F0' : '#374151'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleCopy(bonus)}
                                        style={[styles.btn, styles.btnPrimary]}
                                    >
                                        <Copy size={14} color="#fff" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                                            Copiar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'center',
        marginBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
    },
    emptyBox: {
        padding: 20,
        borderRadius: 16,
        gap: 6,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    emptySub: {
        fontSize: 13,
        lineHeight: 18,
    },
    list: {
        gap: 12,
    },
    bonusCard: {
        padding: 16,
        borderRadius: 16,
    },
    bonusHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
    },
    bonusThumb: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: 'rgba(128,128,128,0.15)',
    },
    bonusTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    bonusDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
    bonusFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    btnOutline: {
        borderWidth: 1,
        borderColor: 'rgba(128,128,128,0.25)',
        paddingHorizontal: 10,
    },
    btnPrimary: {
        backgroundColor: '#4f46e5',
    },
});
