import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { ShoppingBag, Ticket, Calendar, Filter, Search, X, ChevronDown, History, TrendingUp, ShieldCheck, Lock } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { MARKETPLACE_ESCROW_RELEASE_DAYS, useMarketplace } from '../contexts/MarketplaceContext';
import { useFintech, PaymentRecord } from '../contexts/FintechContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { useAuth } from '../contexts/AuthContext';
import { useEscrow } from '../contexts/EscrowContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';




interface HistoryItem {
    id: string;
    type: 'purchase' | 'sale' | 'bonus' | 'event';
    kind: 'products' | 'services' | 'bonos' | 'events' | 'other';
    title: string;
    business: string;
    image: string;
    price?: number;
    discount?: number;
    location: string;
    date: string;
    status: 'completed' | 'pending' | 'cancelled';
    orderId: string;
    category: string;
    paymentMethod: string;
    quantity?: number;
    source: 'marketplace_order' | 'fintech_payment' | 'legacy';
}

type PurchaseKindFilter = 'all' | 'products' | 'services' | 'bonos' | 'events';

const initialHistoryItems: HistoryItem[] = [
    {
        id: '1',
        type: 'purchase',
        kind: 'products',
        title: 'Tacos de Birria Premium x3',
        business: 'Taquería El Sabor',
        image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
        price: 38.97,
        location: 'Miami, FL',
        date: '2025-10-18T14:30:00',
        status: 'completed',
        orderId: 'ORD-001234',
        category: 'Gastronomía',
        paymentMethod: 'Visa •••• 4242',
        quantity: 3,
        source: 'legacy',
    },
    {
        id: '2',
        type: 'bonus',
        kind: 'bonos',
        title: '30% OFF en tu primera compra',
        business: 'Fashion Latina',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        discount: 30,
        location: 'Orlando, FL',
        date: '2025-10-17T10:15:00',
        status: 'completed',
        orderId: 'BON-005678',
        category: 'Moda',
        paymentMethod: 'Bono de descuento',
        source: 'legacy',
    },
    {
        id: '3',
        type: 'event',
        kind: 'events',
        title: 'Festival Gastronómico Latino',
        business: 'Latin Food Fest',
        image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
        price: 25.00,
        location: 'Miami Beach, FL',
        date: '2025-10-16T18:00:00',
        status: 'completed',
        orderId: 'EVT-009012',
        category: 'Eventos',
        paymentMethod: 'Mastercard •••• 8888',
        source: 'legacy',
    },
    {
        id: '4',
        type: 'purchase',
        kind: 'services',
        title: 'Masaje Relajante 60min',
        business: 'Spa Tranquilidad',
        image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
        price: 89.99,
        location: 'Fort Lauderdale, FL',
        date: '2025-10-15T16:00:00',
        status: 'pending',
        orderId: 'ORD-003456',
        category: 'Bienestar',
        paymentMethod: 'Visa •••• 4242',
        source: 'legacy',
    },
];

