import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, ScrollView, Platform } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { colors, Radius } from '../theme/tokens';
import { Calendar, Clock, XCircle, RefreshCw, ChevronLeft } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';


export default function MyBookingsScreen({ navigation }: any) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    
    const leads = useQuery(api.businessForms.getMyLeads, { sessionToken: sessionToken || undefined });
    const cancelMut = useMutation(api.businessForms.cancelLead);
    const postponeMut = useMutation(api.businessForms.postponeLead);

    const [postponeModalVisible, setPostponeModalVisible] = useState(false);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

    // Form logic for postponing
    const businessSettings = useQuery(api.businessSettings.getSettings, selectedBusinessId ? { businessId: selectedBusinessId } : 'skip');
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextDays = React.useMemo(() => {
        if (!businessSettings || !businessSettings.workingDays || businessSettings.workingDays.length === 0) return [];
        const days = [];
        let cursor = new Date(today);
        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        while (days.length < 14) { // Get next 14 available days
            const jsDay = cursor.getDay();
            const mappedDay = jsDay === 0 ? 7 : jsDay;
            if (businessSettings.workingDays.includes(mappedDay)) {
                const year = cursor.getFullYear();
                const month = String(cursor.getMonth() + 1).padStart(2, '0');
                const date = String(cursor.getDate()).padStart(2, '0');
                
                days.push({
                    date: new Date(cursor),
                    dateString: `${year}-${month}-${date}`,
                    label: `${diasSemana[jsDay]} ${cursor.getDate()}`,
                    isToday: cursor.getTime() === today.getTime(),
                });
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }, [businessSettings, today.getTime()]);

    // Compute time slots
    const availableSlots = React.useMemo(() => {
        if (!businessSettings || !selectedDate) return [];
        const slots = [];
        const [startH, startM] = businessSettings.startHour.split(':').map(Number);
        const [endH, endM] = businessSettings.endHour.split(':').map(Number);
        const duration = businessSettings.slotDurationMinutes || 60;
        
        let currentMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        while (currentMins + duration <= endMins) {
            const h = Math.floor(currentMins / 60);
            const m = currentMins % 60;
            const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            slots.push(timeStr);
            currentMins += duration;
        }
        return slots;
    }, [businessSettings, selectedDate]);

    const handleCancel = (leadId: string) => {
        Alert.alert('Cancelar Turno', '¿Estás seguro de que querés cancelar esta consulta/turno?', [
            { text: 'No', style: 'cancel' },
            { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
                try {
                    await cancelMut({ sessionToken: sessionToken || '', leadId: leadId as any });
                } catch (e: any) {
                    Alert.alert('Error', e.message);
                }
            }}
        ]);
    };

    const handleOpenPostpone = (leadId: string, businessId: string) => {
        setSelectedLeadId(leadId);
        setSelectedBusinessId(businessId);
        setSelectedDate('');
        setSelectedTime('');
        setPostponeModalVisible(true);
    };

    const handleConfirmPostpone = async () => {
        if (!selectedDate || !selectedTime) {
            Alert.alert('Error', 'Seleccioná un día y horario válido.');
            return;
        }
        setIsSubmitting(true);
        try {
            await postponeMut({
                sessionToken: sessionToken || '',
                leadId: selectedLeadId as any,
                scheduledDate: selectedDate,
                scheduledTime: selectedTime
            });
            setPostponeModalVisible(false);
            Alert.alert('Éxito', 'Tu turno ha sido postergado.');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusText = (status: string) => {
        switch(status) {
            case 'new': return { text: 'Pendiente', color: '#F59E0B' };
            case 'contacted': return { text: 'Contactado', color: '#3B82F6' };
            case 'resolved': return { text: 'Resuelto', color: '#10B981' };
            case 'cancelled': return { text: 'Cancelado', color: '#EF4444' };
            default: return { text: status, color: '#9CA3AF' };
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const statusObj = getStatusText(item.status);
        const postponements = item.postponementsCount || 0;
        const canPostpone = item.status === 'new' && postponements < 3 && item.scheduledDate;

        return (
            <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.businessName, { color: colors(isDark).text }]}>{item.businessName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusObj.color + '20' }]}>
                        <Text style={[styles.statusText, { color: statusObj.color }]}>{statusObj.text}</Text>
                    </View>
                </View>

                {item.scheduledDate ? (
                    <View style={styles.row}>
                        <Calendar size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={styles.infoText}>{item.scheduledDate} a las {item.scheduledTime}</Text>
                    </View>
                ) : (
                    <View style={styles.row}>
                        <Text style={styles.infoText}>Consulta Directa (Sin fecha)</Text>
                    </View>
                )}
                
                {postponements > 0 && item.status !== 'cancelled' && (
                    <Text style={styles.postponeText}>Postergado: {postponements}/3 veces</Text>
                )}

                {item.status === 'new' && (
                    <View style={styles.actions}>
                        <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => handleCancel(item._id)}>
                            <XCircle size={16} color="#EF4444" />
                            <Text style={styles.btnTextCancel}>Cancelar</Text>
                        </TouchableOpacity>
                        
                        {canPostpone && (
                            <TouchableOpacity style={[styles.btn, styles.btnPostpone]} onPress={() => handleOpenPostpone(item._id, item.businessId)}>
                                <RefreshCw size={16} color="#3B82F6" />
                                <Text style={styles.btnTextPostpone}>Postergar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </BlurView>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors(isDark).bg }]}>
            <View style={[styles.header, { borderBottomColor: colors(isDark).border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors(isDark).text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors(isDark).text }]}>Mis Turnos y Consultas</Text>
            </View>

            {leads === undefined ? (
                <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
            ) : leads.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Calendar size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                    <Text style={[styles.emptyText, { color: colors(isDark).textMuted }]}>No tienes turnos pendientes.</Text>
                </View>
            ) : (
                <FlatList
                    data={leads}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Modal de Postergación */}
            <Modal visible={postponeModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                        <Text style={[styles.modalTitle, { color: colors(isDark).text }]}>Elegí un nuevo horario</Text>
                        
                        {businessSettings === undefined ? (
                            <ActivityIndicator color="#3B82F6" style={{ marginVertical: 20 }} />
                        ) : (
                            <View style={styles.fieldGroup}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 16 }}>
                                    {nextDays.map(day => (
                                        <TouchableOpacity
                                            key={day.dateString}
                                            onPress={() => {
                                                setSelectedDate(day.dateString);
                                                setSelectedTime('');
                                            }}
                                            style={[styles.dateChip, selectedDate === day.dateString && styles.dateChipActive]}
                                        >
                                            <Text style={[styles.dateChipText, selectedDate === day.dateString && styles.dateChipTextActive]}>
                                                {day.isToday ? 'Hoy' : day.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    <View style={{ width: 40 }} />
                                </ScrollView>

                                {selectedDate ? (
                                    <View style={styles.timeGrid}>
                                        {availableSlots.length > 0 ? availableSlots.map(time => (
                                            <TouchableOpacity
                                                key={time}
                                                onPress={() => setSelectedTime(time)}
                                                style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
                                            >
                                                <Text style={[styles.timeChipText, selectedTime === time && styles.timeChipTextActive]}>{time}</Text>
                                            </TouchableOpacity>
                                        )) : (
                                            <Text style={{ color: colors(isDark).textMuted, fontStyle: 'italic' }}>Sin horarios.</Text>
                                        )}
                                    </View>
                                ) : null}
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.btnModal, { backgroundColor: 'transparent' }]} onPress={() => setPostponeModalVisible(false)}>
                                <Text style={[styles.btnModalText, { color: colors(isDark).text }]}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#3B82F6', opacity: isSubmitting ? 0.7 : 1 }]} onPress={handleConfirmPostpone} disabled={isSubmitting}>
                                <Text style={styles.btnModalTextActive}>{isSubmitting ? 'Guardando...' : 'Confirmar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
    backBtn: { marginRight: 16 },
    title: { fontSize: 20, fontWeight: '700' },
    list: { padding: 16, gap: 16, paddingBottom: 100 },
    card: { padding: 16, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    businessName: { fontSize: 16, fontWeight: '700' }, 
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
    statusText: { fontSize: 12, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    infoText: { fontSize: 14, color: '#9CA3AF' },
    postponeText: { fontSize: 12, color: '#F59E0B', marginTop: 4, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(156,163,175,0.2)' },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: Radius.md, gap: 6, borderWidth: 1 },
    btnCancel: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.1)' },
    btnPostpone: { borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.1)' },
    btnTextCancel: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
    btnTextPostpone: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    emptyText: { fontSize: 16 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { padding: 20, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
    fieldGroup: { marginBottom: 20 },
    dateChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: 'rgba(156,163,175,0.1)', marginRight: 10 },
    dateChipActive: { backgroundColor: '#3B82F6' },
    dateChipText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
    dateChipTextActive: { color: '#FFFFFF' },
    timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    timeChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: 'rgba(156,163,175,0.1)' },
    timeChipActive: { backgroundColor: '#3B82F6' },
    timeChipText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
    timeChipTextActive: { color: '#FFFFFF' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    btnModal: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.md },
    btnModalText: { fontWeight: '600', fontSize: 16 },
    btnModalTextActive: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
});
