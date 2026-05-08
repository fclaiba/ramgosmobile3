import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Users,
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Filter,
    Store,
    DollarSign,
    CreditCard,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search
} from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { useFintech } from '../contexts/FintechContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// Types removed/simplified as they are now inline or unused mocks
const ITEMS_PER_PAGE = 10;
const ROLE_FILTERS = ['all', 'consumer', 'business', 'influencer', 'admin'] as const;
type RoleFilter = typeof ROLE_FILTERS[number];

type SignupRow = {
    id: string;
    email: string;
    role: string;
    createdAt: string;
    emailVerified: boolean;
    requiresKyc: boolean;
    kycStatus: string;
};

export default function AdminDashboardScreen({ isTabMode, onMenuPress }: any) {
    const navigation = useNavigation<any>();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { user } = useAuth(); // We need current user for auth check (already handled in mutation but goof for UI)
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = useMemo(() => getStyles(isDark, insets), [isDark, insets]);

    // REAL DATA
    const users = useQuery(api.users.listUsers, user ? { adminId: user.id as Id<"users"> } : "skip") || [];
    const approveKYC = useMutation(api.users.approveKYC);
    const rejectKYC = useMutation(api.users.rejectKYC);

    // Mocks for Shop/Volume (Keep these or fetch if available, for now keep mocks for non-request)
    const shops = { length: 32 };
    const totalVolume = 125000; // Mock

    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
    const isNarrow = width < 420;

    // Derived state from REAL users
    const allSignups = useMemo(() => {
        return users.map(u => ({
            id: u._id,
            email: u.email,
            role: u.role,
            createdAt: u.joinedAt || new Date().toISOString(), // Schema has joinedAt
            name: u.name,
            avatar: u.avatar,
            kycStatus: u.kycStatus || 'pending', // Schema has kycStatus
            requiresKyc: u.role !== 'consumer', // Example rule
            emailVerified: true // Mock
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [users]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const [showFilters, setShowFilters] = useState(false);

    // Filter logic
    const filteredSignups = useMemo(() => {
        return allSignups.filter(row => {
            if (roleFilter !== 'all' && row.role !== roleFilter) return false;
            return true;
        });
    }, [allSignups, roleFilter]);

    const totalPages = Math.ceil(filteredSignups.length / ITEMS_PER_PAGE);
    const signups = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredSignups.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredSignups, currentPage]);


    const [confirmation, setConfirmation] = useState<{ visible: boolean; type: 'approve' | 'reject' | null; id: string | null; name: string | null }>({
        visible: false,
        type: null,
        id: null,
        name: null
    });

    // KYC Requests (filtered from users)
    const pendingRequests = useMemo(() => {
        return allSignups.filter(u => u.kycStatus === activeTab && u.requiresKyc);
    }, [allSignups, activeTab]);

    const handleApprove = (id: string, name: string) => {
        setConfirmation({ visible: true, type: 'approve', id, name });
    };

    const handleReject = (id: string, name: string) => {
        setConfirmation({ visible: true, type: 'reject', id, name });
    };

    const executeConfirmation = async () => {
        if (!confirmation.id || !confirmation.type || !user) return;

        try {
            if (confirmation.type === 'approve') {
                await approveKYC({ adminId: user.id as Id<"users">, targetUserId: confirmation.id as Id<"users"> });
                show(`${confirmation.name} aprobado correctamente.`, 'success');
            } else {
                await rejectKYC({ adminId: user.id as Id<"users">, targetUserId: confirmation.id as Id<"users"> });
                show(`${confirmation.name} rechazado correctamente.`, 'info');
            }
        } catch (e: any) {
            show(e.message || 'Error al procesar', 'error');
        } finally {
            setConfirmation({ visible: false, type: null, id: null, name: null });
        }
    };

    // Metrics
    const totalUsers = users.length;
    const totalShops = shops.length;
    const pendingKycCount = allSignups.filter(u => u.kycStatus === 'pending' && u.requiresKyc).length;

    const StatusBadge = ({ status }: { status: string }) => {
        let color = '#6B7280';
        let bg = '#F3F4F6';
        let text = status;

        switch (status) {
            case 'approved':
                color = isDark ? '#4ADE80' : '#166534';
                bg = isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7';
                text = 'Aprobado';
                break;
            case 'pending':
                color = isDark ? '#FCD34D' : '#B45309';
                bg = isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7';
                text = 'Pendiente';
                break;
            case 'rejected':
                color = isDark ? '#F87171' : '#991B1B';
                bg = isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEE2E2';
                text = 'Rechazado';
                break;
        }

        return (
            <View style={[styles.badge, { backgroundColor: bg }]}>
                <Text style={[styles.badgeText, { color }]}>{text}</Text>
            </View>
        );
    };

    const Pill = ({ text, color, bg }: { text: string; color: string; bg: string }) => (
        <View style={[styles.pill, { backgroundColor: bg }]}>
            <Text style={[styles.pillText, { color }]}>{text}</Text>
        </View>
    );

    const EmailVerifiedPill = ({ verified }: { verified: boolean }) => (
        <Pill
            text={verified ? 'Email OK' : 'Email Pend.'}
            color={verified ? (isDark ? '#4ADE80' : '#166534') : (isDark ? '#FCD34D' : '#B45309')}
            bg={verified ? (isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7') : (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7')}
        />
    );

    const KycPill = ({ status }: { status: string }) => {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'approved') {
            return <Pill text="KYC OK" color={isDark ? '#4ADE80' : '#166534'} bg={isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7'} />;
        }
        if (normalized === 'pending') {
            return <Pill text="KYC Pend." color={isDark ? '#FCD34D' : '#B45309'} bg={isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7'} />;
        }
        if (normalized === 'rejected') {
            return <Pill text="KYC Rech." color={isDark ? '#F87171' : '#991B1B'} bg={isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEE2E2'} />;
        }
        return <Pill text="KYC No" color={isDark ? '#9CA3AF' : '#6B7280'} bg={isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9'} />;
    };

    const layout = useMemo(() => {
        const pagePadding = 16;
        const containerWidth = Math.min(Math.max(width - pagePadding * 2, 280), 980);
        const gap = 12;
        const cols = containerWidth < 520 ? 1 : containerWidth < 920 ? 2 : 4;
        const metricCardWidth = Math.floor((containerWidth - gap * (cols - 1)) / cols);
        return { gap, metricCardWidth, contentPaddingBottom: Math.max(16, insets.bottom) + (isTabMode ? 96 : 24) };
    }, [width, insets.bottom, isTabMode]);

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Panel de Admin"
                subtitle="Supervisión General"
                backButton={!isTabMode}
                onBack={!isTabMode ? () => navigation.goBack() : undefined}
                onMenuPress={isTabMode ? onMenuPress : undefined}
            />

            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: layout.contentPaddingBottom }]}>
                {/* Overview Metrics */}
                <View style={[styles.sectionWrap, { marginBottom: 24 }]}>
                    <View style={[styles.metricsGrid, { gap: layout.gap }]}>
                        <View style={[styles.metricCard, { width: layout.metricCardWidth }]}>
                            <View style={[styles.metricIcon, { backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF' }]}>
                                <Users size={20} color={isDark ? '#60A5FA' : '#2563EB'} />
                            </View>
                            <Text style={styles.metricValue}>{totalUsers}</Text>
                            <Text style={styles.metricLabel}>Usuarios</Text>
                        </View>
                        <View style={[styles.metricCard, { width: layout.metricCardWidth }]}>
                            <View style={[styles.metricIcon, { backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#FFF7ED' }]}>
                                <Store size={20} color={isDark ? '#FB923C' : '#EA580C'} />
                            </View>
                            <Text style={styles.metricValue}>{totalShops}</Text>
                            <Text style={styles.metricLabel}>Comercios</Text>
                        </View>
                        <View style={[styles.metricCard, { width: layout.metricCardWidth }]}>
                            <View style={[styles.metricIcon, { backgroundColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5' }]}>
                                <DollarSign size={20} color={isDark ? '#34D399' : '#059669'} />
                            </View>
                            <Text style={styles.metricValue}>${(totalVolume / 1000).toFixed(1)}k</Text>
                            <Text style={styles.metricLabel}>Volumen</Text>
                        </View>
                        <View style={[styles.metricCard, { width: layout.metricCardWidth }]}>
                            <View style={[styles.metricIcon, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#F5F3FF' }]}>
                                <ShieldCheck size={20} color={isDark ? '#A78BFA' : '#7C3AED'} />
                            </View>
                            <Text style={styles.metricValue}>{pendingKycCount}</Text>
                            <Text style={styles.metricLabel}>KYC Pend.</Text>
                        </View>
                    </View>

                    {/* Quick link to AdminFinanceScreen — Sprint 7. */}
                    <TouchableOpacity
                        style={[styles.metricCard, { marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' }]}
                        onPress={() => navigation.navigate('AdminFinance')}
                    >
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                            <View style={[styles.metricIcon, { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEF2F2' }]}>
                                <CreditCard size={20} color={isDark ? '#F87171' : '#DC2626'} />
                            </View>
                            <View>
                                <Text style={[styles.metricLabel, { color: isDark ? '#F9FAFB' : '#111827', fontWeight: '700' }]}>Finanzas (admin)</Text>
                                <Text style={styles.metricLabel}>Transfers, escrows, disputas, refunds, reconciliación</Text>
                            </View>
                        </View>
                        <ChevronRight size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </TouchableOpacity>
                </View>

                {/* Recent sign ups */}
                <View style={[styles.sectionWrap, { marginBottom: 24 }]}>
                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>Nuevos registros</Text>
                            <Text style={styles.sectionCaption}>
                                {filteredSignups.length} de {allSignups.length} usuarios
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                style={[styles.filterButton, showFilters && styles.filterButtonActive]}
                                onPress={() => setShowFilters(!showFilters)}
                            >
                                <Filter size={16} color={showFilters ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280')} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Filters Panel */}
                    {showFilters && (
                        <View style={styles.filtersPanel}>
                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Rol</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                        {ROLE_FILTERS.map((role) => (
                                            <TouchableOpacity
                                                key={role}
                                                style={[styles.filterChip, roleFilter === role && styles.filterChipActive]}
                                                onPress={() => setRoleFilter(role)}
                                            >
                                                <Text style={[styles.filterChipText, roleFilter === role && styles.filterChipTextActive]}>
                                                    {role === 'all' ? 'Todos' : role.charAt(0).toUpperCase() + role.slice(1)}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>
                    )}

                    <View style={styles.signupsCard}>
                        {signups.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Search size={40} color={isDark ? '#374151' : '#E5E7EB'} />
                                <Text style={styles.emptyText}>
                                    {roleFilter !== 'all' ? 'No hay registros con estos filtros' : 'No hay registros disponibles'}
                                </Text>
                            </View>
                        ) : (
                            <>
                                {signups.map((row) => (
                                    <View key={row.id} style={styles.signupsRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.signupsEmail} numberOfLines={1}>{row.email}</Text>
                                            <Text style={styles.signupsMeta}>
                                                {new Date(row.createdAt).toLocaleDateString()} · {String(row.role).toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={styles.signupsBadges}>
                                            <Pill
                                                text={row.emailVerified ? 'Email OK' : 'Email Pend.'}
                                                color={row.emailVerified ? (isDark ? '#4ADE80' : '#166534') : (isDark ? '#FCD34D' : '#B45309')}
                                                bg={row.emailVerified ? (isDark ? 'rgba(22, 101, 52, 0.2)' : '#DCFCE7') : (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7')}
                                            />
                                            {row.requiresKyc ? <KycPill status={row.kycStatus} /> : <Pill text="KYC No req." color={isDark ? '#9CA3AF' : '#6B7280'} bg={isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9'} />}
                                        </View>
                                    </View>
                                ))}

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <View style={styles.paginationContainer}>
                                        <TouchableOpacity
                                            style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
                                            onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft size={18} color={currentPage === 1 ? (isDark ? '#4B5563' : '#D1D5DB') : (isDark ? '#E5E7EB' : '#374151')} />
                                        </TouchableOpacity>
                                        <Text style={styles.paginationText}>
                                            Página {currentPage} de {totalPages}
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
                                            onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                        >
                                            <ChevronRight size={18} color={currentPage === totalPages ? (isDark ? '#4B5563' : '#D1D5DB') : (isDark ? '#E5E7EB' : '#374151')} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </View>

                {/* KYC Management Section */}
                <View style={styles.sectionWrap}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Solicitudes KYC</Text>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabsContainer}>
                        {(['pending', 'approved', 'rejected'] as const).map((tab) => (
                            <TouchableOpacity
                                key={tab}
                                style={[
                                    styles.tab,
                                    activeTab === tab && styles.tabActive
                                ]}
                                onPress={() => setActiveTab(tab)}
                            >
                                <Text style={[
                                    styles.tabText,
                                    activeTab === tab && styles.tabTextActive
                                ]}>
                                    {tab === 'pending' ? 'Pendientes' : tab === 'approved' ? 'Aprobados' : 'Rechazados'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {pendingRequests.length === 0 ? (
                        <View style={styles.emptyState}>
                            <CheckCircle2 size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                            <Text style={styles.emptyText}>No hay solicitudes {activeTab === 'pending' ? ' pendientes' : ''}</Text>
                        </View>
                    ) : (
                        pendingRequests.map((req) => (
                            <View key={req.id} style={styles.requestCard}>
                                <View style={styles.requestHeader}>
                                    <View style={styles.userAvatar}>
                                        <Text style={styles.userInitials}>{req.name ? req.name.substring(0, 2).toUpperCase() : 'U'}</Text>
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.requestUser}>{req.name || req.email}</Text>
                                        <Text style={styles.requestType}>{req.role.toUpperCase()} User</Text>
                                    </View>
                                    <StatusBadge status={req.kycStatus} />
                                </View>

                                <View style={styles.requestBody}>
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Fecha Registro:</Text>
                                        <Text style={styles.infoValue}>{new Date(req.createdAt).toLocaleDateString()}</Text>
                                    </View>
                                    <View style={styles.documentPreview}>
                                        <View style={styles.docIcon}>
                                            <CreditCard size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                        </View>
                                        <Text style={styles.docName}>Documento de Identidad (Simulado)</Text>
                                        <TouchableOpacity>
                                            <Text style={styles.viewLink}>Ver</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {req.kycStatus === 'pending' && (
                                    <View style={styles.actionFooter}>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.rejectBtn]}
                                            onPress={() => handleReject(req.id, req.name || req.email)}
                                        >
                                            <XCircle size={16} color={isDark ? '#F87171' : '#B91C1C'} />
                                            <Text style={[styles.actionText, { color: isDark ? '#F87171' : '#B91C1C' }]}>Rechazar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.approveBtn]}
                                            onPress={() => handleApprove(req.id, req.name || req.email)}
                                        >
                                            <CheckCircle2 size={16} color={isDark ? '#4ADE80' : '#15803D'} />
                                            <Text style={[styles.actionText, { color: isDark ? '#4ADE80' : '#15803D' }]}>Aprobar</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <Sheet open={confirmation.visible} onOpenChange={(val: boolean) => setConfirmation(prev => ({ ...prev, visible: val }))}>
                <SheetContent side="bottom" style={styles.sheetContent}>
                    <View style={styles.sheetInner}>
                        <SheetHeader>
                            <SheetTitle>
                                {confirmation.type === 'approve' ? 'Aprobar KYC' : 'Rechazar KYC'}
                            </SheetTitle>
                        </SheetHeader>
                        <View style={styles.sheetBody}>
                            <View style={[
                                styles.confirmationIcon,
                                { backgroundColor: confirmation.type === 'approve' ? (isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7') : (isDark ? 'rgba(220, 38, 38, 0.2)' : '#fee2e2') }
                            ]}>
                                {confirmation.type === 'approve' ? (
                                    <CheckCircle2 size={32} color={isDark ? '#4ade80' : '#16a34a'} />
                                ) : (
                                    <AlertTriangle size={32} color={isDark ? '#f87171' : '#dc2626'} />
                                )}
                            </View>
                            <Text style={styles.sheetText}>
                                {confirmation.type === 'approve'
                                    ? `¿Estás seguro de aprobar a ${confirmation.name}? El usuario tendrá acceso inmediato a funciones verificadas.`
                                    : `¿Estás seguro de rechazar a ${confirmation.name}?`
                                }
                            </Text>
                            <View style={[styles.sheetActions, isNarrow && { flexDirection: 'column' }]}>
                                <Button
                                    variant="outline"
                                    style={{ flex: 1 }}
                                    onPress={() => setConfirmation({ visible: false, type: null, id: null, name: null })}
                                >
                                    <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Cancelar</Text>
                                </Button>
                                <Button
                                    style={{ flex: 1, backgroundColor: confirmation.type === 'approve' ? '#16a34a' : '#dc2626' }}
                                    onPress={executeConfirmation}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                                        {confirmation.type === 'approve' ? 'Aprobar' : 'Rechazar'}
                                    </Text>
                                </Button>
                            </View>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean, insets: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#111827' : '#F9FAFB',
    },
    content: {
        padding: 16,
        paddingBottom: insets.bottom + 20,
    },
    sectionWrap: {
        width: '100%',
        maxWidth: 980,
        alignSelf: 'center',
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    metricCard: {
        // width computed at runtime for predictable responsive layout
        backgroundColor: isDark ? '#1F2937' : '#fff',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
        alignItems: 'flex-start',
    },
    metricIcon: {
        padding: 8,
        borderRadius: 10,
        marginBottom: 12,
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    metricLabel: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
        marginTop: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    sectionCaption: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    signupsCard: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
        overflow: 'hidden',
    },
    signupsRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#374151' : '#E5E7EB',
        gap: 12,
    },
    filterButton: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterButtonActive: {
        backgroundColor: isDark ? '#6366F1' : '#4F46E5',
    },
    filtersPanel: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    filterGroup: {
        marginBottom: 12,
    },
    filterLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#9CA3AF' : '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#E5E7EB',
    },
    filterChipActive: {
        backgroundColor: isDark ? '#6366F1' : '#4F46E5',
        borderColor: isDark ? '#6366F1' : '#4F46E5',
    },
    filterChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    filterChipTextActive: {
        color: '#fff',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 40,
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    paginationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        gap: 16,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#374151' : '#E5E7EB',
    },
    paginationButton: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    paginationButtonDisabled: {
        opacity: 0.5,
    },
    paginationText: {
        fontSize: 13,
        fontWeight: '600',
        color: isDark ? '#D1D5DB' : '#4B5563',
    },
    signupsEmail: {
        fontSize: 13,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    signupsMeta: {
        marginTop: 2,
        fontSize: 11,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    signupsBadges: {
        alignItems: 'flex-end',
        gap: 6,
    },
    pill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
    },
    pillText: {
        fontSize: 10,
        fontWeight: '800',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: isDark ? '#1F2937' : '#fff',
        padding: 4,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabActive: {
        backgroundColor: isDark ? '#374151' : '#F3F4F6',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    tabTextActive: {
        color: isDark ? '#F9FAFB' : '#111827',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    requestCard: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    requestHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? '#374151' : '#E0F2FE',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#BAE6FD',
    },
    userInitials: {
        fontSize: 14,
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#0369A1',
    },
    requestUser: {
        fontSize: 14,
        fontWeight: '600',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    requestType: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    requestBody: {
        backgroundColor: isDark ? '#111827' : '#F9FAFB',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoLabel: {
        fontSize: 12,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    infoValue: {
        fontSize: 12,
        fontWeight: '500',
        color: isDark ? '#D1D5DB' : '#374151',
    },
    documentPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: isDark ? '#374151' : '#E5E7EB',
        marginTop: 4,
    },
    docIcon: {
        marginRight: 8,
    },
    docName: {
        flex: 1,
        fontSize: 12,
        color: isDark ? '#D1D5DB' : '#374151',
    },
    viewLink: {
        fontSize: 12,
        color: '#2563EB',
        fontWeight: '600',
    },
    actionFooter: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 10,
        gap: 6,
        borderWidth: 1,
    },
    rejectBtn: {
        borderColor: isDark ? '#7F1D1D' : '#FECACA',
        backgroundColor: isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEF2F2',
    },
    approveBtn: {
        borderColor: isDark ? '#14532D' : '#DCFCE7',
        backgroundColor: isDark ? 'rgba(20, 83, 45, 0.2)' : '#F0FDF4',
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    sheetContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: 400,
        borderColor: isDark ? '#374151' : '#E5E7EB',
        borderWidth: 1,
    },
    sheetInner: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
    },
    sheetBody: {
        padding: 24,
        paddingBottom: Math.max(24, insets.bottom + 16),
        alignItems: 'center',
        gap: 16
    },
    confirmationIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    sheetText: {
        fontSize: 16,
        color: isDark ? '#D1D5DB' : '#4B5563',
        textAlign: 'center',
        marginBottom: 16
    },
    sheetActions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    }
});
