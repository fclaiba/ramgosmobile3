import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useStripeConnect } from '../../contexts/StripeConnectContext';
import { MobileHeader } from '../../components/MobileHeader';

export default function StripeConnectScreen({ navigation }: any) {
    const { 
        accountId, 
        accountStatus, 
        isLoading, 
        createAccount, 
        startOnboarding, 
        refreshStatus, 
        createProduct, 
        buyProduct,
        products 
    } = useStripeConnect();

    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    
    const [prodName, setProdName] = useState('');
    const [prodDesc, setProdDesc] = useState('');
    const [prodPrice, setProdPrice] = useState('');

    const handleCreateAccount = async () => {
        if (!displayName || !email) return;
        await createAccount(displayName, email);
    };

    const handleOnboard = async () => {
        const url = await startOnboarding();
        if (url) {
            // Open the Stripe onboarding URL in the device browser
            Linking.openURL(url);
        }
    };

    const handleCreateProduct = async () => {
        if (!prodName || !prodPrice) return;
        const priceInCents = Math.round(parseFloat(prodPrice) * 100);
        await createProduct(prodName, prodDesc, priceInCents, 'usd');
        setProdName('');
        setProdDesc('');
        setProdPrice('');
    };

    const handleBuy = async (priceId: string, connectedAccountId: string) => {
        const url = await buyProduct(priceId, connectedAccountId);
        if (url) {
            Linking.openURL(url);
        }
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Stripe Connect V2" showBack onBack={() => navigation.goBack()} />
            
            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                {/* --- Section 1: Connected Account --- */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>1. Cuenta Conectada (Vendedor)</Text>
                    
                    {!accountId ? (
                        <View style={styles.form}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Nombre del Negocio" 
                                value={displayName} 
                                onChangeText={setDisplayName} 
                            />
                            <TextInput 
                                style={styles.input} 
                                placeholder="Email de Contacto" 
                                value={email} 
                                onChangeText={setEmail} 
                                keyboardType="email-address"
                            />
                            <TouchableOpacity style={styles.button} onPress={handleCreateAccount} disabled={isLoading}>
                                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear Cuenta</Text>}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.statusBox}>
                            <Text style={styles.statusText}>Account ID: <Text style={styles.bold}>{accountId}</Text></Text>
                            <Text style={styles.statusText}>Onboarding: <Text style={accountStatus?.onboardingComplete ? styles.success : styles.error}>{accountStatus?.onboardingComplete ? 'Completo' : 'Pendiente'}</Text></Text>
                            <Text style={styles.statusText}>Pagos Activos: <Text style={accountStatus?.readyToReceivePayments ? styles.success : styles.error}>{accountStatus?.readyToReceivePayments ? 'Sí' : 'No'}</Text></Text>
                            <Text style={styles.statusText}>Requisitos: <Text style={styles.bold}>{accountStatus?.requirementsStatus || 'N/A'}</Text></Text>
                            
                            <View style={styles.buttonRow}>
                                <TouchableOpacity style={[styles.button, styles.flex1]} onPress={handleOnboard} disabled={isLoading || accountStatus?.onboardingComplete}>
                                    <Text style={styles.buttonText}>Completar Onboarding</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => refreshStatus()} disabled={isLoading}>
                                    <Text style={styles.secondaryButtonText}>Refrescar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* --- Section 2: Product Creation --- */}
                <View style={[styles.card, !accountId && styles.disabledCard]}>
                    <Text style={styles.cardTitle}>2. Crear Producto (Plataforma)</Text>
                    <Text style={styles.hint}>Los productos se crean en la plataforma y se mapean a tu cuenta conectada.</Text>
                    
                    <View style={styles.form}>
                        <TextInput style={styles.input} placeholder="Nombre del Producto" value={prodName} onChangeText={setProdName} editable={!!accountId} />
                        <TextInput style={styles.input} placeholder="Descripción" value={prodDesc} onChangeText={setProdDesc} editable={!!accountId} />
                        <TextInput style={styles.input} placeholder="Precio en USD (ej: 10.50)" value={prodPrice} onChangeText={setProdPrice} keyboardType="numeric" editable={!!accountId} />
                        <TouchableOpacity style={[styles.button, !accountId && styles.disabledButton]} onPress={handleCreateProduct} disabled={isLoading || !accountId}>
                            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear Producto</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* --- Section 3: Storefront --- */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>3. Tienda (Comprador)</Text>
                    <Text style={styles.hint}>Acá los clientes ven los productos de todos los vendedores.</Text>
                    
                    {products && products.length > 0 ? (
                        products.map(product => (
                            <View key={product._id} style={styles.productItem}>
                                <View style={styles.productInfo}>
                                    <Text style={styles.productName}>{product.name}</Text>
                                    {product.description && <Text style={styles.productDesc}>{product.description}</Text>}
                                    <Text style={styles.productPrice}>${(product.priceInCents / 100).toFixed(2)} {product.currency.toUpperCase()}</Text>
                                    <Text style={styles.productSeller}>Vendedor: {product.connectedAccountId.slice(0, 12)}...</Text>
                                </View>
                                <TouchableOpacity style={styles.buyButton} onPress={() => handleBuy(product.stripePriceId, product.connectedAccountId)} disabled={isLoading}>
                                    <Text style={styles.buttonText}>Comprar</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.emptyText}>No hay productos disponibles.</Text>
                    )}
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },
    card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    disabledCard: { opacity: 0.6 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937', marginBottom: 12 },
    hint: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
    form: { gap: 12 },
    input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827' },
    button: { backgroundColor: '#7C3AED', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    disabledButton: { backgroundColor: '#C4B5FD' },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    secondaryButton: { backgroundColor: '#E5E7EB' },
    secondaryButtonText: { color: '#4B5563', fontWeight: 'bold', fontSize: 16 },
    statusBox: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, gap: 4, borderWidth: 1, borderColor: '#E5E7EB' },
    statusText: { fontSize: 14, color: '#374151' },
    bold: { fontWeight: 'bold' },
    success: { color: '#059669', fontWeight: 'bold' },
    error: { color: '#DC2626', fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    flex1: { flex: 1 },
    productItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    productInfo: { flex: 1, paddingRight: 12 },
    productName: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
    productDesc: { fontSize: 14, color: '#6B7280', marginTop: 2 },
    productPrice: { fontSize: 15, fontWeight: '600', color: '#059669', marginTop: 4 },
    productSeller: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
    buyButton: { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    emptyText: { textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', marginVertical: 20 },
});
