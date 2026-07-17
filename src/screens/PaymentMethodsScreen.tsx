import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import {
    CreditCard,
    Plus,
    Star,
    Trash2,
    ShieldCheck,
    FlaskConical,
} from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { useSavedPaymentMethods } from '../payments/hooks/useSavedPaymentMethods';
import { formatCardNumber, type TestCard } from '../payments/testCards';
import { colors, Radius, Space } from '../theme/tokens';

function brandColor(brand: string) {
    const b = brand.toLowerCase();
    if (b === 'visa') return '#1A1F71';
    if (b === 'mastercard') return '#EB001B';
    if (b === 'amex') return '#2E77BB';
    return '#7C3AED';
}

export default function PaymentMethodsScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);
    const { show } = useToast();
    const { isTest } = usePaymentMode();
    const {
        cards,
        loading,
        busyId,
        addFromTestCard,
        removeCard,
        setDefault,
        testCatalog,
    } = useSavedPaymentMethods();

    const [addOpen, setAddOpen] = useState(false);

    const handleAdd = async (testCard: TestCard) => {
        try {
            await addFromTestCard(testCard);
            setAddOpen(false);
            show(`${testCard.label} •••• ${testCard.last4} agregada`, 'success');
        } catch {
            show('No se pudo agregar la tarjeta', 'error');
        }
    };

    const handleDefault = async (card: typeof cards[0]) => {
        try {
            await setDefault(card);
            show('Método predeterminado actualizado', 'success');
        } catch {
            show('No se pudo actualizar', 'error');
        }
    };

    const handleRemove = async (card: typeof cards[0]) => {
        try {
            await removeCard(card);
            show('Método eliminado', 'info');
        } catch {
            show('No se pudo eliminar', 'error');
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Métodos de Pago"
                subtitle={isTest ? 'Modo TEST · tarjetas simuladas' : 'Tarjetas guardadas'}
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {isTest && (
                    <View style={styles.banner}>
                        <FlaskConical size={18} color="#F59E0B" />
                        <Text style={styles.bannerText}>
                            Pagos en modo TEST. Las tarjetas se guardan en este dispositivo para checkout simulado. No se cobra dinero real.
                        </Text>
                    </View>
                )}

                <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Tus tarjetas</Text>
                    <Text style={styles.sectionMeta}>{cards.length}</Text>
                </View>

                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator color={c.primary} />
                    </View>
                ) : cards.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <CreditCard size={36} color={c.textSubtle} />
                        <Text style={styles.emptyTitle}>Sin métodos guardados</Text>
                        <Text style={styles.emptyBody}>
                            Agregá una tarjeta de prueba para pagar más rápido en el marketplace.
                        </Text>
                    </View>
                ) : (
                    cards.map((card) => {
                        const busy = busyId === card.id;
                        return (
                            <View key={card.id} style={styles.card}>
                                <View style={[styles.brandChip, { backgroundColor: brandColor(card.brand) }]}>
                                    <CreditCard size={18} color="#fff" />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardTitle} numberOfLines={1}>
                                            {card.label} •••• {card.last4}
                                        </Text>
                                        {card.isDefault && (
                                            <View style={styles.defaultPill}>
                                                <Star size={10} color="#F59E0B" fill="#F59E0B" />
                                                <Text style={styles.defaultPillText}>Principal</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.cardMeta}>
                                        {card.expMonth && card.expYear
                                            ? `Vence ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
                                            : 'Tarjeta guardada'}
                                        {card.source === 'local' ? ' · Local' : ' · Stripe'}
                                    </Text>
                                    <View style={styles.cardActions}>
                                        {!card.isDefault && (
                                            <TouchableOpacity
                                                style={styles.actionChip}
                                                disabled={busy}
                                                onPress={() => handleDefault(card)}
                                            >
                                                <Text style={styles.actionChipText}>Usar por defecto</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={[styles.actionChip, styles.actionDanger]}
                                            disabled={busy}
                                            onPress={() => handleRemove(card)}
                                        >
                                            {busy ? (
                                                <ActivityIndicator size="small" color="#EF4444" />
                                            ) : (
                                                <>
                                                    <Trash2 size={12} color="#EF4444" />
                                                    <Text style={styles.actionDangerText}>Eliminar</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}

                <Button style={{ marginTop: Space[2] }} onPress={() => setAddOpen(true)}>
                    <View style={styles.btnInner}>
                        <Plus size={18} color="#fff" />
                        <Text style={styles.btnText}>Agregar tarjeta</Text>
                    </View>
                </Button>

                <View style={styles.safeNote}>
                    <ShieldCheck size={16} color={c.primary} />
                    <Text style={styles.safeNoteText}>
                        Ramgos no almacena el número completo de tu tarjeta. En producción usamos Stripe (PCI).
                    </Text>
                </View>
            </ScrollView>

            <Sheet open={addOpen} onOpenChange={setAddOpen}>
                <SheetContent side="bottom" style={styles.sheet}>
                    <SheetHeader>
                        <SheetTitle>Elegí una tarjeta de prueba</SheetTitle>
                    </SheetHeader>
                    <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
                        {testCatalog.map((tc) => (
                            <TouchableOpacity
                                key={tc.id}
                                style={styles.catalogRow}
                                onPress={() => handleAdd(tc)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.brandChipSm, { backgroundColor: brandColor(tc.brand) }]}>
                                    <Text style={styles.brandChipSmText}>{tc.label.slice(0, 2).toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.catalogTitle}>{tc.label}</Text>
                                    <Text style={styles.catalogMeta}>{formatCardNumber(tc.number)}</Text>
                                </View>
                                <Plus size={18} color={c.primary} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: c.bg },
        content: { padding: Space[4], paddingBottom: 120, gap: Space[3] },
        banner: {
            flexDirection: 'row',
            gap: 10,
            padding: 14,
            borderRadius: Radius.lg,
            backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FEF3C7',
            borderLeftWidth: 3,
            borderLeftColor: '#F59E0B',
            alignItems: 'flex-start',
        },
        bannerText: { flex: 1, fontSize: 13, lineHeight: 18, color: isDark ? '#FCD34D' : '#92400E' },
        sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
        sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
        sectionMeta: { fontSize: 13, fontWeight: '700', color: c.primary },
        centerBox: { paddingVertical: 48, alignItems: 'center' },
        emptyCard: {
            alignItems: 'center',
            padding: 28,
            borderRadius: Radius.xl,
            backgroundColor: c.glass,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            gap: 8,
        },
        emptyTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 8 },
        emptyBody: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 18 },
        card: {
            flexDirection: 'row',
            gap: 14,
            padding: 16,
            borderRadius: Radius.xl,
            backgroundColor: c.glassStrong,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            ...Platform.select({
                ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
                android: { elevation: 2 },
                default: {},
            }),
        },
        brandChip: {
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
        cardTitle: { fontSize: 15, fontWeight: '700', color: c.text, flexShrink: 1 },
        defaultPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : '#FEF3C7',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: Radius.full,
        },
        defaultPillText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
        cardMeta: { fontSize: 12, color: c.textMuted, marginBottom: 10 },
        cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        actionChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: Radius.full,
            backgroundColor: c.primaryMuted,
        },
        actionChipText: { fontSize: 12, fontWeight: '600', color: c.primarySoft },
        actionDanger: { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2' },
        actionDangerText: { fontSize: 12, fontWeight: '600', color: '#EF4444' },
        btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
        safeNote: {
            flexDirection: 'row',
            gap: 10,
            padding: 14,
            borderRadius: Radius.lg,
            backgroundColor: c.primaryMuted,
            marginTop: 8,
        },
        safeNoteText: { flex: 1, fontSize: 12, lineHeight: 17, color: c.textMuted },
        sheet: {
            backgroundColor: c.bgElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
        },
        catalogRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: Radius.lg,
            backgroundColor: c.glass,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        brandChipSm: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        brandChipSmText: { color: '#fff', fontSize: 11, fontWeight: '800' },
        catalogTitle: { fontSize: 14, fontWeight: '700', color: c.text },
        catalogMeta: { fontSize: 12, color: c.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] as any },
    });
