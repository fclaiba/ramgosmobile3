import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Clock, CalendarDays, CheckCircle2 } from 'lucide-react-native';
import { Radius, colors, glassShadow } from '../../theme/tokens';
import { useToast } from '../../contexts/ToastContext';

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
const DAYS = [
    { id: 1, label: "Lun" },
    { id: 2, label: "Mar" },
    { id: 3, label: "Mié" },
    { id: 4, label: "Jue" },
    { id: 5, label: "Vie" },
    { id: 6, label: "Sáb" },
    { id: 0, label: "Dom" },
];

export function AgendaConfigTab({ isDark, sessionToken, businessId }: any) {
    const { show } = useToast();
    
    const settings = useQuery(api.businessSettings.getSettings, { businessId }) || null;
    const updateSettings = useMutation(api.businessSettings.updateSettings);

    const [startHour, setStartHour] = useState("09:00");
    const [endHour, setEndHour] = useState("18:00");
    const [slotDuration, setSlotDuration] = useState(60);
    const [workingDays, setWorkingDays] = useState<number[]>([1,2,3,4,5]);
    
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings) {
            setStartHour(settings.startHour);
            setEndHour(settings.endHour);
            setSlotDuration(settings.slotDurationMinutes);
            setWorkingDays(settings.workingDays);
        }
    }, [settings]);

    const toggleDay = (dayId: number) => {
        if (workingDays.includes(dayId)) {
            setWorkingDays(prev => prev.filter(d => d !== dayId));
        } else {
            setWorkingDays(prev => [...prev, dayId]);
        }
    };

    const handleSave = async () => {
        if (workingDays.length === 0) {
            show("Debes seleccionar al menos un día laborable.", "warning");
            return;
        }
        setIsSaving(true);
        try {
            await updateSettings({
                sessionToken,
                startHour,
                endHour,
                slotDurationMinutes: slotDuration,
                workingDays
            });
            show("Configuración de agenda guardada exitosamente.", "success");
        } catch (error) {
            show("Error al guardar la configuración.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    if (settings === undefined) {
        return <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />;
    }

    return (
        <ScrollView style={{ marginTop: 16, paddingHorizontal: 4 }} showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors(isDark).text, marginBottom: 8 }}>Configuración de Agenda</Text>
                <Text style={{ fontSize: 14, color: colors(isDark).textMuted }}>Definí en qué horarios y días tus clientes pueden agendar citas o test drives con vos.</Text>
            </View>

            {/* Días laborables */}
            <View style={{ backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: colors(isDark).border, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                    <CalendarDays size={18} color="#3b82f6" />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors(isDark).text }}>Días Laborables</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {DAYS.map(day => {
                        const active = workingDays.includes(day.id);
                        return (
                            <TouchableOpacity
                                key={day.id}
                                onPress={() => toggleDay(day.id)}
                                style={{
                                    paddingHorizontal: 14,
                                    paddingVertical: 10,
                                    borderRadius: Radius.full,
                                    backgroundColor: active ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6'),
                                    borderWidth: 1,
                                    borderColor: active ? '#2563eb' : 'transparent',
                                }}
                            >
                                <Text style={{ color: active ? '#fff' : colors(isDark).textMuted, fontWeight: active ? '700' : '500' }}>{day.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Horario de Atención */}
            <View style={{ backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: colors(isDark).border, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
                    <Clock size={18} color="#3b82f6" />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors(isDark).text }}>Horario de Atención</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors(isDark).textMuted, marginBottom: 8, fontWeight: '600' }}>Apertura</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderRadius: Radius.md, overflow: 'hidden' }}>
                            {HOURS.map(h => (
                                <TouchableOpacity
                                    key={`start-${h}`}
                                    onPress={() => setStartHour(h)}
                                    style={{
                                        paddingHorizontal: 12, paddingVertical: 10,
                                        backgroundColor: startHour === h ? (isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe') : 'transparent',
                                        borderWidth: 1, borderColor: startHour === h ? '#3b82f6' : colors(isDark).border,
                                        borderRadius: Radius.md, marginRight: 6
                                    }}
                                >
                                    <Text style={{ color: startHour === h ? '#3b82f6' : colors(isDark).textMuted, fontWeight: '600' }}>{h}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors(isDark).textMuted, marginBottom: 8, fontWeight: '600' }}>Cierre</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderRadius: Radius.md, overflow: 'hidden' }}>
                            {HOURS.map(h => (
                                <TouchableOpacity
                                    key={`end-${h}`}
                                    onPress={() => setEndHour(h)}
                                    style={{
                                        paddingHorizontal: 12, paddingVertical: 10,
                                        backgroundColor: endHour === h ? (isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe') : 'transparent',
                                        borderWidth: 1, borderColor: endHour === h ? '#3b82f6' : colors(isDark).border,
                                        borderRadius: Radius.md, marginRight: 6
                                    }}
                                >
                                    <Text style={{ color: endHour === h ? '#3b82f6' : colors(isDark).textMuted, fontWeight: '600' }}>{h}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </View>

            {/* Duración de turnos */}
            <View style={{ backgroundColor: colors(isDark).glass, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: colors(isDark).border, marginBottom: 24 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors(isDark).text, marginBottom: 12 }}>Duración de Turnos</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[15, 30, 45, 60].map(mins => (
                        <TouchableOpacity
                            key={mins}
                            onPress={() => setSlotDuration(mins)}
                            style={{
                                flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md,
                                backgroundColor: slotDuration === mins ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6'),
                                borderWidth: 1, borderColor: slotDuration === mins ? '#2563eb' : 'transparent',
                            }}
                        >
                            <Text style={{ color: slotDuration === mins ? '#fff' : colors(isDark).text, fontWeight: '600' }}>{mins} min</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <TouchableOpacity 
                style={{ backgroundColor: '#10b981', paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 40 }}
                onPress={handleSave}
                disabled={isSaving}
            >
                {isSaving ? <ActivityIndicator color="#fff" /> : (
                    <>
                        <CheckCircle2 size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Guardar Horarios</Text>
                    </>
                )}
            </TouchableOpacity>

        </ScrollView>
    );
}
