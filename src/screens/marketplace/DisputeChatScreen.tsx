import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Send, Clock, AlertOctagon, Gavel } from 'lucide-react-native';
import { MobileHeader } from '../../components/MobileHeader';
import { useMarketplace } from '../../contexts/MarketplaceContext';

export default function DisputeChatScreen({ route, navigation }: any) {
    const { orderId } = route.params;
    const { orders, addDisputeMessage } = useMarketplace();

    const [msgText, setMsgText] = useState('');

    const order = orders.find(o => o.id === orderId);
    const dispute = order?.dispute;

    if (!dispute) return null;

    // Arbitration Timer Mock
    const hoursLeft = 72; // Static for demo

    const handleSend = () => {
        if (!msgText.trim()) return;
        addDisputeMessage(orderId, {
            sender: 'buyer', // Mock role
            body: msgText
        });
        setMsgText('');
    };

    const handleEscalate = () => {
        Alert.alert(
            'Solicitar Arbitraje',
            'Al solicitar arbitraje, un agente de Ramgos revisará la evidencia y tomará una decisión final. Esto no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    style: 'destructive',
                    onPress: () => Alert.alert('Arbitraje Iniciado', 'El equipo de soporte ha sido notificado.')
                }
            ]
        );
    };

    const renderMessage = ({ item }: any) => {
        const isMe = item.sender === 'buyer'; // Mock role check
        return (
            <View style={[styles.bubbleContainer, isMe ? styles.right : styles.left]}>
                <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
                    <Text style={[styles.bubbleText, isMe ? styles.textRight : styles.textLeft]}>
                        {item.body}
                    </Text>
                </View>
                <Text style={styles.time}>{new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <MobileHeader title="Mediación" showBack onBack={() => navigation.goBack()} />

            {/* Timer Header */}
            <View style={styles.timerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color="#B45309" />
                    <Text style={styles.timerText}>Respuesta esperada en {hoursLeft}h</Text>
                </View>
                <TouchableOpacity onPress={handleEscalate} style={styles.arbitrationBtn}>
                    <Gavel size={14} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.arbitrationBtnText}>Arbitraje</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={dispute.messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                inverted={false} // Normal order
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={100}
                style={styles.footer}
            >
                <TextInput
                    style={styles.input}
                    placeholder="Escribe un mensaje..."
                    value={msgText}
                    onChangeText={setMsgText}
                />
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                    <Send size={20} color="#fff" />
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    timerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFBEB', padding: 12, borderBottomWidth: 1, borderColor: '#FCD34D' },
    timerText: { color: '#92400E', fontWeight: '500' },

    arbitrationBtn: { backgroundColor: '#DC2626', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
    arbitrationBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

    bubbleContainer: { marginBottom: 12, maxWidth: '80%' },
    left: { alignSelf: 'flex-start' },
    right: { alignSelf: 'flex-end', alignItems: 'flex-end' },

    bubble: { padding: 12, borderRadius: 16 },
    bubbleLeft: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
    bubbleRight: { backgroundColor: '#7C3AED', borderBottomRightRadius: 4 },

    bubbleText: { fontSize: 16 },
    textLeft: { color: '#1F2937' },
    textRight: { color: '#fff' },

    time: { fontSize: 10, color: '#9CA3AF', marginTop: 4, marginHorizontal: 4 },

    footer: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', alignItems: 'center', gap: 8 },
    input: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center' }
});