export default function HistoryScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>('purchases');
    const [purchaseKindFilter, setPurchaseKindFilter] = useState<PurchaseKindFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const { orders, products } = useMarketplace();
    const { payments, releasePayment } = useFintech();
    const { openEscrow } = useEscrow();
    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const [filtersOpen, setFiltersOpen] = useState(false);

    // #region agent log
    // Removed debug logging
    // #endregion

    const [datePreset, setDatePreset] = useState<'all' | 'today' | '7d' | '30d' | '90d' | '1y' | 'custom'>('all');
    const [dateFrom, setDateFrom] = useState(''); // YYYY-MM-DD
    const [dateTo, setDateTo] = useState(''); // YYYY-MM-DD

    const escrowMeta = (state?: string) => {
        switch (state) {
            case 'held':
                return { label: 'En retención (escrow)', color: '#D97706' };
            case 'release_scheduled':
                return { label: 'Liberación programada', color: '#2563EB' };
            case 'released':
                return { label: 'Liberado', color: '#059669' };
            case 'disputed':
                return { label: 'En disputa', color: '#DC2626' };
            case 'refunded':
                return { label: 'Reembolsado', color: '#6B7280' };
            default:
                return { label: state ? String(state) : 'No aplica', color: '#6B7280' };
        }
    };

    const parseDateInput = (value: string): Date | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
        const date = new Date(year, month - 1, day);
        // Validate normalization (e.g., 2026-02-31 should be invalid)
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        return date;
    };

    const dateRange = useMemo(() => {
        if (datePreset === 'all') return { from: null as Date | null, to: null as Date | null };

        const now = new Date();
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);

        if (datePreset === 'custom') {
            const fromDate = parseDateInput(dateFrom);
            const toDate = parseDateInput(dateTo);
            if (fromDate) fromDate.setHours(0, 0, 0, 0);
            if (toDate) toDate.setHours(23, 59, 59, 999);
            return { from: fromDate, to: toDate };
        }

        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        const days =
            datePreset === 'today' ? 0 :
                datePreset === '7d' ? 7 :
                    datePreset === '30d' ? 30 :
                        datePreset === '90d' ? 90 :
                            datePreset === '1y' ? 365 :
                                0;
        start.setDate(start.getDate() - days);

        return { from: start, to: end };
    }, [datePreset, dateFrom, dateTo]);

    const activeDateFilter =
        datePreset !== 'all' &&
        (datePreset !== 'custom' || !!parseDateInput(dateFrom) || !!parseDateInput(dateTo));

    const baseHistoryItems = useMemo(
        () =>
            initialHistoryItems
                .filter((item) => item.type !== 'purchase')
                .map((item) => ({ ...item, source: 'legacy' as const })),
        []
    );

    const getMarketplaceListingType = (productId?: string) => {
        const product = products.find((p) => p.id === productId);
        return (product?.listingType ?? 'product') as 'product' | 'service' | 'event';
    };

    const getOrderListingTypes = (order: any): Array<'product' | 'service' | 'event'> => {
        const types = order.items.map((it: any) => getMarketplaceListingType(it.productId));
        return types.length > 0 ? types : ['product'];
    };

    const listingTypesToKind = (types: Array<'product' | 'service' | 'event'>): HistoryItem['kind'] => {
        // Prioritize "service" and "event" if present, otherwise default to products.
        if (types.includes('service')) return 'services';
        if (types.includes('event')) return 'events';
        return 'products';
    };

    const purchaseOrderHistoryItems = useMemo<HistoryItem[]>(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return orders
            .filter((order) => (user?.id ? order.buyerId === user.id : true))
            .map((order) => {
                const firstItem = order.items[0];
                const product = products.find((p) => p.id === firstItem?.productId);
                const listingTypes = getOrderListingTypes(order);
                const kind = listingTypesToKind(listingTypes);
                const status: HistoryItem['status'] =
                    order.paymentStatus === 'refunded'
                        ? 'cancelled'
                        : order.status === 'completed'
                            ? 'completed'
                            : 'pending';

                return {
                    id: `purchase-${order.id}`,
                    type: 'purchase',
                    kind,
                    title: firstItem?.title ?? 'Compra Marketplace',
                    business: order.sellerName,
                    image: product?.images[0]?.url ?? fallbackImage,
                    price: order.totals.grandTotal,
                    location: order.shipping.destination.city ?? order.shipping.destination.country ?? 'A coordinar',
                    date: order.createdAt,
                    status,
                    orderId: order.id,
                    category: product?.category ?? 'Marketplace',
                    paymentMethod: 'Marketplace (escrow)',
                    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
                    source: 'marketplace_order',
                };
            });
    }, [orders, products, user?.id]);

    const salesOrderHistoryItems = useMemo<HistoryItem[]>(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return orders
            .filter((order) => (user?.id ? order.sellerId === user.id : false))
            .filter((order) => {
                // Consumer/Influencer: only allow sales of products/services (exclude events)
                if (!user) return false;
                if (user.role !== 'consumer' && user.role !== 'influencer') return true;
                const listingTypes = getOrderListingTypes(order);
                return listingTypes.every((t) => t === 'product' || t === 'service');
            })
            .map((order) => {
                const firstItem = order.items[0];
                const product = products.find((p) => p.id === firstItem?.productId);
                const listingTypes = getOrderListingTypes(order);
                const kind = listingTypesToKind(listingTypes);
                const status: HistoryItem['status'] =
                    order.paymentStatus === 'refunded'
                        ? 'cancelled'
                        : order.status === 'completed'
                            ? 'completed'
                            : 'pending';

                return {
                    id: `sale-${order.id}`,
                    type: 'sale',
                    kind,
                    title: firstItem?.title ?? 'Venta Marketplace',
                    business: `Venta a ${order.buyerId.slice(-6).toUpperCase()}`,
                    image: product?.images[0]?.url ?? fallbackImage,
                    price: order.totals.grandTotal,
                    location: order.shipping.destination.city ?? order.shipping.destination.country ?? 'A coordinar',
                    date: order.createdAt,
                    status,
                    orderId: order.id,
                    category: product?.category ?? 'Marketplace',
                    paymentMethod: 'Marketplace (escrow)',
                    quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
                    source: 'marketplace_order',
                };
            });
    }, [orders, products, user]);

    const fintechHistoryItems = useMemo<HistoryItem[]>(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return payments.map((payment: PaymentRecord) => {
            const status: HistoryItem['status'] =
                payment.status === 'succeeded'
                    ? 'completed'
                    : payment.status === 'processing'
                        ? 'pending'
                        : 'cancelled';

            return {
                id: `fintech-${payment.id}`,
                type: 'purchase',
                kind: 'products',
                title: (payment.metadata?.description as string) ?? 'Compra Ramgos',
                business: payment.split.sellerName,
                image: (payment.metadata?.image as string) ?? fallbackImage,
                price: payment.amount,
                location: (payment.metadata?.location as string) ?? 'Online',
                date: payment.createdAt,
                status,
                orderId: payment.id,
                category: (payment.metadata?.category as string) ?? 'Fintech',
                paymentMethod: `${payment.method.brand} •••• ${payment.method.last4}`,
                quantity: payment.metadata?.quantity ? Number(payment.metadata.quantity) : undefined,
                source: 'fintech_payment',
            };
        });
    }, [payments]);

    const historyItems = useMemo(() => {
        const combinedPurchases = [...purchaseOrderHistoryItems, ...fintechHistoryItems, ...baseHistoryItems];
        const combinedSales = [...salesOrderHistoryItems];
        const combined = activeTab === 'sales' ? combinedSales : combinedPurchases;
        return combined.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [activeTab, purchaseOrderHistoryItems, salesOrderHistoryItems, fintechHistoryItems, baseHistoryItems]);

    const filteredItems = historyItems.filter(item => {
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
            !q ||
            item.title.toLowerCase().includes(q) ||
            item.business.toLowerCase().includes(q) ||
            item.orderId.toLowerCase().includes(q);

        const matchesPurchaseKind =
            activeTab !== 'purchases' ||
            purchaseKindFilter === 'all' ||
            item.kind === purchaseKindFilter;

        const itemTime = new Date(item.date).getTime();
        const matchesDate =
            !activeDateFilter ||
            (!Number.isNaN(itemTime) &&
                (!dateRange.from || itemTime >= dateRange.from.getTime()) &&
                (!dateRange.to || itemTime <= dateRange.to.getTime()));

        return matchesSearch && matchesPurchaseKind && matchesDate;
    });

    const getItemIcon = (type: HistoryItem['type']) => {
        switch (type) {
            case 'purchase': return ShoppingBag;
            case 'sale': return TrendingUp;
            case 'bonus': return Ticket;
            case 'event': return Calendar;
        }
    };

    const getStatusColor = (status: HistoryItem['status']) => {
        switch (status) {
            case 'completed': return isDark ? '#064E3B' : '#DCFCE7'; // green-900 / green-100
            case 'pending': return isDark ? '#451A03' : '#FEF9C3'; // yellow-900 / yellow-100
            case 'cancelled': return isDark ? '#450A0A' : '#FEE2E2'; // red-900 / red-100
        }
    };

    const getStatusTextColor = (status: HistoryItem['status']) => {
        switch (status) {
            case 'completed': return isDark ? '#6EE7B7' : '#166534'; // green-300 / green-800
            case 'pending': return isDark ? '#FDE047' : '#854d0e'; // yellow-300 / yellow-800
            case 'cancelled': return isDark ? '#FCA5A5' : '#991b1b'; // red-300 / red-800
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const stats = {
        all: historyItems.length,
        totalSpent: historyItems
            .filter(i => i.status === 'completed' && i.price)
            .reduce((sum, i) => sum + (i.price || 0), 0),
    };


    const handleAction = (item: HistoryItem, action: 'dispute' | 'confirm') => {
        if (action === 'dispute') {
            navigation.navigate('Dispute', { orderId: item.orderId });
            return;
        }

        if (!item.orderId) {
            show('No encontramos información de la orden', 'error');
            return;
        }

        const released = releasePayment(item.orderId);
        if (released) {
            show('Pago liberado al vendedor', 'success');
            return;
        }

        // Use Convex Mutation
        confirmReceiptMutation({ orderId: item.orderId as any, userId: user?.id ?? '' })
            .then(() => {
                show('Entrega confirmada. El pago se liberará pronto', 'success');
            })
            .catch((err) => {
                show(err.message ?? 'No pudimos confirmar la entrega', 'error');
            });
    };

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Mis compras"
                subtitle={`${filteredItems.length} transacciones`}
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={18} color={isDark ? "#9CA3AF" : "#666"} style={{ marginRight: 8 }} />
                    <Input
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={{ flex: 1, borderWidth: 0, color: isDark ? '#F9FAFB' : '#000' }}
                        placeholderTextColor={isDark ? "#6B7280" : "#999"}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={18} color={isDark ? "#9CA3AF" : "#666"} />
                        </TouchableOpacity>
                    )}
                </View>
                <Button variant="outline" style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
                    <View style={{ position: 'relative', width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                        <Filter size={18} color={isDark ? "#F9FAFB" : "#000"} />
                        {activeDateFilter && <View style={styles.filterActiveDot} />}
                    </View>
                </Button>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Stats Cards Row */}
                <View style={styles.statsRow}>
                    <Card style={[styles.statsCard, { backgroundColor: isDark ? '#064E3B' : '#F0FDF4' }]}>
                        <CardContent style={styles.statsContent}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <ShoppingBag size={14} color="#16A34A" />
                                <Text style={styles.statsLabel}> {activeTab === 'sales' ? 'Total Vendido' : 'Total Gastado'}</Text>
                            </View>
                            <Text style={[styles.statsValue, { color: '#16A34A' }]}>${stats.totalSpent.toFixed(2)}</Text>
                        </CardContent>
                    </Card>
                    <Card style={[styles.statsCard, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                        <CardContent style={styles.statsContent}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <History size={14} color="#2563EB" />
                                <Text style={styles.statsLabel}> Transacciones</Text>
                            </View>
                            <Text style={[styles.statsValue, { color: '#2563EB' }]}>{stats.all}</Text>
                        </CardContent>
                    </Card>
                </View>

                {/* Controls Bar (single horizontal bar like Marketplace) */}
                <View style={styles.controlsBar}>
                    <View style={styles.tabsGroup}>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === 'purchases' && styles.tabBtnActive]}
                            onPress={() => {
                                setActiveTab('purchases');
                                setPurchaseKindFilter('all');
                            }}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'purchases' && styles.tabBtnTextActive]}>
                                Compras
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === 'sales' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('sales')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'sales' && styles.tabBtnTextActive]}>
                                Ventas
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'purchases' && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.purchaseFilterContent}
                            style={styles.purchaseFilterScrollInline}
                        >
                            {([
                                { id: 'all', label: 'Todos' },
                                { id: 'products', label: 'Productos' },
                                { id: 'services', label: 'Servicios' },
                                { id: 'bonos', label: 'Bonos' },
                                { id: 'events', label: 'Eventos' },
                            ] as const).map((chip) => {
                                const active = purchaseKindFilter === chip.id;
                                return (
                                    <TouchableOpacity
                                        key={chip.id}
                                        style={[styles.purchaseChip, active && styles.purchaseChipActive]}
                                        onPress={() => setPurchaseKindFilter(chip.id)}
                                    >
                                        <Text style={[styles.purchaseChipText, active && styles.purchaseChipTextActive]}>
                                            {chip.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>

                {/* List Items */}
                <View style={styles.listContainer}>
                    {filteredItems.map((item) => {
                        const IconComponent = getItemIcon(item.type);
                        const canOpenEscrow =
                            item.source === 'marketplace_order' &&
                            (item.kind === 'products' || item.kind === 'services');
                        return (
                            <Card key={item.id} style={[styles.itemCard, { backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                                <CardContent style={styles.itemContent}>
                                    <View style={styles.itemRow}>
                                        <View style={styles.imageContainer}>
                                            <ImageWithFallback src={item.image} style={styles.itemImage} />
                                            <View style={styles.iconOverlay}>
                                                <IconComponent size={12} color="#fff" />
                                            </View>
                                        </View>
                                        <View style={styles.itemDetails}>
                                            <View style={styles.itemHeader}>
                                                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                                                <View style={{
                                                    backgroundColor: getStatusColor(item.status),
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 4
                                                }}>
                                                    <Text style={{
                                                        color: getStatusTextColor(item.status),
                                                        fontSize: 10,
                                                        fontWeight: '700'
                                                    }}>
                                                        {item.status === 'completed' ? 'EXITOSO' : item.status === 'pending' ? 'PENDIENTE' : 'CANCELADO'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={styles.itemBusiness}>{item.business}</Text>
                                            <Text style={styles.itemMeta}>{formatDate(item.date)} • {item.paymentMethod}</Text>
                                            <Text style={styles.itemPrice}>
                                                {item.type === 'bonus' ? `${item.discount}% OFF` : `$${item.price?.toFixed(2)}`}
                                            </Text>

                                            {canOpenEscrow && (
                                                <TouchableOpacity
                                                    style={styles.detailsButton}
                                                    onPress={() => {
                                                        openEscrow(item.orderId, activeTab === 'sales' ? 'seller' : 'buyer');
                                                    }}
                                                >
                                                    <Text style={styles.detailsButtonText}>Ver escrow</Text>
                                                    <ChevronDown size={14} color={isDark ? '#9CA3AF' : '#666'} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </CardContent>
                            </Card>
                        );
                    })}
                </View>
            </ScrollView>

            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetContent side="bottom" style={[styles.sheetContent, { backgroundColor: isDark ? '#1F2937' : '#fff' }]}>
                    <SheetHeader>
                        <SheetTitle>Filtros</SheetTitle>
                    </SheetHeader>

                    <View style={{ padding: 16, gap: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D1D5DB' : '#374151' }}>
                            Fecha de {activeTab === 'sales' ? 'venta' : 'compra'}
                        </Text>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.purchaseFilterContent}>
                            {([
                                { id: 'all', label: 'Todo' },
                                { id: 'today', label: 'Hoy' },
                                { id: '7d', label: '7d' },
                                { id: '30d', label: '30d' },
                                { id: '90d', label: '90d' },
                                { id: '1y', label: '1 año' },
                                { id: 'custom', label: 'Rango' },
                            ] as const).map((chip) => {
                                const active = datePreset === chip.id;
                                return (
                                    <TouchableOpacity
                                        key={chip.id}
                                        style={[styles.purchaseChip, active && styles.purchaseChipActive]}
                                        onPress={() => {
                                            setDatePreset(chip.id);
                                            if (chip.id !== 'custom') {
                                                setDateFrom('');
                                                setDateTo('');
                                            }
                                        }}
                                    >
                                        <Text style={[styles.purchaseChipText, active && styles.purchaseChipTextActive]}>
                                            {chip.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {datePreset === 'custom' && (
                            <View style={{ gap: 8 }}>
                                <Input
                                    placeholder="Desde (YYYY-MM-DD)"
                                    value={dateFrom}
                                    onChangeText={setDateFrom}
                                    style={{ borderColor: isDark ? '#374151' : '#E5E7EB', color: isDark ? '#F9FAFB' : '#111827' }}
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                />
                                <Input
                                    placeholder="Hasta (YYYY-MM-DD)"
                                    value={dateTo}
                                    onChangeText={setDateTo}
                                    style={{ borderColor: isDark ? '#374151' : '#E5E7EB', color: isDark ? '#F9FAFB' : '#111827' }}
                                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                                />
                                {(dateFrom.trim() && !parseDateInput(dateFrom)) || (dateTo.trim() && !parseDateInput(dateTo)) ? (
                                    <Text style={{ fontSize: 12, color: '#EF4444' }}>
                                        Formato inválido. Usá YYYY-MM-DD (ej: 2026-01-17)
                                    </Text>
                                ) : null}
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                            <Button
                                variant="outline"
                                style={{ flex: 1 }}
                                onPress={() => {
                                    setDatePreset('all');
                                    setDateFrom('');
                                    setDateTo('');
                                    setFiltersOpen(false);
                                }}
                            >
                                <Text style={{ color: isDark ? '#D1D5DB' : '#374151' }}>Limpiar</Text>
                            </Button>
                            <Button
                                style={{ flex: 1, backgroundColor: '#7C3AED' }}
                                onPress={() => setFiltersOpen(false)}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Aplicar</Text>
                            </Button>
                        </View>
                    </View>
                </SheetContent>
            </Sheet>
        </View>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#111827' : '#FAFAFA' },
    searchContainer: { flexDirection: 'row', padding: 16, gap: 8 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#F0F0F0', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    filterBtn: { width: 44, height: 44, paddingHorizontal: 0, backgroundColor: isDark ? '#1F2937' : '#fff', borderColor: isDark ? '#374151' : '#E5E7EB' },
    statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
    statsCard: { flex: 1, borderWidth: 0 },
    statsContent: { padding: 12 },
    statsLabel: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666' },
    statsValue: { fontSize: 20, fontWeight: 'bold' },
    controlsBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
    tabsGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: 18,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    tabBtn: { paddingHorizontal: 12, height: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    tabBtnActive: { backgroundColor: isDark ? '#374151' : '#fff' },
    tabBtnText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '700' },
    tabBtnTextActive: { color: '#7C3AED' },

    // Purchases filter chips (Marketplace-style)
    purchaseFilterScroll: { paddingHorizontal: 16, marginBottom: 16 }, // (kept for backwards compat; no longer used)
    purchaseFilterScrollInline: { flex: 1 },
    purchaseFilterContent: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
    purchaseChip: {
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    purchaseChipActive: { backgroundColor: isDark ? '#374151' : '#fff', borderColor: '#7C3AED' },
    purchaseChipText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '600' },
    purchaseChipTextActive: { color: '#7C3AED' },
    filterActiveDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7C3AED',
        borderWidth: 1,
        borderColor: isDark ? '#1F2937' : '#fff',
    },
    listContainer: { padding: 16, paddingTop: 0 },
    itemCard: { marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#374151' : 'transparent' },
    itemContent: { padding: 12 },
    itemRow: { flexDirection: 'row', gap: 12 },
    imageContainer: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: isDark ? '#374151' : '#eee' },
    itemImage: { width: '100%', height: '100%' },
    iconOverlay: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 8 },
    itemDetails: { flex: 1 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    itemTitle: { fontSize: 14, fontWeight: '600', flex: 1, color: isDark ? '#F9FAFB' : '#000' },
    itemBusiness: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666', marginTop: 2 },
    itemMeta: { fontSize: 11, color: isDark ? '#6B7280' : '#999', marginTop: 2 },
    itemPrice: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginTop: 4 },
    detailsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#f0f0f0' },
    detailsButtonText: { fontSize: 12, color: isDark ? '#9CA3AF' : '#666', marginRight: 4 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: isDark ? '#374151' : '#eee', alignItems: 'center', justifyContent: 'center' },
    actionBtnText: { fontSize: 12, color: isDark ? '#D1D5DB' : '#374151' },

    // Details sheet
    sheetContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { fontSize: 12, fontWeight: '600' },
    detailValue: { fontSize: 12, fontWeight: '800' },
});
