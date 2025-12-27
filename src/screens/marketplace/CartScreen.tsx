import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert } from 'react-native';
import { Trash2, AlertCircle, ArrowRight } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';

export default function CartScreen({ navigation }: any) {
    const { items, removeItem, updateQuantity, totalPrice } = useCart();
    const { isAuthenticated } = useAuth();

    const handleCheckout = () => {
        if (!isAuthenticated) {
            navigation.navigate('Login');
            return;
        }
        if (items.length === 0) return;
        navigation.navigate('Checkout');
    };

    const renderItem = ({ item }: any) => (
        <View style={styles.itemCard}>
            <Image source={{ uri: item.image }} style={styles.itemImage} />
            <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemPrice}>${item.price} USD</Text>

                <View style={styles.controlsRow}>
                    <View style={styles.qtyContainer}>
                        <TouchableOpacity
                            onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            style={styles.qtyBtn}
                        >
                            <Text style={styles.qtyText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <TouchableOpacity
                            onPress={() => updateQuantity(item.id, item.quantity + 1)}
                            style={styles.qtyBtn}
                        >
                            <Text style={styles.qtyText}>+</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => removeItem(item.id)}>
                        <Trash2 size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <MobileHeader title="Mi Carrito" showBack onBack={() => navigation.goBack()} />

            {items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <AlertCircle size={48} color="#9CA3AF" />
                    <Text style={styles.emptyText}>Tu carrito está vacío</Text>
                    <TouchableOpacity
                        style={styles.exploreBtn}
                        onPress={() => navigation.navigate('Home')}
                    >
                        <Text style={styles.exploreBtnText}>Explorar Productos</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    <FlatList
                        data={items}
                        renderItem={renderItem}
                        keyExtractor={item => String(item.id)}
                        contentContainerStyle={{ padding: 16 }}
                        showsVerticalScrollIndicator={false}
                    />

                    <View style={styles.footer}>
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Total Estimado</Text>
                            <Text style={styles.totalValue}>${totalPrice.toFixed(2)} USD</Text>
                        </View>
                        <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
                            <Text style={styles.checkoutBtnText}>Ir a Pagar</Text>
                            <ArrowRight size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    emptyText: { fontSize: 18, color: '#6B7280' },
    exploreBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#111827', borderRadius: 8 },
    exploreBtnText: { color: '#fff', fontWeight: 'bold' },

    itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 12 },
    itemImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#F3F4F6' },
    itemInfo: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
    itemTitle: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
    itemPrice: { fontSize: 16, fontWeight: 'bold', color: '#111827' },

    controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8 },
    qtyBtn: { paddingHorizontal: 12, paddingVertical: 4 },
    qtyText: { fontSize: 16, color: '#374151' },
    qtyValue: { width: 30, textAlign: 'center', fontWeight: 'bold' },

    footer: { padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
    totalLabel: { fontSize: 14, color: '#6B7280' },
    totalValue: { fontSize: 24, fontWeight: '900', color: '#111827' },
    checkoutBtn: { flexDirection: 'row', backgroundColor: '#7C3AED', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8 },
    checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
