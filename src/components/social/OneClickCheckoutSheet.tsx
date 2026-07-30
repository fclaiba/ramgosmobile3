import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing, Dimensions, Platform, Image, Switch, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { X, ShieldCheck, Zap, Coins } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const { height } = Dimensions.get('window');

export interface OneClickCheckoutSheetProps {
    visible: boolean;
    postId: string | null;
    listingId: string | null;
    onClose: () => void;
}

export function OneClickCheckoutSheet({ visible, postId, listingId, onClose }: OneClickCheckoutSheetProps) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    
    const slideAnim = useRef(new Animated.Value(height)).current;
    
    const [usePoints, setUsePoints] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Queries
    const listing = useQuery(api.listings.getListing, listingId ? { id: listingId as any } : 'skip');
    const economyState = useQuery(api.points.getPointsState, sessionToken ? {} : 'skip');
    const processPayment = useMutation(api.social.simulateSocialCommercePayment);

    const pointsBalance = economyState?.pointsBalance || 0;
    
    // Si activa el switch, usamos hasta 100 puntos (ej. $1)
    const pointsToUse = usePoints ? Math.min(pointsBalance, 500) : 0; 
    const discount = pointsToUse / 100;
    const finalPrice = listing ? Math.max(0, listing.price - discount) : 0;
    const pointsToEarn = Math.floor(finalPrice * 5); // Gana 5 puntos por cada dólar gastado

    useEffect(() => {
        if (visible) {
            setShowSuccess(false);
            setUsePoints(false);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: height,
                duration: 250,
                easing: Easing.in(Easing.ease),
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    const handlePay = async () => {
        if (!postId || !listingId || !sessionToken) return;
        
        setIsProcessing(true);
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const result = await processPayment({
                sessionToken,
                postId: postId as any,
                pointsToRedeem: pointsToUse,
            });

            if (result.success) {
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowSuccess(true);
                
                // Mostrar confetti/animación por 2 segundos antes de cerrar
                setTimeout(() => {
                    onClose();
                }, 2000);
            }
        } catch (error: any) {
            console.error("Payment error:", error);
            show(error.message || 'Error procesando el pago', 'error');
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!visible && !listingId) return null;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                
                <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
                    <BlurView intensity={isDark ? 80 : 60} tint={isDark ? 'dark' : 'light'} style={styles.blurContainer}>
                        
                        <View style={styles.header}>
                            <Text style={[styles.title, isDark ? styles.textLight : styles.textDark]}>
                                Compra Rápida
                            </Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <X size={24} color={isDark ? '#FFF' : '#000'} />
                            </TouchableOpacity>
                        </View>

                        {showSuccess ? (
                            <View style={styles.successBox}>
                                <View style={styles.successIconWrapper}>
                                    <Zap size={40} color="#10B981" fill="#10B981" />
                                </View>
                                <Text style={[styles.successTitle, isDark ? styles.textLight : styles.textDark]}>¡Pago Exitoso!</Text>
                                <Text style={styles.successSub}>Ganaste +{pointsToEarn} Puntos</Text>
                            </View>
                        ) : listing === undefined ? (
                            <View style={styles.loadingBox}>
                                <ActivityIndicator size="large" color="#4F46E5" />
                                <Text style={[styles.loadingText, isDark ? styles.textLight : styles.textDark]}>Cargando información segura...</Text>
                            </View>
                        ) : listing === null ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>Producto no encontrado o pausado.</Text>
                            </View>
                        ) : (
                            <View style={styles.content}>
                                <View style={styles.productRow}>
                                    <Image 
                                        source={{ uri: listing.images?.[0]?.url || listing.image }} 
                                        style={styles.productImage} 
                                    />
                                    <View style={styles.productInfo}>
                                        <Text style={[styles.productName, isDark ? styles.textLight : styles.textDark]}>
                                            {listing.title}
                                        </Text>
                                        <Text style={styles.productSeller}>Vendido por {listing.seller?.name || 'Vendedor'}</Text>
                                        
                                        {usePoints && discount > 0 ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={[styles.productPrice, { textDecorationLine: 'line-through', color: '#9CA3AF', fontSize: 16 }]}>
                                                    ${listing.price}
                                                </Text>
                                                <Text style={styles.productPrice}>${finalPrice}</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.productPrice}>${listing.price}</Text>
                                        )}
                                    </View>
                                </View>

                                {/* Economy Section */}
                                <View style={[styles.economyCard, isDark ? styles.economyCardDark : styles.economyCardLight]}>
                                    <View style={styles.ecoRow}>
                                        <View style={styles.ecoIcon}>
                                            <Coins size={20} color="#F59E0B" fill="#F59E0B" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.ecoTitle, isDark ? styles.textLight : styles.textDark]}>
                                                Tenés {pointsBalance} puntos
                                            </Text>
                                            <Text style={styles.ecoSub}>Canjea hasta 500 puntos por $5 de dto.</Text>
                                        </View>
                                        <Switch
                                            value={usePoints}
                                            onValueChange={setUsePoints}
                                            disabled={pointsBalance < 100}
                                            trackColor={{ false: '#767577', true: 'rgba(79, 70, 229, 0.5)' }}
                                            thumbColor={usePoints ? '#4F46E5' : '#f4f3f4'}
                                        />
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.trustBadge}>
                                    <ShieldCheck size={16} color="#10B981" />
                                    <Text style={styles.trustText}>Pago Seguro & Split Payment Inteligente</Text>
                                </View>

                                <TouchableOpacity 
                                    style={[styles.payBtn, isProcessing && styles.payBtnDisabled]} 
                                    onPress={handlePay} 
                                    activeOpacity={0.8}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <>
                                            <Zap size={20} color="#FFF" fill="#FFF" />
                                            <Text style={styles.payBtnText}>Simular Pago - ${finalPrice}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                                
                                {!usePoints && (
                                    <Text style={styles.earnPointsText}>
                                        Con esta compra vas a ganar <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>{pointsToEarn} pts</Text>
                                    </Text>
                                )}
                            </View>
                        )}
                    </BlurView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetContainer: {
        borderTopLeftRadius: Radius['2xl'],
        borderTopRightRadius: Radius['2xl'],
        overflow: 'hidden',
    },
    blurContainer: {
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    textLight: { color: '#FFF' },
    textDark: { color: '#111827' },
    closeBtn: {
        padding: 4,
        backgroundColor: 'rgba(156,163,175,0.2)',
        borderRadius: Radius.full,
    },
    content: {
        paddingHorizontal: 24,
    },
    productRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    productImage: {
        width: 80,
        height: 80,
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(156,163,175,0.2)',
    },
    productInfo: {
        flex: 1,
        marginLeft: 16,
    },
    productName: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    productSeller: {
        fontSize: 14,
        color: '#9CA3AF',
        marginBottom: 8,
    },
    productPrice: {
        fontSize: 22,
        fontWeight: '900',
        color: '#10B981',
    },
    economyCard: {
        padding: 16,
        borderRadius: Radius.xl,
        marginBottom: 20,
        borderWidth: 1,
    },
    economyCardDark: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    economyCardLight: {
        backgroundColor: 'rgba(0,0,0,0.02)',
        borderColor: 'rgba(0,0,0,0.05)',
    },
    ecoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    ecoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ecoTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    ecoSub: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(156,163,175,0.2)',
        marginBottom: 20,
    },
    trustBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: 12,
        borderRadius: Radius.lg,
        marginBottom: 24,
    },
    trustText: {
        color: '#10B981',
        fontSize: 12,
        fontWeight: '600',
    },
    payBtn: {
        backgroundColor: '#4F46E5',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        borderRadius: Radius.xl,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    payBtnDisabled: {
        backgroundColor: 'rgba(79, 70, 229, 0.5)',
        shadowOpacity: 0,
    },
    payBtnText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    earnPointsText: {
        textAlign: 'center',
        color: '#9CA3AF',
        fontSize: 14,
        marginTop: 16,
    },
    loadingBox: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontWeight: '500',
    },
    errorBox: {
        padding: 40,
        alignItems: 'center',
    },
    errorText: {
        color: '#EF4444',
        fontWeight: '600',
    },
    successBox: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        height: 300,
    },
    successIconWrapper: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    successSub: {
        fontSize: 18,
        color: '#F59E0B',
        fontWeight: 'bold',
    }
});
