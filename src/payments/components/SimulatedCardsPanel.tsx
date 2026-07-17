import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, CreditCard, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { STRIPE_TEST_CARDS, formatCardNumber, type TestCard } from '../testCards';
import { glassTokens } from '../../utils/glass';
import { useToast } from '../../contexts/ToastContext';

const STORAGE_KEY = '@ramgos/user_payment_cards';

export type WalletCard = TestCard & { custom?: boolean };

const detectBrand = (digits: string): string => {
    if (/^4/.test(digits)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
    if (/^3[47]/.test(digits)) return 'amex';
    if (/^6(?:011|5)/.test(digits)) return 'discover';
    if (/^3(?:0[0-5]|[68])/.test(digits)) return 'diners';
    if (/^35/.test(digits)) return 'jcb';
    if (/^62/.test(digits)) return 'unionpay';
    return 'card';
};

const brandStyle = (brand: string) => {
    const b = brand.toLowerCase();
    if (b.includes('visa')) return { bg: '#1A1F71', tag: 'VISA' };
    if (b.includes('master')) return { bg: '#1F1F1F', tag: 'MC' };
    if (b.includes('amex')) return { bg: '#016FD0', tag: 'AMEX' };
    if (b.includes('discover')) return { bg: '#FF6000', tag: 'DISC' };
    if (b.includes('diners')) return { bg: '#0079BE', tag: 'DINERS' };
    if (b.includes('jcb')) return { bg: '#0B4EA2', tag: 'JCB' };
    if (b.includes('union')) return { bg: '#E21836', tag: 'UP' };
    return { bg: '#334155', tag: 'CARD' };
};

type Props = {
    selectedId: string;
    onSelect: (id: string) => void;
    onSelectedCard: (card: WalletCard) => void;
    accent?: string;
    textColor?: string;
    muted?: string;
    isDark?: boolean;
};

export function SimulatedCardsPanel({
    selectedId,
    onSelect,
    onSelectedCard,
    accent = '#E31C3D',
    textColor = '#0F172A',
    muted = '#64748B',
    isDark = false,
}: Props) {
    const glass = glassTokens(isDark);
    const { show } = useToast();
    const [custom, setCustom] = useState<WalletCard[]>([]);
    const [mode, setMode] = useState<'idle' | 'add' | 'edit'>('idle');
    const [editId, setEditId] = useState<string | null>(null);
    const [number, setNumber] = useState('');
    const [exp, setExp] = useState('');
    const [cvc, setCvc] = useState('');
    const [label, setLabel] = useState('');

    const cards = useMemo<WalletCard[]>(
        () => [...STRIPE_TEST_CARDS.map((c) => ({ ...c, custom: false })), ...custom],
        [custom],
    );

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
            if (!raw) return;
            try {
                const parsed = JSON.parse(raw) as WalletCard[];
                if (Array.isArray(parsed)) setCustom(parsed.map((c) => ({ ...c, custom: true })));
            } catch {}
        });
    }, []);

    useEffect(() => {
        const c = cards.find((x) => x.id === selectedId) || cards[0];
        if (c) onSelectedCard(c);
    }, [selectedId, cards, onSelectedCard]);

    const persist = async (next: WalletCard[]) => {
        setCustom(next);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const resetForm = () => {
        setNumber('');
        setExp('');
        setCvc('');
        setLabel('');
        setEditId(null);
        setMode('idle');
    };

    const openAdd = () => {
        setNumber('');
        setExp('12/34');
        setCvc('123');
        setLabel('');
        setEditId(null);
        setMode('add');
    };

    const openEdit = (card: WalletCard) => {
        if (!card.custom) {
            show('Las tarjetas demo de Stripe no se editan. Agregá una propia.', 'info');
            return;
        }
        setEditId(card.id);
        setNumber(card.number);
        setExp(card.exp);
        setCvc(card.cvc);
        setLabel(card.label);
        setMode('edit');
        onSelect(card.id);
    };

    const removeCard = async (card: WalletCard) => {
        if (!card.custom) {
            show('Las tarjetas demo no se borran. Solo las que agregaste vos.', 'info');
            return;
        }
        const next = custom.filter((c) => c.id !== card.id);
        await persist(next);
        if (selectedId === card.id) {
            onSelect(STRIPE_TEST_CARDS[0].id);
        }
        show('Tarjeta eliminada', 'success');
        if (editId === card.id) resetForm();
    };

    const saveForm = async () => {
        const digits = number.replace(/\D/g, '');
        if (digits.length < 13) {
            show('Número inválido (mín. 13 dígitos)', 'error');
            return;
        }
        if (!/^\d{2}\/\d{2}$/.test(exp.trim())) {
            show('Fecha MM/AA', 'error');
            return;
        }
        if (cvc.replace(/\D/g, '').length < 3) {
            show('CVC inválido', 'error');
            return;
        }
        const brand = detectBrand(digits);
        const last4 = digits.slice(-4);
        const niceLabel = label.trim() || brand.charAt(0).toUpperCase() + brand.slice(1);

        if (mode === 'edit' && editId) {
            const next = custom.map((c) =>
                c.id === editId
                    ? { ...c, brand, last4, label: niceLabel, number: digits, cvc: cvc.replace(/\D/g, ''), exp: exp.trim() }
                    : c,
            );
            await persist(next);
            onSelect(editId);
            show('Tarjeta actualizada', 'success');
        } else {
            const id = `custom_${Date.now()}`;
            const card: WalletCard = {
                id,
                brand,
                last4,
                label: niceLabel,
                number: digits,
                cvc: cvc.replace(/\D/g, ''),
                exp: exp.trim(),
                custom: true,
            };
            await persist([...custom, card]);
            onSelect(id);
            show('Tarjeta agregada', 'success');
        }
        resetForm();
    };

    return (
        <View style={styles.wrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                {cards.map((c) => {
                    const b = brandStyle(c.brand);
                    const sel = selectedId === c.id;
                    return (
                        <View key={c.id} style={styles.tileWrap}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => onSelect(c.id)}
                                style={[
                                    styles.cardTile,
                                    { backgroundColor: b.bg, borderColor: sel ? accent : 'transparent', borderWidth: 2 },
                                ]}
                            >
                                <View style={styles.cardTileTop}>
                                    <Text style={styles.cardBrand}>{b.tag}</Text>
                                    {sel && (
                                        <View style={[styles.check, { backgroundColor: accent }]}>
                                            <Check size={12} color="#fff" />
                                        </View>
                                    )}
                                </View>
                                <CreditCard size={20} color="rgba(255,255,255,0.85)" />
                                <View style={styles.cardBottomRow}>
                                    <View>
                                        <Text style={styles.cardLast4}>•••• {c.last4}</Text>
                                        <Text style={styles.cardLabel} numberOfLines={1}>{c.label}</Text>
                                    </View>
                                    
                                    {sel && c.custom && (
                                        <View style={styles.actionsOverlay}>
                                            <TouchableOpacity onPress={() => openEdit(c)} hitSlop={8} style={styles.iconBtn}>
                                                <Pencil size={12} color="#fff" />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => removeCard(c)} hitSlop={8} style={styles.iconBtn}>
                                                <Trash2 size={12} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        </View>
                    );
                })}

                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={openAdd}
                    style={[styles.addTile, { backgroundColor: glass.bg, borderColor: mode === 'add' ? accent : glass.border }]}
                >
                    <View style={[styles.addCircle, { backgroundColor: accent + '22' }]}>
                        <Plus size={22} color={accent} />
                    </View>
                    <Text style={[styles.addText, { color: textColor }]}>Agregar{'\n'}tarjeta</Text>
                </TouchableOpacity>
            </ScrollView>

            {(mode === 'add' || mode === 'edit') && (
                <View style={[styles.form, { backgroundColor: glass.bg, borderColor: glass.border }, glass.shadow, glass.backdrop]}>
                    <View style={styles.formHeader}>
                        <Text style={[styles.formTitle, { color: textColor }]}>
                            {mode === 'edit' ? 'Editar tarjeta' : 'Nueva tarjeta'}
                        </Text>
                        <TouchableOpacity onPress={resetForm} hitSlop={12}>
                            <X size={20} color={muted} />
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.hint, { color: muted }]}>Modo simulado · cualquier marca</Text>

                    <Text style={[styles.fieldLabel, { color: muted }]}>Número</Text>
                    <TextInput
                        value={formatCardNumber(number.replace(/\D/g, '').slice(0, 19))}
                        onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 19))}
                        keyboardType="number-pad"
                        placeholder="4242 4242 4242 4242"
                        placeholderTextColor="#94A3B8"
                        style={[styles.input, { color: textColor, borderColor: muted + '55' }]}
                    />

                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.fieldLabel, { color: muted }]}>Vence</Text>
                            <TextInput
                                value={exp}
                                onChangeText={(t) => {
                                    const d = t.replace(/\D/g, '').slice(0, 4);
                                    setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                                }}
                                keyboardType="number-pad"
                                placeholder="MM/AA"
                                placeholderTextColor="#94A3B8"
                                style={[styles.input, { color: textColor, borderColor: muted + '55' }]}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.fieldLabel, { color: muted }]}>CVC</Text>
                            <TextInput
                                value={cvc}
                                onChangeText={(t) => setCvc(t.replace(/\D/g, '').slice(0, 4))}
                                keyboardType="number-pad"
                                placeholder="123"
                                placeholderTextColor="#94A3B8"
                                style={[styles.input, { color: textColor, borderColor: muted + '55' }]}
                                secureTextEntry
                            />
                        </View>
                    </View>

                    <Text style={[styles.fieldLabel, { color: muted }]}>Alias (opcional)</Text>
                    <TextInput
                        value={label}
                        onChangeText={setLabel}
                        placeholder="Ej. Visa personal"
                        placeholderTextColor="#94A3B8"
                        style={[styles.input, { color: textColor, borderColor: muted + '55' }]}
                    />

                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: accent }]}
                        onPress={saveForm}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.saveBtnText}>{mode === 'edit' ? 'Guardar cambios' : 'Agregar tarjeta'}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10 },
    carousel: { paddingVertical: 4, paddingRight: 8, alignItems: 'flex-start' },
    tileWrap: { marginRight: 10, alignItems: 'center', gap: 6 },
    cardTile: {
        width: 140,
        height: 100,
        borderRadius: 16,
        padding: 12,
        justifyContent: 'space-between',
    },
    cardTileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBrand: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardLast4: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
    cardLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
    cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
    actionsOverlay: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    iconBtn: { padding: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6 },
    addTile: {
        width: 120,
        height: 100,
        borderRadius: 16,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 10,
    },
    addCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    addText: { fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
    form: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
    formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    formTitle: { fontSize: 15, fontWeight: '800' },
    hint: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
    fieldLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'web' ? 10 : 12,
        fontSize: 15,
        fontWeight: '600',
    },
    row: { flexDirection: 'row', gap: 10 },
    saveBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
