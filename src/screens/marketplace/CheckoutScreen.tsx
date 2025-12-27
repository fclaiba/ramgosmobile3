import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { usePoints } from '../../contexts/PointsContext';
import { useCart } from '../../contexts/CartContext';
import { useMarketplace } from '../../contexts/MarketplaceContext';
import { MobileHeader } from '../../components/MobileHeader';
import { CreditCard, ShieldCheck, MapPin, Truck, CheckCircle, Tag, Ticket } from 'lucide-react-native';

export default function CheckoutScreen({ navigation }: any) {
    const { items, totalPrice, clearCart } = useCart();
    const { placeOrder } = useMarketplace();
    const { points, getAvailableDiscounts, redeemPoints } = usePoints();

    const [loading, setLoading] = useState(false);
    const [selectedDiscount, setSelectedDiscount] = useState<{ points: number; discount: number } | null>(null);

    // Mock Form State
    const [address, setAddress] = useState('Av. Libertador 1234');
    const [city, setCity] = useState('Buenos Aires');
    const [cardNumber, setCardNumber] = useState('');

    const availableDiscounts = getAvailableDiscounts();
    const shippingCost = 12.00;
    const finalTotal = Math.max(0, totalPrice + shippingCost - (selectedDiscount?.discount || 0));

    const handlePlaceOrder = async () => {
        if (!address || !cardNumber) {
            Alert.alert('Error', 'Completa los datos de envío y pago.');
            return;
        }

        setLoading(true);

        // Simulate API delay
        setTimeout(() => {
            if (selectedDiscount) {
                const redeemed = redeemPoints(selectedDiscount.points, `Descuento en compra: $${selectedDiscount.discount}`);
                if (!redeemed) {
                    setLoading(false);
                    Alert.alert('Error', 'No tienes suficientes puntos para este descuento.');
                    return;
                }
            }

            const result = placeOrder({
                cartItems: items,
                shippingMethod: 'standard',
                shippingDestination: {
                    fullName: 'Usuario Demo',
                    addressLine1: address,
                    city: city,
                    postalCode: '1425',
                    country: 'Argentina'
                },
                paymentDetails: {
                    discountApplied: selectedDiscount?.discount || 0,
                    finalAmount: finalTotal
                }
            });

            setLoading(false);
            if (result.success) {
                clearCart();
                Alert.alert('¡Compra Exitosa!', 'Tu orden ha sido procesada. El dinero estará protegido hasta que recibas el producto.', [
                    { text: 'Ver Mis Pedidos', onPress: () => navigation.navigate('OrderHistory') }
                ]);
            } else {
                Alert.alert('Error', 'No se pudo procesar la orden.');
            }
        }, 2000);
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Finalizar Compra" showBack onBack={() => navigation.goBack()} />

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Shipping */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <MapPin size={20} color="#4B5563" />
                        <Text style={styles.sectionTitle}>Dirección de Envío</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="Dirección"
                        value={address}
                        onChangeText={setAddress}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Ciudad"
                        value={city}
                        onChangeText={setCity}
                    />
                </View>

                {/* Delivery Method */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Truck size={20} color="#4B5563" />
                        <Text style={styles.sectionTitle}>Método de Envío</Text>
                    </View>
                    <View style={styles.optionSelected}>
                        <View>
                            <Text style={styles.optionTitle}>Envío Estándar</Text>
                            <Text style={styles.optionDesc}>Llega en 3-5 días hábiles</Text>
                        </View>
                        <Text style={styles.optionPrice}>${shippingCost.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Points Redemption */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ticket size={20} color="#7C3AED" />
                        <Text style={styles.sectionTitle}>Canjear Puntos</Text>
                        <View style={{ marginLeft: 'auto', backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                            <Text style={{ color: '#7C3AED', fontWeight: 'bold', fontSize: 12 }}>Saldo: {points}</Text>
                        </View>
                    </View>

                    {availableDiscounts.length > 0 ? (
                        <View style={{ gap: 8 }}>
                            {availableDiscounts.map((tier, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.discountOption,
                                        selectedDiscount?.points === tier.points && styles.discountOptionSelected
                                    ]}
                                    onPress={() => setSelectedDiscount(selectedDiscount?.points === tier.points ? null : tier)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Tag size={16} color={selectedDiscount?.points === tier.points ? '#fff' : '#4B5563'} />
                                        <Text style={[
                                            styles.discountText,
                                            selectedDiscount?.points === tier.points && styles.discountTextSelected
                                        ]}>
                                            ${tier.discount.toFixed(2)} OFF
                                        </Text>
                                    </View>
                                    <Text style={[
                                        styles.pointsCost,
                                        selectedDiscount?.points === tier.points && styles.pointsCostSelected
                                    ]}>
                                        {tier.points} pts
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <Text style={{ color: '#6B7280', fontSize: 13, fontStyle: 'italic' }}>
                            No tienes suficientes puntos para canjear descuentos aún. (Mínimo 100 pts)
                        </Text>
                    )}
                </View>

                {/* Payment */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <CreditCard size={20} color="#4B5563" />
                        <Text style={styles.sectionTitle}>Método de Pago</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="Número de Tarjeta"
                        keyboardType="numeric"
                        value={cardNumber}
                        onChangeText={setCardNumber}
                    />
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" />
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" />
                    </View>
                </View>

                {/* Legal / Escrow Notice */}
                <View style={styles.escrowNotice}>
                    <ShieldCheck size={28} color="#059669" />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.escrowTitle}>Tu dinero está protegido</Text>
                        <Text style={styles.escrowText}>
                            Al confirmar, el pago será retenido por Ramgos.
                            El vendedor solo recibirá el dinero 15 días después de que confirmes la entrega.
                        </Text>
                    </View>
                </View>

                {/* Summary */}
                <View style={styles.summary}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Subtotal</Text>
                        <Text style={styles.value}>${totalPrice.toFixed(2)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Envío</Text>
                        <Text style={styles.value}>${shippingCost.toFixed(2)}</Text>
                    </View>
                    {selectedDiscount && (
                        <View style={styles.row}>
                            <Text style={[styles.label, { color: '#7C3AED' }]}>Descuento (Puntos)</Text>
                            <Text style={[styles.value, { color: '#7C3AED' }]}>-${selectedDiscount.discount.toFixed(2)}</Text>
                        </View>
                    )}
                    <View style={[styles.row, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total a Pagar</Text>
                        <Text style={styles.totalValue}>${finalTotal.toFixed(2)}</Text>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.payBtn, loading && styles.payBtnDisabled]}
                    onPress={handlePlaceOrder}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.payBtnText}>Confirmar Pago</Text>
                            <CheckCircle size={20} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    section: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    input: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, marginBottom: 8, fontSize: 16 },

    optionSelected: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8, borderColor: '#BFDBFE', borderWidth: 1 },
    optionTitle: { fontWeight: '600', color: '#1E40AF' },
    optionDesc: { fontSize: 12, color: '#60A5FA' },
    optionPrice: { fontWeight: 'bold', color: '#1E40AF' },

    escrowNotice: { flexDirection: 'row', gap: 12, backgroundColor: '#ECFDF5', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#34D399' },
    escrowTitle: { fontWeight: 'bold', color: '#064E3B', marginBottom: 4 },
    escrowText: { fontSize: 13, color: '#065F46', lineHeight: 18 },

    summary: { backgroundColor: '#fff', padding: 16, borderRadius: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    label: { color: '#6B7280' },
    value: { fontWeight: '500', color: '#1F2937' },
    totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    totalLabel: { fontWeight: 'bold', fontSize: 16 },
    totalValue: { fontWeight: '900', fontSize: 18, color: '#7C3AED' },

    footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    payBtn: { backgroundColor: '#7C3AED', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
    payBtnDisabled: { opacity: 0.7 },
    payBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    discountOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
    discountOptionSelected: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    discountText: { fontWeight: '600', color: '#374151' },
    discountTextSelected: { color: '#fff' },
    pointsCost: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
    pointsCostSelected: { color: '#E9D5FF' },
});
