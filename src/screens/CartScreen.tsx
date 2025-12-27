import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { ShoppingCart as CartIcon, Trash2, Plus as PlusIcon, Minus, X, Star, Gift, ArrowLeft, Truck } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { useCart } from '../contexts/CartContext';
import { usePoints, DISCOUNT_TIERS } from '../contexts/PointsContext';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useMarketplace, ShippingMethod, ShippingQuote } from '../contexts/MarketplaceContext';

export default function CartScreen({ navigation }: any) {
    const { items, removeItem, updateQuantity, totalItems, totalPrice, clearCart } = useCart();
    const { points } = usePoints();
    const [selectedDiscount, setSelectedDiscount] = useState<number>(0);

    // Obtener descuentos disponibles
    const { getShippingOptions } = useMarketplace();

    const availableDiscounts = DISCOUNT_TIERS.filter(
        (tier) => points >= tier.points && totalPrice >= tier.discount
    );

    const appliedDiscount =
        selectedDiscount > 0
            ? DISCOUNT_TIERS.find((t) => t.points === selectedDiscount)?.discount || 0
            : 0;

    const requiresShipping = useMemo(
        () => items.some((item) => item.type === 'product'),
        [items]
    );

    const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod>('standard');
    const [shippingForm, setShippingForm] = useState({
        fullName: '',
        addressLine1: '',
        city: 'Buenos Aires',
        postalCode: 'C1000',
        country: 'Argentina',
        phone: '',
    });

    const shippingOptions = useMemo<ShippingQuote[]>(() => {
        if (!requiresShipping || items.length === 0) return [];
        return getShippingOptions(items, shippingForm.postalCode);
    }, [requiresShipping, items, getShippingOptions, shippingForm.postalCode]);

    useEffect(() => {
        if (shippingOptions.length === 0) return;
        const match = shippingOptions.find((option) => option.method === selectedShippingMethod);
        if (!match) {
            setSelectedShippingMethod(shippingOptions[0].method);
        }
    }, [shippingOptions, selectedShippingMethod]);

    const activeShippingQuote = useMemo<ShippingQuote | undefined>(() => {
        if (shippingOptions.length === 0) return undefined;
        return shippingOptions.find((option) => option.method === selectedShippingMethod) ?? shippingOptions[0];
    }, [shippingOptions, selectedShippingMethod]);

    const shippingCost = requiresShipping ? activeShippingQuote?.cost ?? 0 : 0;

    const finalPrice = Math.max(0, totalPrice - appliedDiscount + shippingCost);

    const shippingLabels: Record<ShippingMethod, string> = {
        standard: 'Estándar',
        express: 'Express',
        pickup: 'Retiro',
    };

    const handleCheckout = () => {
        if (items.length === 0) {
            Alert.alert('Error', 'El carrito está vacío');
            return;
        }

        const destination = {
            fullName: shippingForm.fullName || 'Consumidor Ramgos',
            addressLine1: shippingForm.addressLine1 || 'Dirección a coordinar',
            city: shippingForm.city,
            postalCode: shippingForm.postalCode,
            country: shippingForm.country,
            phone: shippingForm.phone,
        };

        navigation.navigate('Payment', {
            amount: finalPrice,
            discountUsedPoints: selectedDiscount,
            discountAmount: appliedDiscount,
            shippingMethod: requiresShipping
                ? activeShippingQuote?.method ?? selectedShippingMethod
                : 'pickup',
            shippingCost,
            shippingQuote: requiresShipping ? activeShippingQuote : undefined,
            shippingDestination: destination,
            cartItems: items,
            cartSnapshot: items,
        });
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Carrito de Compras"
                subtitle={`${totalItems} artículos`}
                backButton={true}
                onBack={() => navigation.goBack()}
                actions={
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {totalItems > 0 && (
                            <TouchableOpacity onPress={clearCart} style={{ marginRight: 8 }}>
                                <Trash2 size={20} color="#ef4444" />
                            </TouchableOpacity>
                        )}
                    </View>
                }
            />

            {items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <CartIcon size={40} color="#999" />
                    </View>
                    <Text style={styles.emptyText}>Tu carrito está vacío</Text>
                    <Text style={styles.emptySubText}>Agrega productos, bonos o eventos</Text>
                    <Button onPress={() => navigation.navigate('Home')} style={{ marginTop: 20 }}>
                        <Text style={{ color: '#fff' }}>Explorar Tienda</Text>
                    </Button>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                    <View style={{ gap: 12 }}>
                        {items.map((item) => (
                            <View key={item.id} style={styles.itemCard}>
                                <ImageWithFallback src={item.image} style={styles.itemImage} />
                                <View style={styles.itemInfo}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                                        <TouchableOpacity onPress={() => removeItem(item.id)}>
                                            <Trash2 size={18} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.itemLocation}>{item.location}</Text>

                                    <View style={styles.itemFooter}>
                                        <View style={styles.qtyContainer}>
                                            <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity - 1)} style={styles.qtyBtn}>
                                                <Minus size={14} color="#000" />
                                            </TouchableOpacity>
                                            <Text style={styles.qtyText}>{item.quantity}</Text>
                                            <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} style={styles.qtyBtn}>
                                                <PlusIcon size={14} color="#000" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* DESCUENTOS SECTION */}
                    <Card style={styles.discountCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <Star size={16} color="#7c3aed" fill="#7c3aed" />
                                <Text>Tus Puntos</Text>
                            </View>
                            <Badge variant="secondary"><Text>{points} pts</Text></Badge>
                        </View>

                        {availableDiscounts.length > 0 ? (
                            <View>
                                <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Usar descuento:</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    <TouchableOpacity
                                        style={[styles.discountOption, selectedDiscount === 0 && styles.discountSelected]}
                                        onPress={() => setSelectedDiscount(0)}
                                    >
                                        <Text style={[styles.discountText, selectedDiscount === 0 && styles.discountSelectedText]}>Ninguno</Text>
                                    </TouchableOpacity>
                                    {availableDiscounts.map(tier => (
                                        <TouchableOpacity
                                            key={tier.points}
                                            style={[styles.discountOption, selectedDiscount === tier.points && styles.discountSelected]}
                                            onPress={() => setSelectedDiscount(tier.points)}
                                        >
                                            <Text style={[styles.discountText, selectedDiscount === tier.points && styles.discountSelectedText]}>
                                                -${tier.discount} ({tier.points}pts)
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        ) : (
                            <Text style={{ fontSize: 12, color: '#999' }}>No tienes suficientes puntos para descuentos en esta compra.</Text>
                        )}
                    </Card>

                    {requiresShipping && (
                        <View style={styles.shippingCard}>
                            <View style={styles.shippingHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Truck size={16} color="#111827" />
                                    <Text style={styles.shippingTitle}>Método de envío</Text>
                                </View>
                                {activeShippingQuote ? (
                                    <Text style={styles.shippingSubtitle}>
                                        {shippingLabels[selectedShippingMethod]} • {activeShippingQuote.estimatedDeliveryDays[0]}-{activeShippingQuote.estimatedDeliveryDays[1]} días
                                    </Text>
                                ) : (
                                    <Text style={styles.shippingSubtitle}>Selecciona una opción disponible</Text>
                                )}
                            </View>

                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.shippingOptionsRow}
                            >
                                {shippingOptions.map((option) => {
                                    const isActive = option.method === selectedShippingMethod;
                                    return (
                                        <TouchableOpacity
                                            key={option.method}
                                            style={[styles.shippingOption, isActive && styles.shippingOptionActive]}
                                            onPress={() => setSelectedShippingMethod(option.method)}
                                        >
                                            <Text style={[styles.shippingOptionLabel, isActive && styles.shippingOptionLabelActive]}>
                                                {shippingLabels[option.method]}
                                            </Text>
                                            <Text style={[styles.shippingOptionPrice, isActive && styles.shippingOptionLabelActive]}>
                                                ${option.cost.toFixed(2)}
                                            </Text>
                                            <Text style={styles.shippingOptionEta}>
                                                {option.estimatedDeliveryDays[0]}-{option.estimatedDeliveryDays[1]} días
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.addressForm}>
                                <Text style={styles.addressLabel}>Datos de entrega</Text>
                                <TextInput
                                    style={styles.addressInput}
                                    placeholder="Nombre completo"
                                    value={shippingForm.fullName}
                                    onChangeText={(text) => setShippingForm((prev) => ({ ...prev, fullName: text }))}
                                />
                                <TextInput
                                    style={styles.addressInput}
                                    placeholder="Dirección y número"
                                    value={shippingForm.addressLine1}
                                    onChangeText={(text) => setShippingForm((prev) => ({ ...prev, addressLine1: text }))}
                                />
                                <View style={styles.addressRow}>
                                    <View style={{ flex: 1 }}>
                                        <TextInput
                                            style={styles.addressInput}
                                            placeholder="Ciudad"
                                            value={shippingForm.city}
                                            onChangeText={(text) => setShippingForm((prev) => ({ ...prev, city: text }))}
                                        />
                                    </View>
                                    <View style={{ width: 110 }}>
                                        <TextInput
                                            style={styles.addressInput}
                                            placeholder="Código Postal"
                                            value={shippingForm.postalCode}
                                            onChangeText={(text) => setShippingForm((prev) => ({ ...prev, postalCode: text }))}
                                        />
                                    </View>
                                </View>
                                <TextInput
                                    style={styles.addressInput}
                                    placeholder="Teléfono de contacto (opcional)"
                                    value={shippingForm.phone}
                                    onChangeText={(text) => setShippingForm((prev) => ({ ...prev, phone: text }))}
                                />
                            </View>
                        </View>
                    )}

                    {/* RESUMEN */}
                    <View style={styles.summaryContainer}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal</Text>
                            <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                        </View>
                        {appliedDiscount > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>Descuento</Text>
                                <Text style={[styles.summaryValue, { color: '#16a34a' }]}>-${appliedDiscount.toFixed(2)}</Text>
                            </View>
                        )}
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Envío</Text>
                            <Text style={styles.summaryValue}>
                                {requiresShipping
                                    ? `$${shippingCost.toFixed(2)} · ${shippingLabels[selectedShippingMethod]}`
                                    : 'No aplica'}
                            </Text>
                        </View>
                        <View style={[styles.summarySeparator]} />
                        <View style={styles.summaryRow}>
                            <Text style={styles.totalLabel}>Total</Text>
                            <Text style={styles.totalValue}>${finalPrice.toFixed(2)}</Text>
                        </View>
                    </View>

                    <Button onPress={handleCheckout} style={{ marginTop: 20 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Proceder al Pago</Text>
                    </Button>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    emptyIcon: { width: 80, height: 80, backgroundColor: '#eee', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyText: { fontSize: 18, fontWeight: 'bold', color: '#666' },
    emptySubText: { color: '#999', marginTop: 4 },
    itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, borderRadius: 12, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    itemImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#eee' },
    itemInfo: { flex: 1, justifyContent: 'space-between' },
    itemName: { fontWeight: '600', fontSize: 14 },
    itemLocation: { fontSize: 12, color: '#888' },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 6, padding: 2 },
    qtyBtn: { padding: 4 },
    qtyText: { fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
    itemPrice: { fontWeight: 'bold', fontSize: 16 },
    discountCard: { marginTop: 20, padding: 16, backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', borderWidth: 1 },
    discountOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
    discountSelected: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
    discountText: { fontSize: 12 },
    discountSelectedText: { color: '#fff' },
    shippingCard: { marginTop: 20, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
    shippingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    shippingTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
    shippingSubtitle: { fontSize: 12, color: '#6B7280' },
    shippingOptionsRow: { gap: 12 },
    shippingOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', minWidth: 130 },
    shippingOptionActive: { backgroundColor: '#111827', borderColor: '#111827' },
    shippingOptionLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
    shippingOptionLabelActive: { color: '#FFFFFF' },
    shippingOptionPrice: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 4 },
    shippingOptionEta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
    addressForm: { gap: 10 },
    addressLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
    addressInput: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 4 },
    addressRow: { flexDirection: 'row', gap: 12 },
    summaryContainer: { marginTop: 20, backgroundColor: '#fff', padding: 16, borderRadius: 12 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { color: '#666' },
    summaryValue: { fontWeight: '600' },
    summarySeparator: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
    totalLabel: { fontSize: 18, fontWeight: 'bold' },
    totalValue: { fontSize: 18, fontWeight: 'bold' }
});
