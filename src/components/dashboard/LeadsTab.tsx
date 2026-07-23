import React, { useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Mail, ListTodo, FileText, Calendar, LifeBuoy, HelpCircle } from 'lucide-react-native';
import { Radius, colors } from '../../theme/tokens';

const QUERY_TYPES = [
    { id: 'all', label: 'Todas' },
    { id: 'general', label: 'General' },
    { id: 'quote', label: 'Cotización' },
    { id: 'visit', label: 'Visitas' },
    { id: 'support', label: 'Soporte' },
];

export function LeadsTab({ isDark, sessionToken }: any) {
    const leads = useQuery(api.businessForms.listLeads, sessionToken ? { sessionToken } : "skip") || [];
    const [filter, setFilter] = useState('all');
    
    const processedLeads = useMemo(() => {
        if (!leads) return [];
        return leads.map((l: any) => {
            const m = l.message?.match(/^\[(.*?)\] (.*)$/s);
            const type = m ? m[1] : 'general';
            const text = m ? m[2] : (l.message || 'Sin mensaje');
            
            // Buscar datos específicos
            const name = l.name || l.answers?.find((a: any) => a.label.toLowerCase().includes('nombre'))?.value || 'Desconocido';
            const email = l.email || l.answers?.find((a: any) => a.label.toLowerCase().includes('email'))?.value || '';
            const phone = l.phone || l.answers?.find((a: any) => a.label.toLowerCase().includes('tel'))?.value || '';
            
            return {
                ...l,
                queryType: type,
                cleanMessage: text,
                displayName: name,
                displayEmail: email,
                displayPhone: phone,
            };
        });
    }, [leads]);
    
    const filteredLeads = useMemo(() => {
        if (filter === 'all') return processedLeads;
        return processedLeads.filter((l: any) => l.queryType === filter);
    }, [processedLeads, filter]);

    if (sessionToken && leads === undefined) {
        return <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} />;
    }

    if (leads.length === 0) {
        return (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
                <ListTodo size={48} color={isDark ? '#4B5563' : '#9CA3AF'} />
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors(isDark).text, marginTop: 16 }}>Sin consultas aún</Text>
                <Text style={{ fontSize: 14, color: colors(isDark).textMuted, textAlign: 'center', marginTop: 8 }}>Cuando los usuarios te contacten desde tu perfil, aparecerán aquí.</Text>
            </View>
        );
    }

    const getTypeIcon = (type: string) => {
        if (type === 'quote') return <FileText size={16} color="#8B5CF6" />;
        if (type === 'visit') return <Calendar size={16} color="#EC4899" />;
        if (type === 'support') return <LifeBuoy size={16} color="#EF4444" />;
        return <HelpCircle size={16} color="#3B82F6" />;
    };

    const getTypeLabel = (type: string) => {
        return QUERY_TYPES.find(q => q.id === type)?.label || 'General';
    };

    return (
        <View style={{ gap: 16, marginTop: 12 }}>
            
            {/* Filtros horizontales */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {QUERY_TYPES.map(q => (
                    <TouchableOpacity
                        key={q.id}
                        onPress={() => setFilter(q.id)}
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: Radius.full,
                            backgroundColor: filter === q.id ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : '#e5e7eb'),
                            borderWidth: 1,
                            borderColor: filter === q.id ? '#2563eb' : 'transparent'
                        }}
                    >
                        <Text style={{ 
                            color: filter === q.id ? '#fff' : colors(isDark).textMuted, 
                            fontWeight: filter === q.id ? '700' : '500',
                            fontSize: 13
                        }}>
                            {q.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {filteredLeads.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: colors(isDark).textMuted }}>No hay consultas de este tipo.</Text>
                </View>
            ) : (
                filteredLeads.map((sub: any) => (
                    <View key={sub._id} style={{
                        backgroundColor: colors(isDark).glass, 
                        borderRadius: Radius.lg, 
                        padding: 20, 
                        borderWidth: 1, 
                        borderColor: colors(isDark).border 
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                                    {getTypeIcon(sub.queryType)}
                                </View>
                                <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors(isDark).text }}>
                                            {sub.displayName}
                                        </Text>
                                        <View style={{ backgroundColor: sub.status === 'new' ? (isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7') : (isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5'), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                                            <Text style={{ color: sub.status === 'new' ? (isDark ? '#FBBF24' : '#D97706') : (isDark ? '#34D399' : '#059669'), fontSize: 10, fontWeight: '800' }}>
                                                {sub.status === 'new' ? 'NUEVO' : 'VISTO'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={{ fontSize: 12, color: colors(isDark).textMuted, marginTop: 2 }}>
                                        {getTypeLabel(sub.queryType)} • {new Date(sub.submittedAt).toLocaleDateString()}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#ffffff', borderRadius: Radius.md, padding: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6' }}>
                            {sub.displayEmail ? (
                                <Text style={{ fontSize: 13, color: colors(isDark).textMuted, marginBottom: 4 }}>
                                    📧 {sub.displayEmail}
                                </Text>
                            ) : null}
                            
                            {sub.displayPhone ? (
                                <Text style={{ fontSize: 13, color: colors(isDark).textMuted, marginBottom: 12 }}>
                                    📱 {sub.displayPhone}
                                </Text>
                            ) : null}

                            <View style={{ height: 1, backgroundColor: isDark ? '#27272a' : '#e5e7eb', marginBottom: 12 }} />
                            
                            {sub.scheduledDate && sub.scheduledTime ? (
                                <View style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', padding: 12, borderRadius: Radius.md, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: isDark ? 'rgba(59,130,246,0.3)' : '#bfdbfe' }}>
                                    <Calendar size={18} color="#3B82F6" />
                                    <View>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>Cita Agendada</Text>
                                        <Text style={{ fontSize: 13, color: isDark ? '#93C5FD' : '#1D4ED8' }}>
                                            {sub.scheduledDate} a las {sub.scheduledTime}
                                        </Text>
                                    </View>
                                </View>
                            ) : null}
                            
                            <Text style={{ fontSize: 15, color: colors(isDark).text, lineHeight: 22 }}>
                                {sub.cleanMessage}
                            </Text>
                        </View>
                    </View>
                ))
            )}
        </View>
    );
}
