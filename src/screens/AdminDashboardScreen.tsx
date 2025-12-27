import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Shield, Users, Store, Award, DollarSign, Activity, Search, Ban, CheckCircle, XCircle } from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { mockConvexStore, PublicUser } from '../services/auth/mockConvexStore'; // Import Store
import { useFocusEffect } from '@react-navigation/native';

export default function AdminDashboardScreen({ navigation, isTabMode, onMenuPress }: any) {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'approvals' | 'rewards'>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingUsers, setPendingUsers] = useState<PublicUser[]>([]);

    // Fetch pending users when tab changes or screen focuses
    const fetchPending = useCallback(async () => {
        try {
            const users = await mockConvexStore.getPendingKycUsers();
            setPendingUsers(users);
        } catch (error) {
            console.error('Error fetching KYC queue:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (activeTab === 'approvals') {
                fetchPending();
            }
        }, [activeTab, fetchPending])
    );

    // Also trigger on tab change
    useEffect(() => {
        if (activeTab === 'approvals') {
            fetchPending();
        }
    }, [activeTab, fetchPending]);

    const handleKycAction = async (userId: string, status: 'approved' | 'rejected', notes?: string) => {
        try {
            await mockConvexStore.updateKycStatus(userId, status, notes);
            Alert.alert('Éxito', `Usuario ${status === 'approved' ? 'aprobado' : 'rechazado'} correctamente.`);
            fetchPending(); // Refresh list
        } catch (error) {
            Alert.alert('Error', 'No se pudo actualizar el estado.');
        }
    };

    const stats = {
        users: 12450,
        businesses: 345,
        influencers: 89,
        revenue: 45678,
        pendingApprovals: 5,
        systemHealth: 98
    };

    const users = [
        { id: '1', name: 'María García', role: 'consumer', status: 'active', email: 'maria@test.com' },
        { id: '2', name: 'La Esquina', role: 'business', status: 'pending', email: 'biz@test.com' },
        { id: '3', name: 'Carlos Influencer', role: 'influencer', status: 'active', email: 'inf@test.com' },
    ];

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'consumer': return '#3b82f6';
            case 'business': return '#10b981';
            case 'influencer': return '#a855f7';
            default: return '#666';
        }
    };

    const handleBan = (name: string) => Alert.alert('Banear', `¿Suspender a ${name}?`, [{ text: 'Sí', style: 'destructive' }, { text: 'No' }]);

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Panel Admin"
                backButton={!isTabMode}
                onBack={!isTabMode ? () => navigation.goBack() : undefined}
                onMenuPress={isTabMode ? onMenuPress : undefined}
                actions={
                    <Badge variant="destructive" style={{ backgroundColor: '#ef4444' }}>
                        <Shield size={12} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}> Admin</Text>
                    </Badge>
                }
            />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* TABS simplified */}
                <View style={styles.tabsRow}>
                    {['overview', 'users', 'approvals', 'rewards'].map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[styles.tab, activeTab === t && styles.activeTab]}
                            onPress={() => setActiveTab(t as any)}
                        >
                            <Text style={[styles.tabText, activeTab === t && styles.activeTabText]}>
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {activeTab === 'overview' && (
                    <View style={styles.grid}>
                        <Card style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
                            <Users size={24} color="#fff" />
                            <Text style={styles.statValue}>{stats.users.toLocaleString()}</Text>
                            <Text style={styles.statLabel}>Usuarios</Text>
                        </Card>
                        <Card style={[styles.statCard, { backgroundColor: '#10b981' }]}>
                            <Store size={24} color="#fff" />
                            <Text style={styles.statValue}>{stats.businesses}</Text>
                            <Text style={styles.statLabel}>Negocios</Text>
                        </Card>
                        <Card style={[styles.statCard, { backgroundColor: '#a855f7' }]}>
                            <Award size={24} color="#fff" />
                            <Text style={styles.statValue}>{stats.influencers}</Text>
                            <Text style={styles.statLabel}>Influencers</Text>
                        </Card>
                        <Card style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
                            <DollarSign size={24} color="#fff" />
                            <Text style={styles.statValue}>${(stats.revenue / 1000).toFixed(1)}k</Text>
                            <Text style={styles.statLabel}>Ingresos</Text>
                        </Card>

                        {/* SYSTEM HEALTH */}
                        <Card style={{ padding: 16, marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontWeight: 'bold' }}>Salud del Sistema</Text>
                                <Badge variant="secondary" style={{ backgroundColor: '#dcfce7' }}>
                                    <Activity size={12} color="#16a34a" />
                                    <Text style={{ color: '#16a34a', fontSize: 10 }}> {stats.systemHealth}% Operativo</Text>
                                </Badge>
                            </View>
                            <View style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, width: '100%' }}>
                                <View style={{ height: '100%', width: `${stats.systemHealth}%`, backgroundColor: '#16a34a', borderRadius: 4 }} />
                            </View>
                        </Card>
                    </View>
                )}

                {activeTab === 'users' && (
                    <View style={{ gap: 12 }}>
                        <View style={styles.searchBox}>
                            <Search size={16} color="#999" />
                            <TextInput
                                placeholder="Buscar usuario..."
                                style={{ flex: 1 }}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                        {users.map(u => (
                            <Card key={u.id} style={{ padding: 12 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <View>
                                        <Text style={{ fontWeight: 'bold' }}>{u.name}</Text>
                                        <Text style={{ fontSize: 12, color: '#666' }}>{u.email}</Text>
                                        <Badge style={{ marginTop: 6, backgroundColor: getRoleColor(u.role), alignSelf: 'flex-start' }}>
                                            <Text style={{ color: '#fff', fontSize: 10 }}>{u.role}</Text>
                                        </Badge>
                                    </View>
                                    <TouchableOpacity onPress={() => handleBan(u.name)} style={{ padding: 8 }}>
                                        <Ban size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            </Card>
                        ))}
                    </View>
                )}

                {activeTab === 'approvals' && (
                    <View style={{ gap: 12, marginTop: 10 }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8, paddingHorizontal: 4 }}>Cola de Verificación (KYC)</Text>

                        {pendingUsers.length === 0 ? (
                            <View style={{ marginTop: 20, padding: 20, backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center' }}>
                                <Text style={{ color: '#6B7280', textAlign: 'center' }}>No hay solicitudes pendientes.</Text>
                            </View>
                        ) : (
                            pendingUsers.map((item) => (
                                <Card key={item.id} style={{ padding: 16 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</Text>
                                            <Text style={{ fontSize: 12, color: '#666' }}>{item.email}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                                                <Shield size={12} color="#666" />
                                                <Text style={{ fontSize: 12, color: '#333', textTransform: 'capitalize' }}>
                                                    {item.role} • {new Date(item.createdAt).toLocaleDateString()}
                                                </Text>
                                            </View>

                                            {/* Metadata Preview */}
                                            {item.kycMetadata && (
                                                <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                                                    {Object.entries(item.kycMetadata).map(([key, val]) => (
                                                        <Text key={key} style={{ fontSize: 11, color: '#4b5563' }}>
                                                            <Text style={{ fontWeight: '600' }}>{key}: </Text>{String(val)}
                                                        </Text>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
                                            <TouchableOpacity
                                                style={{ backgroundColor: '#FEE2E2', padding: 8, borderRadius: 8 }}
                                                onPress={() => Alert.alert(
                                                    'Rechazar',
                                                    'Motivo del rechazo:',
                                                    [
                                                        { text: 'Cancelar', style: 'cancel' },
                                                        {
                                                            text: 'Documentos Invalidos',
                                                            style: 'destructive',
                                                            onPress: () => handleKycAction(item.id, 'rejected', 'Documentos Invalidos')
                                                        }
                                                    ]
                                                )}
                                            >
                                                <XCircle size={20} color="#EF4444" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={{ backgroundColor: '#DCFCE7', padding: 8, borderRadius: 8 }}
                                                onPress={() => handleKycAction(item.id, 'approved')}
                                            >
                                                <CheckCircle size={20} color="#16A34A" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </Card>
                            ))
                        )}
                    </View>
                )}

                {activeTab === 'rewards' && (
                    <View style={{ gap: 16 }}>
                        <View style={styles.grid}>
                            <Card style={[styles.statCard, { backgroundColor: '#8B5CF6' }]}>
                                <Award size={24} color="#fff" />
                                <Text style={styles.statValue}>1.2M</Text>
                                <Text style={styles.statLabel}>Pts Distribuidos</Text>
                            </Card>
                            <Card style={[styles.statCard, { backgroundColor: '#F59E0B' }]}>
                                <Users size={24} color="#fff" />
                                <Text style={styles.statValue}>85%</Text>
                                <Text style={styles.statLabel}>Engagement</Text>
                            </Card>
                        </View>

                        {/* Rewards Breakdown */}
                        <Card style={{ padding: 16, gap: 12 }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Distribución de Puntos</Text>

                            <View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#666' }}>Compras (Marketplace)</Text>
                                    <Text style={{ fontSize: 12, fontWeight: '600' }}>65%</Text>
                                </View>
                                <View style={styles.barBg}>
                                    <View style={[styles.barFill, { width: '65%', backgroundColor: '#10B981' }]} />
                                </View>
                            </View>

                            <View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#666' }}>Arcade & Juegos</Text>
                                    <Text style={{ fontSize: 12, fontWeight: '600' }}>25%</Text>
                                </View>
                                <View style={styles.barBg}>
                                    <View style={[styles.barFill, { width: '25%', backgroundColor: '#F59E0B' }]} />
                                </View>
                            </View>

                            <View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#666' }}>Referidos</Text>
                                    <Text style={{ fontSize: 12, fontWeight: '600' }}>10%</Text>
                                </View>
                                <View style={styles.barBg}>
                                    <View style={[styles.barFill, { width: '10%', backgroundColor: '#3B82F6' }]} />
                                </View>
                            </View>
                        </Card>

                        {/* Recent Activity */}
                        <Card style={{ padding: 16, gap: 12 }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Actividad Reciente</Text>
                            {[
                                { user: 'Carlos M.', action: 'Canjeó Cupón 20%', time: 'Hace 5 min', points: -500 },
                                { user: 'Ana R.', action: 'Ganó en Arcade', time: 'Hace 12 min', points: +50 },
                                { user: 'Luisa P.', action: 'Referido Completado', time: 'Hace 1 hora', points: +250 },
                            ].map((item, idx) => (
                                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: '#f3f4f6' }}>
                                    <View>
                                        <Text style={{ fontWeight: '500' }}>{item.user}</Text>
                                        <Text style={{ fontSize: 12, color: '#666' }}>{item.action} • {item.time}</Text>
                                    </View>
                                    <Text style={{ fontWeight: 'bold', color: item.points > 0 ? '#16A34A' : '#EF4444' }}>
                                        {item.points > 0 ? '+' : ''}{item.points} pts
                                    </Text>
                                </View>
                            ))}
                        </Card>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9f9f9' },
    tabsRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, padding: 4, marginBottom: 16 },
    tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: '#f3f4f6' },
    tabText: { color: '#666', fontWeight: '500' },
    activeTabText: { color: '#000', fontWeight: 'bold' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: { width: '47%', padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
    statValue: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
    searchBox: { flexDirection: 'row', backgroundColor: '#fff', padding: 10, borderRadius: 8, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#eee' },
    barBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, width: '100%' },
    barFill: { height: '100%', borderRadius: 3 }
});
