import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { MobileHeader } from '../../components/MobileHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { colors } from '../../theme/tokens';
import { Button } from '../../components/ui/button';
import { DollarSign, AlertTriangle } from 'lucide-react-native';

export default function AdminOrderDetailsScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { orderId } = route.params as { orderId: Id<"orders"> };
    
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    // El tema de este repo es una FUNCION `colors(isDark)`, no una paleta
    // estatica: estas pantallas se escribieron contra una API que no existe acá.
    const c = colors(isDark);
    const { sessionToken } = useAuth();
    
    // `getOrder` no existe: la query es `getOrderById`, y sin `sessionToken`
    // devuelve null en vez de tirar (ver el comentario en convex/orders.ts).
    const order = useQuery(api.orders.getOrderById, { orderId: orderId as any, sessionToken: sessionToken || undefined });
    const refundAction = useAction(api.stripe.adminRefundEscrow);
    
    const [returnFeeStr, setReturnFeeStr] = useState('');
    const [isRefunding, setIsRefunding] = useState(false);
    
    const formatMoney = (val?: number) => val !== undefined ? `$${val.toFixed(2)}` : '—';
    
    const handleRefund = async () => {
        if (!order) return;
        
        let returnFeeCents = 0;
        if (returnFeeStr.trim() !== '') {
            const parsed = parseFloat(returnFeeStr);
            if (isNaN(parsed) || parsed < 0) {
                Alert.alert("Error", "El cargo de gestión debe ser un número válido mayor o igual a cero.");
                return;
            }
            if (parsed >= order.total) {
                Alert.alert("Error", "El cargo de gestión no puede ser mayor o igual al total de la orden.");
                return;
            }
            returnFeeCents = Math.round(parsed * 100);
        }
        
        Alert.alert(
            "Confirmar Devolución",
            `¿Estás seguro de que deseas reembolsar esta orden?\n\nTotal a devolver al cliente: ${formatMoney(order.total - (returnFeeCents / 100))}\nCargo de gestión (ganancia plataforma): ${formatMoney(returnFeeCents / 100)}`,
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Reembolsar", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setIsRefunding(true);
                            await refundAction({
                                sessionToken,
                                orderId,
                                returnFeeAmountCents: returnFeeCents > 0 ? returnFeeCents : undefined
                            });
                            Alert.alert("Éxito", "La orden ha sido reembolsada correctamente.", [
                                { text: "OK", onPress: () => navigation.goBack() }
                            ]);
                        } catch (e: any) {
                            Alert.alert("Error al reembolsar", e.message);
                            setIsRefunding(false);
                        }
                    }
                }
            ]
        );
    };
    
    if (order === undefined) {
        return (
            <View style={[styles.container, { backgroundColor: isDark ? c.bgElevated : c.bg, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={c.primary} />
            </View>
        );
    }
    
    if (order === null) {
        return (
            <View style={[styles.container, { backgroundColor: isDark ? c.bgElevated : c.bg }]}>
                <MobileHeader title="Detalle de Orden" showBackButton />
                <Text style={{ textAlign: 'center', marginTop: 40, color: isDark ? 'white' : 'black' }}>Orden no encontrada.</Text>
            </View>
        );
    }

    const textColor = isDark ? 'white' : c.bgElevated;
    const subTextColor = isDark ? c.textSubtle : c.textSubtle;
    const cardBg = isDark ? c.surface2 : 'white';
    const borderColor = isDark ? c.border : c.divider;
    
    return (
        <View style={[styles.container, { backgroundColor: isDark ? c.bgElevated : c.bg }]}>
            <MobileHeader title="Gestión de Devolución" showBackButton />
            
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                    <Text style={[styles.sectionTitle, { color: textColor }]}>Detalles de la Orden</Text>
                    <View style={styles.row}><Text style={{color: subTextColor}}>ID:</Text><Text style={{color: textColor, flex: 1, textAlign: 'right'}}>{order._id}</Text></View>
                    <View style={styles.row}><Text style={{color: subTextColor}}>Estado:</Text><Text style={{color: textColor, fontWeight: 'bold'}}>{order.status}</Text></View>
                    <View style={styles.row}><Text style={{color: subTextColor}}>Escrow:</Text><Text style={{color: textColor}}>{order.escrowState}</Text></View>
                    <View style={styles.divider} />
                    <View style={styles.row}><Text style={{color: subTextColor}}>Venta Bruta:</Text><Text style={{color: textColor, fontWeight: 'bold'}}>{formatMoney(order.total)}</Text></View>
                    <View style={styles.row}><Text style={{color: subTextColor}}>Vendedor Recibe:</Text><Text style={{color: c.success}}>{formatMoney(order.netAmountCents ? order.netAmountCents / 100 : undefined)}</Text></View>
                </View>
                
                {["held", "released", "disputed"].includes(String(order.escrowState)) && (
                    <View style={[styles.card, { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.1)' : '#FEF2F2', borderColor: c.danger }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                            <AlertTriangle color={c.danger} size={20} />
                            <Text style={[styles.sectionTitle, { color: c.danger, marginBottom: 0, marginLeft: 8 }]}>Reembolsar Orden</Text>
                        </View>
                        
                        <Text style={{ color: isDark ? c.border : c.border, marginBottom: 12 }}>
                            Si ingresas un monto en "Cargo de Gestión", se hará un reembolso parcial al cliente y la plataforma retendrá la diferencia.
                        </Text>
                        
                        <Text style={{ color: textColor, fontWeight: '500', marginBottom: 4 }}>Cargo de Gestión de Devolución ($)</Text>
                        <TextInput
                            style={[styles.input, { color: textColor, borderColor, backgroundColor: isDark ? c.bgElevated : c.bg }]}
                            placeholder="Ej: 5.00"
                            placeholderTextColor={subTextColor}
                            keyboardType="numeric"
                            value={returnFeeStr}
                            onChangeText={setReturnFeeStr}
                            editable={!isRefunding}
                        />
                        
                        <Button
                            onPress={handleRefund}
                            variant="default"
                            disabled={isRefunding}
                            style={{ backgroundColor: c.danger, marginTop: 8 }}
                        >
                            {isRefunding ? "Procesando..." : "Ejecutar Devolución"}
                        </Button>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scroll: {
        padding: 16,
    },
    card: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(150,150,150,0.2)',
        marginVertical: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
    }
});
