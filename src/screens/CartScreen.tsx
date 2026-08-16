import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { ShoppingCart as CartIcon, Trash2, Plus as PlusIcon, Minus, X, Star, ArrowLeft, Truck } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { useCart } from '../contexts/CartContext';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useMarketplace, ShippingMethod, ShippingQuote } from '../contexts/MarketplaceContext';
import { usePaymentMode } from '../contexts/PaymentModeContext';
import { Switch } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useActionGate } from '../utils/useActionGate';
import { glassShadow, Radius, colors } from '../theme/tokens';
import { useTranslation } from 'react-i18next';


function CartScreen({ navigation }: any) {
    const { items, removeItem, updateQuantity, totalItems, totalPrice, clearCart } = useCart();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();
    const { mode, toggle } = usePaymentMode();
    const isLive = mode === 'live';
    const { t } = useTranslation();
    const { gateCheckout } = useActionGate();

    // Obtener descuentos disponibles
    const { getShippingOptions } = useMarketplace();

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
    const finalPrice = totalPrice + shippingCost;

    const shippingLabels: Record<ShippingMethod, string> = {
        standard: 'Estándar',
        express: 'Express',
        pickup: 'Retiro',
    };

    const handleCheckout = () => {
        // BUG-001 FIX: Block anonymous users from reaching PaymentScreen
        if (!gateCheckout()) return;

        if (items.length === 0) {
            show(t('cart.emptyError', { defaultValue: 'El carrito está vacío' }), 'error');
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
            subtotal: totalPrice,
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
                title={t('cart.title', { defaultValue: 'Carrito de compras' })}
                subtitle={t('cart.items', { count: totalItems, defaultValue: `${totalItems} artículos` })}
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
                    <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>
                            <CartIcon size={40} color={isDark ? '#C4B5FD' : '#2196F3'} />
                        </View>
                    <Text style={styles.emptyText}>{t('cart.emptyTitle', { defaultValue: 'Tu carrito está vacío' })}</Text>
                        <Text style={styles.emptySubText}>
                            {t('cart.emptySubtitle', { defaultValue: 'Explora el marketplace y agrega productos, bonos o eventos para continuar.' })}
                        </Text>
                        <View style={styles.emptyTips}>
                            <Text style={styles.emptyTip}>• {t('cart.tipMap', { defaultValue: 'Usa el mapa para ofertas cercanas' })}</Text>
                            <Text style={styles.emptyTip}>• {t('cart.tipFav', { defaultValue: 'Guarda favoritos para comprar después' })}</Text>
                        </View>
                        <Button onPress={() => navigation.navigate('Marketplace')} style={styles.emptyCta}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('cart.explore', { defaultValue: 'Explorar tienda' })}</Text>
                        </Button>
                    </View>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
                        <Text style={styles.sectionTitle}>Productos</Text>
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
                                            {item.type === 'subscription' ? (
                                                <View style={{ backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm }}>
                                                    <Text style={{ color: '#2196F3', fontWeight: 'bold', fontSize: 12 }}>Facturación Mensual</Text>
                                                </View>
                                            ) : (
                                                <View style={styles.qtyContainer}>
                                                    <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity - 1)} style={styles.qtyBtn}>
                                                        <Minus size={14} color={isDark ? '#fff' : '#000'} />
                                                    </TouchableOpacity>
                                                    <Text style={styles.qtyText}>{item.quantity}</Text>
                                                    <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} style={styles.qtyBtn}>
                                                        <PlusIcon size={14} color={isDark ? '#fff' : '#000'} />
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                            <Text style={styles.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>



                        {requiresShipping && (
                            <>
                                <Text style={styles.sectionTitle}>Envío</Text>
                                <View style={styles.shippingCard}>
                                    <View style={styles.shippingHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Truck size={16} color={isDark ? '#F9FAFB' : "#111827"} />
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
                                            placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                            value={shippingForm.fullName}
                                            onChangeText={(text) => setShippingForm((prev) => ({ ...prev, fullName: text }))}
                                        />
                                        <TextInput
                                            style={styles.addressInput}
                                            placeholder="Dirección y número"
                                            placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                            value={shippingForm.addressLine1}
                                            onChangeText={(text) => setShippingForm((prev) => ({ ...prev, addressLine1: text }))}
                                        />
                                        <View style={styles.addressRow}>
                                            <View style={{ flex: 1 }}>
                                                <TextInput
                                                    style={styles.addressInput}
                                                    placeholder="Ciudad"
                                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                                    value={shippingForm.city}
                                                    onChangeText={(text) => setShippingForm((prev) => ({ ...prev, city: text }))}
                                                />
                                            </View>
                                            <View style={{ width: 110 }}>
                                                <TextInput
                                                    style={styles.addressInput}
                                                    placeholder="Código Postal"
                                                    placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                                    value={shippingForm.postalCode}
                                                    onChangeText={(text) => setShippingForm((prev) => ({ ...prev, postalCode: text }))}
                                                />
                                            </View>
                                        </View>
                                        <TextInput
                                            style={styles.addressInput}
                                            placeholder="Teléfono de contacto (opcional)"
                                            placeholderTextColor={isDark ? '#9CA3AF' : '#999'}
                                            value={shippingForm.phone}
                                            onChangeText={(text) => setShippingForm((prev) => ({ ...prev, phone: text }))}
                                        />
                                    </View>
                                </View>
                            </>
                        )}

                        {/* RESUMEN */}
                        <Text style={styles.sectionTitle}>Resumen</Text>
                        <View style={styles.summaryContainer}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Subtotal</Text>
                                <Text style={styles.summaryValue}>${totalPrice.toFixed(2)}</Text>
                            </View>
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
                    </ScrollView>

                    <View style={styles.checkoutBar}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                            <View>
                                <Text style={{ color: isDark ? '#fff' : '#111', fontWeight: 'bold', fontSize: 14 }}>{isLive ? 'Transacción Real' : 'Modo Simulador'}</Text>
                                <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 12 }}>{isLive ? 'Cargos verdaderos a tarjeta' : 'Pagos de prueba'}</Text>
                            </View>
                            <Switch 
                                value={isLive} 
                                onValueChange={toggle}
                                trackColor={{ false: '#9CA3AF', true: '#3b82f6' }}
                                thumbColor={'#ffffff'}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View>
                                <Text style={styles.checkoutLabel}>Total</Text>
                                <Text style={styles.checkoutAmount}>${finalPrice.toFixed(2)}</Text>
                                <Text style={styles.checkoutHint}>
                                    {requiresShipping
                                        ? `Incluye envío ${shippingLabels[selectedShippingMethod]}`
                                        : 'Retiro sin costo'}
                                </Text>
                            </View>
                            <TouchableOpacity style={[styles.checkoutButton, { backgroundColor: isLive ? '#3b82f6' : '#8B5CF6' }]} onPress={handleCheckout}>
                                <Text style={styles.checkoutButtonText}>Continuar al pago</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors(isDark).bg },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    emptyCard: {
        width: '100%',
        backgroundColor: colors(isDark).glass,
        borderRadius: Radius.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        alignItems: 'center',
        gap: 8,
    },
    emptyIcon: { width: 80, height: 80, backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE', borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    emptyText: { fontSize: 18, fontWeight: 'bold', color: colors(isDark).text },
    emptySubText: { color: colors(isDark).textMuted, marginTop: 4, textAlign: 'center' },
    emptyTips: { marginTop: 8, gap: 4, alignSelf: 'stretch' },
    emptyTip: { fontSize: 12, color: colors(isDark).textMuted },
    emptyCta: { marginTop: 12, width: '100%' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors(isDark).text, marginBottom: 12, marginTop: 8 },
    itemCard: { flexDirection: 'row', backgroundColor: colors(isDark).glass, padding: 12, borderRadius: Radius.md, gap: 12, ...glassShadow(isDark),},
    itemImage: { width: 80, height: 80, borderRadius: Radius.sm, backgroundColor: isDark ? '#374151' : '#eee' },
    itemInfo: { flex: 1, justifyContent: 'space-between' },
    itemName: { fontWeight: '600', fontSize: 14, color: isDark ? '#F9FAFB' : '#000' },
    itemLocation: { fontSize: 12, color: '#888' },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors(isDark).glass, borderRadius: Radius.sm, padding: 2 },
    qtyBtn: { padding: 4 },
    qtyText: { fontWeight: 'bold', minWidth: 20, textAlign: 'center', color: isDark ? '#F9FAFB' : '#000' },
    itemPrice: { fontWeight: 'bold', fontSize: 16, color: isDark ? '#F9FAFB' : '#000' },
    discountCard: { marginTop: 20, padding: 16, backgroundColor: isDark ? '#312E81' : '#FAFAFA', borderColor: isDark ? '#4338CA' : '#ddd6fe', borderWidth: 1 },
    discountOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#ddd' },
    discountSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    discountText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#000' },
    discountSelectedText: { color: '#fff' },
    shippingCard: { marginTop: 20, backgroundColor: colors(isDark).glass, padding: 16, borderRadius: Radius.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', gap: 12 },
    shippingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    shippingTitle: { fontSize: 15, fontWeight: '600', color: colors(isDark).text },
    shippingSubtitle: { fontSize: 12, color: colors(isDark).textMuted },
    shippingOptionsRow: { gap: 12 },
    shippingOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', minWidth: 130 },
    shippingOptionActive: { backgroundColor: isDark ? '#111827' : '#111827', borderColor: isDark ? '#4B5563' : '#111827' },
    shippingOptionLabel: { fontSize: 13, fontWeight: '600', color: colors(isDark).text },
    shippingOptionLabelActive: { color: '#FFFFFF' },
    shippingOptionPrice: { fontSize: 14, fontWeight: '700', color: colors(isDark).text, marginTop: 4 },
    shippingOptionEta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
    addressForm: { gap: 10 },
    addressLabel: { fontSize: 12, fontWeight: '600', color: colors(isDark).text },
    addressInput: { backgroundColor: colors(isDark).glass, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)', marginTop: 4, color: isDark ? '#F9FAFB' : '#000' },
    addressRow: { flexDirection: 'row', gap: 12 },
    summaryContainer: { marginTop: 20, backgroundColor: colors(isDark).bg, padding: 16, borderRadius: Radius.md },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { color: isDark ? '#9CA3AF' : '#666' },
    summaryValue: { fontWeight: '600', color: isDark ? '#F9FAFB' : '#000' },
    summarySeparator: { height: 1, backgroundColor: isDark ? '#374151' : '#eee', marginVertical: 8 },
    totalLabel: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' },
    totalValue: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' },
    checkoutBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        paddingBottom: 24,
        backgroundColor: colors(isDark).glass,
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        ...glassShadow(isDark),
    },
    checkoutLabel: { fontSize: 12, color: colors(isDark).textMuted },
    checkoutAmount: { fontSize: 20, fontWeight: '800', color: colors(isDark).text },
    checkoutHint: { fontSize: 11, color: colors(isDark).textMuted, marginTop: 2 },
    checkoutButton: {
        backgroundColor: '#111827',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: Radius.md,
        flex: 1,
        alignItems: 'center',
    },
    checkoutButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_CartScreen = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <CartScreen {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_CartScreen;
