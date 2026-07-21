import React, { useMemo, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
    StatusBar,
    ActivityIndicator,
    RefreshControl,
    useWindowDimensions,
} from 'react-native';
import {
    ShoppingBag,
    TrendingUp,
    Ticket,
    Calendar,
    Filter,
    Search,
    X,
    ChevronDown,
    History,
    ShieldCheck,
    Clock,
    MapPin,
    CreditCard,
    Package,
    Truck,
    CheckCircle,
    AlertCircle,
    MessageSquare,
    ChevronLeft,
    RotateCcw,
} from 'lucide-react-native';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEscrow } from '../contexts/EscrowContext';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Input } from '../components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Radius, colors } from '../theme/tokens';


const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type HistoryTab = 'purchases' | 'sales';
type HistoryKind = 'products' | 'services' | 'bonos' | 'events' | 'other';
type HistoryStatus = 'completed' | 'pending' | 'cancelled';
type HistorySource = 'marketplace_order' | 'fintech_payment' | 'legacy';
type HistoryType = 'purchase' | 'sale' | 'bonus' | 'event';

interface HistoryItem {
    id: string;
    type: HistoryType;
    kind: HistoryKind;
    title: string;
    business: string;
    businessId?: string;
    image: string;
    price?: number;
    location: string;
    date: string;
    status: HistoryStatus;
    backendStatus?: string;
    orderId: string;
    paymentMethod: string;
    quantity?: number;
    source: HistorySource;
    escrowState?: string;
    /** Bono economics (Mis compras) */
    bonoCode?: string;
    paidAmount?: number;
    creditTotal?: number;
    creditRemaining?: number;
    usesTotal?: number;
    usesRemaining?: number;
    validUntil?: string;
}

type PurchaseKindFilter = 'all' | HistoryKind;
type DatePreset = 'all' | 'today' | '7d' | '30d' | '90d' | '1y' | 'custom';

const STATUS_META: Record<HistoryStatus, { label: string; color: string; bg: string; text: string; icon: any }> = {
    completed: { label: 'Exitoso', color: '#10B981', bg: '#D1FAE5', text: '#065F46', icon: CheckCircle },
    pending: { label: 'Pendiente', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E', icon: Clock },
    cancelled: { label: 'Cancelado', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B', icon: AlertCircle },
};

const KIND_META: Record<HistoryKind | 'all', { label: string; icon: any; color: string }> = {
    all: { label: 'Todos', icon: ShoppingBag, color: '#2196F3' },
    products: { label: 'Productos', icon: Package, color: '#4FC3F7' },
    services: { label: 'Servicios', icon: ShoppingBag, color: '#38BDF8' },
    bonos: { label: 'Bonos', icon: Ticket, color: '#3B82F6' },
    events: { label: 'Eventos', icon: Calendar, color: '#F59E0B' },
    other: { label: 'Otros', icon: ShoppingBag, color: '#6B7280' },
};

const TYPE_ICON: Record<HistoryType, any> = {
    purchase: ShoppingBag,
    sale: TrendingUp,
    bonus: Ticket,
    event: Calendar,
};

const ESCROW_META: Record<string, { label: string; color: string }> = {
    held: { label: 'En retención', color: '#D97706' },
    release_scheduled: { label: 'Liberación programada', color: '#2563EB' },
    released: { label: 'Liberado', color: '#059669' },
    disputed: { label: 'En disputa', color: '#DC2626' },
    refunded: { label: 'Reembolsado', color: '#6B7280' },
};

function formatDate(dateString: string | number | Date): string {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function formatShortDate(dateString: string | number | Date): string {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function formatCurrency(n?: number): string {
    if (n === undefined || n === null || Number.isNaN(n)) return '$0,00';
    try {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(Number(n));
    } catch {
        return `$${Number(n).toFixed(2)}`;
    }
}

function SummaryField({
    label,
    value,
    styles,
    valueColor,
    leading,
    last,
}: {
    label: string;
    value: string;
    styles: any;
    valueColor?: string;
    leading?: React.ReactNode;
    last?: boolean;
}) {
    return (
        <View style={[styles.summaryField, last && styles.summaryFieldLast]}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <View style={styles.summaryValueRow}>
                {leading}
                <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>
                    {value}
                </Text>
            </View>
        </View>
    );
}

function parseDateInput(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function detectKindFromListing(listing: any): HistoryKind {
    const t = String(listing?.listingType || listing?.type || '').toLowerCase();
    if (t === 'service') return 'services';
    if (t === 'event') return 'events';
    if (t === 'bono' || t === 'bonus') return 'bonos';
    return 'products';
}

export default function HistoryScreen({ navigation, route }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const styles = getStyles(isDark, insets, width);
    const { show } = useToast();
    const { user, sessionToken } = useAuth();
    const { openEscrow } = useEscrow();

    const [activeTab, setActiveTab] = useState<HistoryTab>(route?.params?.tab || 'purchases');
    const [purchaseKindFilter, setPurchaseKindFilter] = useState<PurchaseKindFilter>(route?.params?.filter || 'all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const [isReleasingEscrow, setIsReleasingEscrow] = useState<Record<string, boolean>>({});

    const authArgs = user?.id && sessionToken ? { sessionToken, userId: user.id } : 'skip';
    const sellerArgs = user?.id && sessionToken ? { sessionToken, sellerId: user.id } : 'skip';
    const orders = useQuery(api.orders.getMyOrders as any, authArgs) || [];
    const mySellerOrders = useQuery(api.orders.getOrdersBySeller as any, sellerArgs) || [];
    const payments = useQuery(api.finance.getPaymentsByUser as any, authArgs) || [];
    const myBonos = useQuery(api.bonos.getMyBonos as any, authArgs) || [];
    const mySellerBonos = useQuery(api.bonos.getBonosBySeller as any, sellerArgs) || [];
    const listings = useQuery(api.listings.getFeed) || [];

    const confirmReceiptMutation = useMutation(api.orders.confirmReceipt);
    const releaseEscrowFunds = useAction(api.stripe.releaseEscrowFunds);

    const loading =
        orders === undefined ||
        mySellerOrders === undefined ||
        payments === undefined ||
        myBonos === undefined ||
        mySellerBonos === undefined ||
        listings === undefined;

    const findListing = useCallback((listingId?: string) => {
        if (!listingId) return undefined;
        return (listings as any[]).find((l: any) => l._id === listingId || l.id === listingId);
    }, [listings]);

    const getOrderStatus = (status?: string): HistoryStatus => {
        if (!status) return 'pending';
        if (status === 'refunded' || status === 'cancelled') return 'cancelled';
        if (status === 'completed' || status === 'delivered') return 'completed';
        return 'pending';
    };

    const getListingImage = (listingId?: string, itemImage?: string, fallback?: string) => {
        if (itemImage && String(itemImage).startsWith('http')) return itemImage;
        const listing = findListing(listingId);
        return (
            listing?.image ||
            listing?.images?.[0]?.url ||
            (typeof listing?.gallery?.[0] === 'string' ? listing.gallery[0] : undefined) ||
            (itemImage && String(itemImage).length > 0 ? itemImage : undefined) ||
            fallback
        );
    };

    const purchaseOrderItems: HistoryItem[] = useMemo(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return (orders as any[]).map((order: any) => {
            const firstItem = order.items?.[0];
            const listing = findListing(firstItem?.listingId);
            const kind = detectKindFromListing(listing);
            const status = getOrderStatus(order.status);
            return {
                id: `purchase-${order._id}`,
                type: 'purchase',
                kind,
                title: firstItem?.title ?? 'Compra Marketplace',
                business: listing?.seller?.name || `Vendedor ${String(order.sellerId).slice(-6).toUpperCase()}`,
                businessId: order.sellerId,
                image: getListingImage(firstItem?.listingId, firstItem?.image, fallbackImage),
                price: order.total || 0,
                location: order.shipping?.address?.city ?? order.shipping?.address?.country ?? 'A coordinar',
                date: order.createdAt,
                status,
                backendStatus: order.status,
                orderId: order._id,
                paymentMethod: 'Marketplace (escrow)',
                quantity: order.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
                source: 'marketplace_order',
                escrowState: order.escrowState || order.escrow?.state,
            };
        });
    }, [orders, findListing]);

    const salesOrderItems: HistoryItem[] = useMemo(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return (mySellerOrders as any[])
            .filter((order: any) => {
                if (!user) return false;
                if (user.role !== 'consumer' && user.role !== 'influencer') return true;
                const firstItem = order.items?.[0];
                const listing = findListing(firstItem?.listingId);
                const t = String(listing?.listingType || listing?.type || '').toLowerCase();
                return t !== 'event';
            })
            .map((order: any) => {
                const firstItem = order.items?.[0];
                const listing = findListing(firstItem?.listingId);
                const kind = detectKindFromListing(listing);
                const status = getOrderStatus(order.status);
                return {
                    id: `sale-${order._id}`,
                    type: 'sale',
                    kind,
                    title: firstItem?.title ?? 'Venta Marketplace',
                    business: `Cliente ${String(order.userId).slice(-6).toUpperCase()}`,
                    businessId: order.userId,
                    image: getListingImage(firstItem?.listingId, firstItem?.image, fallbackImage),
                    price: order.total || 0,
                    location: order.shipping?.address?.city ?? order.shipping?.address?.country ?? 'A coordinar',
                    date: order.createdAt,
                    status,
                    backendStatus: order.status,
                    orderId: order._id,
                    paymentMethod: 'Marketplace (escrow)',
                    quantity: order.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
                    source: 'marketplace_order',
                    escrowState: order.escrowState || order.escrow?.state,
                };
            });
    }, [mySellerOrders, findListing, user]);

    const fintechItems: HistoryItem[] = useMemo(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop';
        return (payments as any[]).map((payment: any) => {
            const status: HistoryStatus =
                payment.status === 'succeeded' ? 'completed' :
                payment.status === 'processing' ? 'pending' : 'cancelled';
            return {
                id: `fintech-${payment.id || payment._id}`,
                type: 'purchase',
                kind: 'products',
                title: payment.description ?? 'Compra Ramgos',
                business: payment.split?.sellerId ?? 'Ramgos',
                image: payment.metadata?.image || fallbackImage,
                price: payment.amount,
                location: payment.metadata?.location || 'Online',
                date: payment.createdAt,
                status,
                orderId: payment.metadata?.orderId || payment.id,
                paymentMethod: payment.method?.brand
                    ? `${payment.method.brand} •••• ${payment.method.last4 ?? '****'}`
                    : 'Stripe',
                quantity: payment.metadata?.quantity ? Number(payment.metadata.quantity) : undefined,
                source: 'fintech_payment',
            };
        });
    }, [payments]);

    const bonoPurchaseItems: HistoryItem[] = useMemo(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop';
        return (myBonos as any[]).map((bono: any) => {
            const isRedeemed = bono.status === 'redeemed';
            const isExpired = bono.status === 'expired';
            const status: HistoryStatus = isRedeemed ? 'completed' : isExpired ? 'cancelled' : 'pending';
            const businessName = bono.seller?.name || bono.seller?.nickname || 'Negocio Asociado';
            const paidAmount = Number(bono.paidAmount ?? bono.listing?.price ?? 50);
            const creditTotal = Number(bono.creditTotal ?? bono.listing?.discountValue ?? 100);
            const creditRemaining = Number(
                bono.creditRemaining ?? (status === 'pending' ? creditTotal : 0)
            );
            const usesTotal = Number(bono.usesTotal ?? 1);
            const usesRemaining = Number(
                bono.usesRemaining ?? (status === 'pending' ? usesTotal : 0)
            );
            return {
                id: `bono-${bono._id}`,
                type: 'bonus' as const,
                kind: 'bonos' as const,
                title: bono.listing?.title || 'Bono Digital',
                business: businessName,
                businessId: bono.sellerId,
                image: bono.listing?.image || fallbackImage,
                price: paidAmount,
                location: 'Bono Digital',
                date: bono.createdAt,
                status,
                orderId: bono.bonoCode,
                paymentMethod: 'Bono digital',
                quantity: 1,
                source: 'marketplace_order' as const,
                bonoCode: bono.bonoCode,
                paidAmount,
                creditTotal,
                creditRemaining,
                usesTotal,
                usesRemaining,
                validUntil: bono.validUntil,
            };
        });
    }, [myBonos]);

    const bonoSaleItems: HistoryItem[] = useMemo(() => {
        const fallbackImage = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop';
        return (mySellerBonos as any[]).map((bono: any) => {
            const isRedeemed = bono.status === 'redeemed';
            const isExpired = bono.status === 'expired';
            const status: HistoryStatus = isRedeemed ? 'completed' : isExpired ? 'cancelled' : 'pending';
            const buyerName = bono.buyer?.name || bono.buyer?.nickname || 'Cliente';
            return {
                id: `bono-sale-${bono._id}`,
                type: 'bonus',
                kind: 'bonos',
                title: bono.listing?.title || 'Bono Digital',
                business: `Canjea: ${buyerName} • Cod: ${bono.bonoCode}`,
                businessId: bono.buyerId,
                image: bono.listing?.image || fallbackImage,
                price: bono.listing?.price ?? 0,
                location: 'Digital',
                date: bono.createdAt,
                status,
                orderId: bono.bonoCode,
                paymentMethod: 'Voucher Emitido',
                quantity: 1,
                source: 'marketplace_order',
            };
        });
    }, [mySellerBonos]);

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
            datePreset === '1y' ? 365 : 0;
        start.setDate(start.getDate() - days);
        return { from: start, to: end };
    }, [datePreset, dateFrom, dateTo]);

    const activeDateFilter =
        datePreset !== 'all' &&
        (datePreset !== 'custom' || !!parseDateInput(dateFrom) || !!parseDateInput(dateTo));

    const allItems = useMemo(() => {
        // ponytail: skip fintech payments that belong to a marketplace order (prevents duplicates)
        const orderIds = new Set(purchaseOrderItems.map(o => o.orderId));
        const standalonePayments = fintechItems.filter(f => !orderIds.has(f.orderId));
        const purchases = [...purchaseOrderItems, ...standalonePayments, ...bonoPurchaseItems];
        const sales = [...salesOrderItems, ...bonoSaleItems];
        const combined = activeTab === 'sales' ? sales : purchases;
        return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeTab, purchaseOrderItems, salesOrderItems, fintechItems, bonoPurchaseItems, bonoSaleItems]);

    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allItems.filter((item) => {
            const matchesSearch =
                !q ||
                item.title.toLowerCase().includes(q) ||
                item.business.toLowerCase().includes(q) ||
                String(item.orderId).toLowerCase().includes(q);
            const matchesKind = activeTab !== 'purchases' || purchaseKindFilter === 'all' || item.kind === purchaseKindFilter;
            const itemTime = new Date(item.date).getTime();
            const matchesDate =
                !activeDateFilter ||
                (!Number.isNaN(itemTime) &&
                    (!dateRange.from || itemTime >= dateRange.from.getTime()) &&
                    (!dateRange.to || itemTime <= dateRange.to.getTime()));
            return matchesSearch && matchesKind && matchesDate;
        });
    }, [allItems, searchQuery, activeTab, purchaseKindFilter, activeDateFilter, dateRange]);

    const stats = useMemo(() => {
        const relevant = activeTab === 'sales' ? salesOrderItems : [...purchaseOrderItems, ...fintechItems, ...bonoPurchaseItems];
        const completed = relevant.filter((i) => i.status === 'completed');
        const total = completed.reduce((sum, i) => sum + (i.price || 0), 0);
        const pendingCount = relevant.filter((i) => i.status === 'pending').length;
        return {
            count: relevant.length,
            total,
            pendingCount,
        };
    }, [activeTab, purchaseOrderItems, salesOrderItems, fintechItems, bonoPurchaseItems]);

    const handleReleaseEscrow = async (orderId: string) => {
        if (!user?.id) {
            show('Sesión no válida. Iniciá sesión nuevamente.', 'error');
            return;
        }
        setIsReleasingEscrow((prev) => ({ ...prev, [orderId]: true }));
        try {
            await releaseEscrowFunds({ orderId: orderId as any, sessionToken, userId: user.id });
            show('Pago liberado exitosamente al vendedor.', 'success');
        } catch (e: any) {
            show(e.message || 'Error al liberar el pago.', 'error');
        } finally {
            setIsReleasingEscrow((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleConfirmReceipt = (item: HistoryItem) => {
        if (!item.orderId) {
            show('No encontramos información de la orden', 'error');
            return;
        }
        if (!user?.id) {
            show('Sesión no válida. Iniciá sesión nuevamente.', 'error');
            return;
        }
        confirmReceiptMutation({ orderId: item.orderId as any, sessionToken, userId: user.id })
            .then(() => show('Entrega confirmada. El pago se liberará al vendedor', 'success'))
            .catch((err: any) => show(err.message ?? 'No pudimos confirmar la entrega', 'error'));
    };

    const handleDispute = (item: HistoryItem) => {
        setSelectedItem(null);
        const role = activeTab === 'sales' ? 'seller' : 'buyer';
        const alreadyDisputed =
            item.escrowState === 'disputed' ||
            item.backendStatus === 'disputed';
        // Si ya hay disputa → detalles; si no → formulario. Chat siempre con ← volver.
        openEscrow(item.orderId, role, { phase: alreadyDisputed ? 'status' : 'dispute_init' });
    };

    const handleUseBono = (item: HistoryItem) => {
        navigation.navigate('BonusQR', {
            bonusId: item.orderId,
            businessName: item.business,
            bonoCode: item.bonoCode || item.orderId,
            paidAmount: item.paidAmount ?? item.price ?? 50,
            creditTotal: item.creditTotal ?? 100,
            creditRemaining: item.creditRemaining ?? item.creditTotal ?? 100,
            usesTotal: item.usesTotal ?? 1,
            usesRemaining: item.usesRemaining ?? 1,
            bonoTitle: item.title,
            validUntil: item.validUntil,
        });
    };

    const handleOpenEscrow = (item: HistoryItem) => {
        setSelectedItem(null);
        const role = activeTab === 'sales' ? 'seller' : 'buyer';
        // Detalles de compra primero; el chat se abre desde el sheet
        openEscrow(item.orderId, role, { phase: 'status' });
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const clearFilters = () => {
        setDatePreset('all');
        setDateFrom('');
        setDateTo('');
        setPurchaseKindFilter('all');
        setSearchQuery('');
    };

    const scrollY = useSharedValue(0);
    const headerOpacity = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [60, 120], [0, 1], Extrapolation.CLAMP),
    }));

    const kindChips: { id: PurchaseKindFilter; label: string; icon: any }[] = [
        { id: 'all', label: 'Todos', icon: ShoppingBag },
        { id: 'products', label: 'Productos', icon: Package },
        { id: 'services', label: 'Servicios', icon: ShoppingBag },
        { id: 'bonos', label: 'Bonos', icon: Ticket },
        { id: 'events', label: 'Eventos', icon: Calendar },
    ];

    const renderHeader = () => (
        <View style={styles.headerWrapper}>
            <View style={styles.hero}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
                        <ChevronLeft size={24} color={isDark ? '#FFF' : '#111827'} />
                    </TouchableOpacity>
                    <View style={styles.headerTitles}>
                        <Text style={styles.headerTitle}>Mis compras</Text>
                        <Text style={styles.headerSubtitle}>{filteredItems.length} transacciones</Text>
                    </View>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setFiltersOpen(true)} activeOpacity={0.8}>
                        <View style={{ position: 'relative' }}>
                            <Filter size={20} color={isDark ? '#FFF' : '#111827'} />
                            {activeDateFilter && <View style={styles.filterDot} />}
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchBar}>
                    <Search size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Input
                        placeholder="Buscar compras, ventas o códigos..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={styles.searchInput}
                        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Sticky header backdrop */}
            <Animated.View style={[styles.stickyHeader, headerOpacity]} pointerEvents="none">
                <AnimatedBlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={StyleSheet.absoluteFill} />
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <Text style={styles.stickyTitle}>Mis compras</Text>
                </View>
            </Animated.View>
        </View>
    );

    const renderStats = () => (
        <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5' }]}>
                <View style={styles.statIconWrap}>
                    <ShoppingBag size={18} color="#10B981" />
                </View>
                <Text style={[styles.statValue, { color: '#10B981' }]}>{formatCurrency(stats.total)}</Text>
                <Text style={styles.statLabel}>{activeTab === 'sales' ? 'Total vendido' : 'Total gastado'}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(33, 150, 243, 0.12)' : '#FAFAFA' }]}>
                <View style={[styles.statIconWrap, { backgroundColor: isDark ? 'rgba(33, 150, 243, 0.2)' : '#EDE9FE' }]}>
                    <History size={18} color="#2196F3" />
                </View>
                <Text style={[styles.statValue, { color: '#2196F3' }]}>{stats.count}</Text>
                <Text style={styles.statLabel}>Transacciones</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB' }]}>
                <View style={[styles.statIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
                    <Clock size={18} color="#F59E0B" />
                </View>
                <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pendingCount}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
            </View>
        </View>
    );

    const renderTabs = () => (
        <View style={styles.controlsBar}>
            <View style={styles.tabPill}>
                <TouchableOpacity
                    style={[styles.tabPillBtn, activeTab === 'purchases' && styles.tabPillBtnActive]}
                    onPress={() => {
                        setActiveTab('purchases');
                        setPurchaseKindFilter('all');
                    }}
                >
                    <ShoppingBag size={16} color={activeTab === 'purchases' ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={[styles.tabPillText, activeTab === 'purchases' && styles.tabPillTextActive]}>Compras</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabPillBtn, activeTab === 'sales' && styles.tabPillBtnActive]}
                    onPress={() => setActiveTab('sales')}
                >
                    <TrendingUp size={16} color={activeTab === 'sales' ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'} />
                    <Text style={[styles.tabPillText, activeTab === 'sales' && styles.tabPillTextActive]}>Ventas</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderKindChips = () => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll} nestedScrollEnabled>
            {kindChips.map((chip) => {
                const active = purchaseKindFilter === chip.id;
                const Icon = chip.icon;
                return (
                    <TouchableOpacity
                        key={chip.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setPurchaseKindFilter(chip.id)}
                    >
                        <Icon size={14} color={active ? '#fff' : isDark ? '#9CA3AF' : '#6B7280'} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );

    const renderItem = (item: HistoryItem, index: number) => {
        const meta = STATUS_META[item.status];
        const StatusIcon = meta.icon;
        const TypeIcon = TYPE_ICON[item.type];
        const isBono = item.kind === 'bonos' && item.type === 'bonus';
        const canUseBono = isBono && activeTab === 'purchases' && item.status === 'pending';
        const canConfirm = activeTab === 'purchases' && item.backendStatus === 'paid_escrow';
        const creditRemaining = item.creditRemaining ?? 0;
        const creditTotal = item.creditTotal ?? 100;
        const usesRemaining = item.usesRemaining ?? 0;
        const usesTotal = item.usesTotal ?? 1;
        const codeLabel = item.bonoCode || item.orderId;

        // Dedicated bono purchase card — code + credit + Ver QR
        if (isBono && activeTab === 'purchases') {
            return (
                <View key={item.id || `history-${index}`} style={[styles.itemCard, styles.bonoCard]}>
                    <View style={styles.itemRow}>
                        <View style={[styles.imageWrap, styles.bonoThumb]}>
                            <Ticket size={28} color="#2196F3" />
                        </View>
                        <View style={styles.itemBody}>
                            <View style={styles.itemTopRow}>
                                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: isDark ? `${meta.color}30` : meta.bg }]}>
                                    <StatusIcon size={10} color={isDark ? meta.color : meta.text} />
                                    <Text style={[styles.statusText, { color: isDark ? meta.color : meta.text }]}>
                                        {item.status === 'completed' ? 'Canjeado' : item.status === 'pending' ? 'Disponible' : 'Vencido'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.itemBusiness}>{item.business}</Text>
                            <Text style={styles.itemMeta}>
                                Pagaste {formatCurrency(item.paidAmount ?? item.price)} · Crédito {formatCurrency(creditTotal)}
                                {item.validUntil ? ` · Vence ${formatShortDate(item.validUntil)}` : ''}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.bonoStatsRow}>
                        <View style={styles.bonoStat}>
                            <Text style={styles.bonoStatLabel}>Crédito disponible</Text>
                            <Text style={styles.bonoStatValue}>
                                {formatCurrency(creditRemaining)}
                                <Text style={styles.bonoStatHint}> / {formatCurrency(creditTotal)}</Text>
                            </Text>
                        </View>
                        <View style={styles.bonoStatDivider} />
                        <View style={styles.bonoStat}>
                            <Text style={styles.bonoStatLabel}>Usos</Text>
                            <Text style={styles.bonoStatValue}>
                                {usesRemaining}
                                <Text style={styles.bonoStatHint}> / {usesTotal}</Text>
                            </Text>
                        </View>
                    </View>

                    <View style={styles.bonoCodeBlock}>
                        <Text style={styles.bonoCodeLabel}>Código</Text>
                        <Text style={styles.bonoCodeText} selectable numberOfLines={1}>
                            {codeLabel}
                        </Text>
                    </View>

                    {canUseBono ? (
                        <TouchableOpacity
                            style={styles.bonoQrBtn}
                            onPress={() => handleUseBono(item)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Ver código QR del bono"
                        >
                            <Ticket size={16} color="#fff" />
                            <Text style={styles.bonoQrBtnText}>Ver QR</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.detailBtn} onPress={() => setSelectedItem(item)} activeOpacity={0.8}>
                            <Text style={styles.detailBtnText}>Ver detalle</Text>
                            <ChevronDown size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </TouchableOpacity>
                    )}
                </View>
            );
        }

        return (
            <TouchableOpacity
                key={item.id || `history-${index}`}
                style={styles.itemCard}
                activeOpacity={1}
                onPress={() => setSelectedItem(item)}
            >
                <View style={styles.itemRow}>
                    <View style={styles.imageWrap}>
                        <ImageWithFallback src={item.image} style={styles.itemImage} />
                        <View style={styles.typeBadge}>
                            <TypeIcon size={12} color="#fff" />
                        </View>
                    </View>

                    <View style={styles.itemBody}>
                        <View style={styles.itemTopRow}>
                            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: isDark ? `${meta.color}30` : meta.bg }]}>
                                <StatusIcon size={10} color={isDark ? meta.color : meta.text} />
                                <Text style={[styles.statusText, { color: isDark ? meta.color : meta.text }]}>
                                    {item.status === 'completed' ? 'Exitoso' : item.status === 'pending' ? 'Pendiente' : 'Cancelado'}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.itemBusiness}>{item.business}</Text>
                        <Text style={styles.itemMeta}>{formatShortDate(item.date)} • {item.paymentMethod}</Text>

                        <View style={styles.itemFooter}>
                            <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                            {canConfirm && (
                                <TouchableOpacity
                                    style={styles.confirmBtn}
                                    onPress={(e) => { e.stopPropagation(); handleReleaseEscrow(item.orderId); }}
                                    disabled={isReleasingEscrow[item.orderId]}
                                >
                                    {isReleasingEscrow[item.orderId] ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.confirmBtnText}>Confirmar</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>

                {!canConfirm && (
                    <TouchableOpacity style={styles.detailBtn} onPress={() => setSelectedItem(item)} activeOpacity={0.8}>
                        <Text style={styles.detailBtnText}>Ver detalle</Text>
                        <ChevronDown size={14} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    const renderDetailSheet = () => {
        if (!selectedItem) return null;
        const meta = STATUS_META[selectedItem.status];
        const StatusIcon = meta.icon;
        const isBono = selectedItem.kind === 'bonos' && selectedItem.type === 'bonus';
        const canConfirm = activeTab === 'purchases' && selectedItem.backendStatus === 'paid_escrow';
        const escrowMeta = selectedItem.escrowState ? ESCROW_META[selectedItem.escrowState] : null;

        return (
            <Sheet open={!!selectedItem} onOpenChange={(open: boolean) => { if (!open) setSelectedItem(null); }}>
                <SheetContent side="bottom" style={[styles.detailSheet, { backgroundColor: colors(isDark).glass }]}>
                    <View style={styles.detailHandle} />
                    <View style={styles.detailHeader}>
                        <View>
                            <Text style={styles.detailTitle}>Detalle de transacción</Text>
                            <Text style={styles.detailSubtitle}>#{String(selectedItem.orderId).slice(-6).toUpperCase()}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.detailCloseBtn}>
                            <X size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
                        {/* Hero status */}
                        <View style={[styles.detailHero, { backgroundColor: isDark ? `${meta.color}18` : meta.bg }]}>
                            <View style={[styles.detailHeroIcon, { borderColor: meta.color }]}>
                                <StatusIcon size={28} color={meta.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.detailHeroTitle}>
                                    {selectedItem.status === 'completed' ? 'Transacción exitosa' : selectedItem.status === 'pending' ? 'En progreso' : 'Cancelada'}
                                </Text>
                                <Text style={styles.detailHeroSubtitle}>
                                    {selectedItem.type === 'purchase' ? 'Compra' : selectedItem.type === 'sale' ? 'Venta' : selectedItem.type === 'bonus' ? 'Bono' : 'Evento'} • {selectedItem.paymentMethod}
                                </Text>
                            </View>
                            <View style={[styles.detailHeroBadge, { backgroundColor: isDark ? `${meta.color}28` : meta.bg, borderColor: meta.color }]}>
                                <Text style={[styles.detailHeroBadgeText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                            </View>
                        </View>

                        {/* Product image */}
                        <View style={styles.detailImageWrap}>
                            <ImageWithFallback src={selectedItem.image} style={styles.detailImage} />
                            <View style={styles.detailImageOverlay}>
                                <Text style={styles.detailImageTitle} numberOfLines={1}>{selectedItem.title}</Text>
                                <Text style={styles.detailImagePrice}>{isBono && selectedItem.price === 0 ? 'GRATIS' : formatCurrency(selectedItem.price)}</Text>
                            </View>
                        </View>

                        {/* Summary — always stacked (no letter-break from horizontal flex) */}
                        <View style={styles.summaryCard}>
                            {Platform.OS !== 'web' ? (
                                <BlurView
                                    intensity={isDark ? 40 : 60}
                                    tint={isDark ? 'dark' : 'light'}
                                    style={StyleSheet.absoluteFill}
                                />
                            ) : (
                                <View style={[StyleSheet.absoluteFill, styles.summaryCardWebBg]} />
                            )}
                            <View style={styles.summaryCardInner}>
                                <View style={styles.summaryHeader}>
                                    <Text style={styles.summaryTitle}>Resumen</Text>
                                    {escrowMeta ? (
                                        <View style={[styles.summaryChip, { borderColor: escrowMeta.color, backgroundColor: `${escrowMeta.color}22` }]}>
                                            <ShieldCheck size={12} color={escrowMeta.color} />
                                            <Text style={[styles.summaryChipText, { color: escrowMeta.color }]} numberOfLines={1}>
                                                {escrowMeta.label}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>

                                <SummaryField label="Producto / servicio" value={selectedItem.title} styles={styles} />
                                <SummaryField
                                    label={selectedItem.type === 'sale' ? 'Comprador' : 'Vendedor'}
                                    value={selectedItem.business}
                                    styles={styles}
                                />
                                <SummaryField label="Fecha" value={formatDate(selectedItem.date)} styles={styles} />
                                <SummaryField label="Cantidad" value={String(selectedItem.quantity ?? 1)} styles={styles} />
                                <SummaryField label="Método de pago" value={selectedItem.paymentMethod} styles={styles} />
                                {isBono && !!selectedItem.bonoCode && (
                                    <SummaryField
                                        label="Código del bono"
                                        value={selectedItem.bonoCode}
                                        styles={styles}
                                    />
                                )}
                                {isBono && (
                                    <SummaryField
                                        label="Crédito disponible"
                                        value={`${formatCurrency(selectedItem.creditRemaining ?? 0)} de ${formatCurrency(selectedItem.creditTotal ?? 100)}`}
                                        styles={styles}
                                        valueColor="#10B981"
                                    />
                                )}
                                {isBono && (
                                    <SummaryField
                                        label="Usos restantes"
                                        value={`${selectedItem.usesRemaining ?? 0} / ${selectedItem.usesTotal ?? 1}`}
                                        styles={styles}
                                    />
                                )}
                                {!!selectedItem.location && !isBono && (
                                    <SummaryField
                                        label="Ubicación"
                                        value={selectedItem.location}
                                        styles={styles}
                                        leading={<MapPin size={14} color={isDark ? '#A1A1AA' : '#6B7280'} />}
                                        last={!escrowMeta}
                                    />
                                )}

                                <View style={styles.summaryTotalBar}>
                                    <Text style={styles.summaryTotalLabel}>{isBono ? 'Pagaste' : 'Total'}</Text>
                                    <Text style={styles.summaryTotalValue}>
                                        {isBono && selectedItem.price === 0 ? 'GRATIS' : formatCurrency(selectedItem.price)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Actions */}
                        <View style={styles.detailCard}>
                            <Text style={[styles.detailSectionTitle, { marginBottom: 14 }]}>Acciones</Text>
                            <View style={styles.detailActions}>
                                {canConfirm && (
                                    <TouchableOpacity
                                        style={[styles.detailActionBtn, styles.detailActionPrimary]}
                                        onPress={() => { setSelectedItem(null); handleReleaseEscrow(selectedItem.orderId); }}
                                        disabled={isReleasingEscrow[selectedItem.orderId]}
                                    >
                                        {isReleasingEscrow[selectedItem.orderId] ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <>
                                                <CheckCircle size={16} color="#fff" />
                                                <Text style={styles.detailActionPrimaryText}>Confirmar Recepción</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                                {(selectedItem.kind === 'products' || selectedItem.kind === 'services') && selectedItem.source === 'marketplace_order' && (
                                    <TouchableOpacity
                                        style={[styles.detailActionBtn, styles.detailActionSecondary]}
                                        onPress={() => handleOpenEscrow(selectedItem)}
                                    >
                                        <ShieldCheck size={16} color={isDark ? '#F9FAFB' : '#111827'} />
                                        <Text style={styles.detailActionSecondaryText}>Ver escrow</Text>
                                    </TouchableOpacity>
                                )}
                                {activeTab === 'purchases' && selectedItem.source === 'marketplace_order' && (
                                    <TouchableOpacity
                                        style={[styles.detailActionBtn, styles.detailActionSecondary]}
                                        onPress={() => handleDispute(selectedItem)}
                                    >
                                        <AlertCircle size={16} color={isDark ? '#F9FAFB' : '#111827'} />
                                        <Text style={styles.detailActionSecondaryText}>Iniciar disputa</Text>
                                    </TouchableOpacity>
                                )}
                                {isBono && activeTab === 'purchases' && selectedItem.status === 'pending' && (
                                    <TouchableOpacity
                                        style={[styles.detailActionBtn, styles.detailActionPrimary]}
                                        onPress={() => { setSelectedItem(null); handleUseBono(selectedItem); }}
                                    >
                                        <Ticket size={16} color="#fff" />
                                        <Text style={styles.detailActionPrimaryText}>Ver QR y código</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </ScrollView>
                </SheetContent>
            </Sheet>
        );
    };

    const renderFiltersSheet = () => (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent side="bottom" style={[styles.filterSheet, { backgroundColor: colors(isDark).glass }]}>
                <SheetHeader>
                    <SheetTitle style={{ color: colors(isDark).text }}>Filtros</SheetTitle>
                </SheetHeader>
                <View style={styles.filterBody}>
                    <Text style={styles.filterLabel}>Fecha de {activeTab === 'sales' ? 'venta' : 'compra'}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsScroll} nestedScrollEnabled>
                        {([
                            { id: 'all', label: 'Todo' },
                            { id: 'today', label: 'Hoy' },
                            { id: '7d', label: '7 días' },
                            { id: '30d', label: '30 días' },
                            { id: '90d', label: '90 días' },
                            { id: '1y', label: '1 año' },
                            { id: 'custom', label: 'Rango' },
                        ] as const).map((chip) => {
                            const active = datePreset === chip.id;
                            return (
                                <TouchableOpacity
                                    key={chip.id}
                                    style={[styles.filterChip, active && styles.filterChipActive]}
                                    onPress={() => {
                                        setDatePreset(chip.id);
                                        if (chip.id !== 'custom') { setDateFrom(''); setDateTo(''); }
                                    }}
                                >
                                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{chip.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {datePreset === 'custom' && (
                        <View style={styles.customDateWrap}>
                            <Input
                                placeholder="Desde (YYYY-MM-DD)"
                                value={dateFrom}
                                onChangeText={setDateFrom}
                                style={styles.dateInput}
                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            />
                            <Input
                                placeholder="Hasta (YYYY-MM-DD)"
                                value={dateTo}
                                onChangeText={setDateTo}
                                style={styles.dateInput}
                                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                            />
                            {(dateFrom.trim() && !parseDateInput(dateFrom)) || (dateTo.trim() && !parseDateInput(dateTo)) ? (
                                <Text style={styles.dateError}>Formato inválido. Usá YYYY-MM-DD</Text>
                            ) : null}
                        </View>
                    )}

                    <View style={styles.filterFooter}>
                        <TouchableOpacity style={styles.filterClearBtn} onPress={() => { clearFilters(); setFiltersOpen(false); }}>
                            <RotateCcw size={16} color={isDark ? '#D1D5DB' : '#374151'} />
                            <Text style={styles.filterClearText}>Limpiar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.filterApplyBtn} onPress={() => setFiltersOpen(false)}>
                            <Text style={styles.filterApplyText}>Aplicar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SheetContent>
        </Sheet>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Cargando historial...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            {renderHeader()}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#111827'} />}
                onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
            >
                {renderStats()}
                {renderTabs()}
                {activeTab === 'purchases' && renderKindChips()}

                <View style={styles.listSection}>
                    <View style={styles.listHeader}>
                        <Text style={styles.listTitle}>Historial</Text>
                        <Text style={styles.listCount}>{filteredItems.length} resultados</Text>
                    </View>

                    {filteredItems.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <History size={48} color={isDark ? '#374151' : '#E5E7EB'} />
                            <Text style={styles.emptyTitle}>Sin transacciones</Text>
                            <Text style={styles.emptyText}>No encontramos movimientos con los filtros actuales.</Text>
                            <TouchableOpacity style={styles.emptyClearBtn} onPress={clearFilters}>
                                <Text style={styles.emptyClearText}>Limpiar filtros</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        filteredItems.map((item, index) => renderItem(item, index))
                    )}
                </View>
            </ScrollView>

            {renderDetailSheet()}
            {renderFiltersSheet()}
        </View>
    );
}

function getStyles(isDark: boolean, insets: any, width: number) {
    const bg = isDark ? '#09090B' : '#FAFAFA';
    const surface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
    const text = isDark ? '#FAFAFA' : '#111827';
    const muted = isDark ? '#A1A1AA' : '#6B7280';
    const border = isDark ? '#27272A' : '#E5E7EB';
    const primary = '#2196F3';
    const isNarrow = width < 390;
    const sheetPad = width < 360 ? 12 : width < 768 ? 16 : 24;

    return StyleSheet.create({
        container: { flex: 1, backgroundColor: bg },
        loadingContainer: { flex: 1, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', gap: 16 },
        loadingText: { color: muted, fontSize: 15, fontWeight: '500' },

        headerWrapper: { zIndex: 50 },
        hero: {
            backgroundColor: colors(isDark).bg,
            paddingHorizontal: 16,
            paddingTop: insets.top + 12,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: border,
        },
        headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
        iconBtn: {
            width: 42,
            height: 42,
            borderRadius: Radius.xl,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
        },
        headerTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
        headerTitle: { fontSize: 18, fontWeight: '800', color: text },
        headerSubtitle: { fontSize: 13, color: muted, marginTop: 2 },
        filterDot: {
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: Radius.sm,
            backgroundColor: primary,
            borderWidth: 1,
            borderColor: isDark ? '#09090B' : '#FAFAFA',
        },

        stickyHeader: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 56,
            overflow: 'hidden',
        },
        stickyHeaderContent: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 60,
        },
        stickyTitle: { fontSize: 17, fontWeight: '800', color: text },

        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.md,
            paddingHorizontal: 14,
            height: 48,
            gap: 10,
        },
        searchInput: {
            flex: 1,
            borderWidth: 0,
            color: text,
            fontSize: 15,
            backgroundColor: 'transparent',
            paddingHorizontal: 0,
        },

        scroll: { flex: 1 },
        scrollContent: { paddingBottom: 32 },

        statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 16, marginBottom: 18 },
        statCard: {
            flex: 1,
            borderRadius: Radius.lg,
            padding: 14,
            alignItems: 'flex-start',
            borderWidth: 1,
            borderColor: border,
        },
        statIconWrap: {
            width: 36,
            height: 36,
            borderRadius: Radius.md,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
            marginBottom: 10,
        },
        statValue: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
        statLabel: { fontSize: 11, color: muted, fontWeight: '600' },

        controlsBar: { paddingHorizontal: 16, marginBottom: 12 },
        tabPill: {
            flexDirection: 'row',
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.lg,
            padding: 4,
            borderWidth: 1,
            borderColor: border,
        },
        tabPillBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: Radius.md,
        },
        tabPillBtnActive: { backgroundColor: primary },
        tabPillText: { fontSize: 14, fontWeight: '700', color: muted },
        tabPillTextActive: { color: '#fff' },

        chipsScroll: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: Radius.xl,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
            marginRight: 8,
        },
        chipActive: { backgroundColor: primary, borderColor: primary },
        chipText: { fontSize: 13, fontWeight: '600', color: muted },
        chipTextActive: { color: '#fff' },

        listSection: { paddingHorizontal: 16, marginTop: 8 },
        listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        listTitle: { fontSize: 18, fontWeight: '800', color: text },
        listCount: { fontSize: 13, color: muted, fontWeight: '500' },

        emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
        emptyTitle: { fontSize: 17, fontWeight: '700', color: text },
        emptyText: { fontSize: 14, color: muted, textAlign: 'center' },
        emptyClearBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: primary },
        emptyClearText: { color: '#fff', fontWeight: '700', fontSize: 14 },

        itemCard: {
            backgroundColor: surface,
            borderRadius: Radius.lg,
            padding: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: border,
        },
        itemRow: { flexDirection: 'row', gap: 14 },
        imageWrap: { width: 76, height: 76, borderRadius: Radius.md, overflow: 'hidden', position: 'relative', backgroundColor: border },
        itemImage: { width: '100%', height: '100%' },
        typeBadge: {
            position: 'absolute',
            top: 6,
            left: 6,
            backgroundColor: 'rgba(0,0,0,0.6)',
            padding: 4,
            borderRadius: Radius.sm,
        },
        itemBody: { flex: 1, justifyContent: 'space-between' },
        itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
        itemTitle: { fontSize: 15, fontWeight: '700', color: text, flex: 1 },
        statusBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Radius.md,
        },
        statusText: { fontSize: 10, fontWeight: '800' },
        itemBusiness: { fontSize: 13, color: muted, marginTop: 3 },
        itemMeta: { fontSize: 11, color: isDark ? '#6B7280' : '#9CA3AF', marginTop: 2 },
        itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
        itemPrice: { fontSize: 17, fontWeight: '800', color: '#10B981' },
        confirmBtn: {
            backgroundColor: primary,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: Radius.md,
        },
        confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
        detailBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: border,
            gap: 4,
        },
        detailBtnText: { fontSize: 13, color: muted, fontWeight: '600' },
        bonoCard: {
            borderColor: isDark ? 'rgba(33, 150, 243,0.35)' : 'rgba(33, 150, 243,0.18)',
        },
        bonoThumb: {
            backgroundColor: isDark ? 'rgba(33, 150, 243,0.18)' : 'rgba(33, 150, 243,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        bonoStatsRow: {
            flexDirection: 'row',
            alignItems: 'stretch',
            marginTop: 14,
            paddingVertical: 12,
            paddingHorizontal: 4,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(9,9,11,0.03)',
        },
        bonoStat: { flex: 1, paddingHorizontal: 12 },
        bonoStatDivider: {
            width: StyleSheet.hairlineWidth,
            backgroundColor: border,
        },
        bonoStatLabel: {
            fontSize: 11,
            fontWeight: '600',
            color: muted,
            marginBottom: 4,
            letterSpacing: 0.2,
        },
        bonoStatValue: {
            fontSize: 16,
            fontWeight: '800',
            color: text,
        },
        bonoStatHint: {
            fontSize: 12,
            fontWeight: '600',
            color: muted,
        },
        bonoCodeBlock: {
            marginTop: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: border,
            borderStyle: 'dashed',
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
        },
        bonoCodeLabel: {
            fontSize: 10,
            fontWeight: '800',
            color: muted,
            letterSpacing: 1.2,
            marginBottom: 4,
        },
        bonoCodeText: {
            fontSize: 15,
            fontWeight: '800',
            color: text,
            letterSpacing: 1,
        },
        bonoQrBtn: {
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: primary,
            paddingVertical: 13,
            borderRadius: Radius.md,
        },
        bonoQrBtnText: {
            color: '#fff',
            fontWeight: '800',
            fontSize: 14,
            letterSpacing: 0.2,
        },

        detailSheet: {
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 0,
            paddingBottom: 0,
            maxHeight: '90%',
        },
        detailHandle: {
            width: 40,
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: isDark ? '#3F3F46' : '#D1D5DB',
            alignSelf: 'center',
            marginTop: 12,
            marginBottom: 12,
        },
        detailHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: border,
        },
        detailTitle: { fontSize: 20, fontWeight: '800', color: text },
        detailSubtitle: { fontSize: 13, color: muted, marginTop: 2 },
        detailCloseBtn: {
            width: 36,
            height: 36,
            borderRadius: Radius.lg,
            backgroundColor: colors(isDark).glass,
            justifyContent: 'center',
            alignItems: 'center',
        },
        detailScroll: { paddingBottom: 32 },
        detailHero: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            margin: 16,
            padding: 16,
            borderRadius: Radius.xl,
        },
        detailHeroIcon: {
            width: 52,
            height: 52,
            borderRadius: Radius['2xl'],
            borderWidth: 2,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors(isDark).glass,
        },
        detailHeroTitle: { fontSize: 17, fontWeight: '800', color: text },
        detailHeroSubtitle: { fontSize: 12, color: muted, marginTop: 2 },
        detailHeroBadge: {
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: Radius.md,
            borderWidth: 1,
        },
        detailHeroBadgeText: { fontSize: 10, fontWeight: '800' },

        detailImageWrap: {
            marginHorizontal: 16,
            marginBottom: 16,
            height: 180,
            borderRadius: Radius.xl,
            overflow: 'hidden',
            position: 'relative',
        },
        detailImage: { width: '100%', height: '100%' },
        detailImageOverlay: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        detailImageTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
        detailImagePrice: { fontSize: 18, fontWeight: '800', color: '#34D399', marginTop: 2 },

        detailCard: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
            borderRadius: Radius.xl,
            padding: sheetPad,
            marginHorizontal: sheetPad,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: border,
        },
        detailSectionTitle: {
            fontSize: isNarrow ? 15 : 16,
            fontWeight: '800',
            color: text,
            marginBottom: 0,
            letterSpacing: -0.2,
        },
        detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        detailLabel: { fontSize: 13, color: muted, fontWeight: '600', flex: 0.42, paddingRight: 8 },
        detailValue: { fontSize: 13, color: text, fontWeight: '700', flex: 0.58, textAlign: 'right', flexShrink: 1 },
        detailValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flex: 0.58 },
        detailTotalRow: {
            marginTop: 10,
            paddingTop: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            marginBottom: 0,
        },
        detailTotalLabel: { fontSize: isNarrow ? 14 : 15, fontWeight: '800', color: text },
        detailTotalValue: {
            fontSize: isNarrow ? 18 : 22,
            fontWeight: '800',
            color: '#10B981',
            letterSpacing: -0.5,
        },

        summaryCard: {
            marginHorizontal: sheetPad,
            marginBottom: 16,
            borderRadius: Radius.xl,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)',
            backgroundColor: 'transparent',
            alignSelf: 'stretch',
        },
        summaryCardWebBg: {
            backgroundColor: isDark ? 'rgba(39,39,42,0.88)' : 'rgba(255,255,255,0.88)',
        },
        summaryCardInner: {
            paddingHorizontal: sheetPad,
            paddingTop: sheetPad,
            paddingBottom: sheetPad - 2,
            backgroundColor: isDark ? 'rgba(24,24,27,0.45)' : 'rgba(255,255,255,0.35)',
        },
        summaryHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 4,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        },
        summaryTitle: {
            flex: 1,
            minWidth: 0,
            fontSize: isNarrow ? 16 : 17,
            fontWeight: '800',
            color: text,
            letterSpacing: -0.3,
        },
        summaryChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: Radius.full,
            borderWidth: StyleSheet.hairlineWidth,
            flexShrink: 0,
            maxWidth: '46%',
        },
        summaryChipText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
        summaryField: {
            width: '100%',
            paddingVertical: isNarrow ? 10 : 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        },
        summaryFieldLast: { borderBottomWidth: 0 },
        summaryLabel: {
            width: '100%',
            fontSize: 11,
            color: muted,
            fontWeight: '600',
            letterSpacing: 0.2,
            textTransform: 'uppercase',
            marginBottom: 4,
        },
        summaryValueRow: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 6,
        },
        summaryValue: {
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            fontSize: isNarrow ? 14 : 15,
            lineHeight: isNarrow ? 20 : 22,
            color: text,
            fontWeight: '700',
            ...(Platform.OS === 'web'
                ? ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as any)
                : null),
        },
        summaryTotalBar: {
            marginTop: 12,
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: Radius.lg,
            backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.1)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.28)',
            gap: 6,
        },
        summaryTotalLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: muted,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
        },
        summaryTotalValue: {
            width: '100%',
            fontSize: isNarrow ? 22 : 26,
            lineHeight: isNarrow ? 28 : 32,
            fontWeight: '800',
            color: '#059669',
            letterSpacing: -0.6,
            ...(Platform.OS === 'web' ? ({ wordBreak: 'break-word' } as any) : null),
        },

        detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        detailActionBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: Radius.md,
            minWidth: 140,
            flex: 1,
        },
        detailActionPrimary: { backgroundColor: primary },
        detailActionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
        detailActionSecondary: {
            backgroundColor: colors(isDark).glass,
            borderWidth: 1,
            borderColor: border,
        },
        detailActionSecondaryText: { color: text, fontWeight: '700', fontSize: 14 },

        filterSheet: {
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
        },
        filterBody: { padding: 20, paddingBottom: 32 },
        filterLabel: { fontSize: 13, fontWeight: '800', color: text, marginBottom: 12 },
        filterChipsScroll: { flexDirection: 'row', gap: 8, marginBottom: 20 },
        filterChip: {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: Radius.xl,
            backgroundColor: colors(isDark).glass,
            borderWidth: 1,
            borderColor: border,
            marginRight: 6,
        },
        filterChipActive: { backgroundColor: primary, borderColor: primary },
        filterChipText: { fontSize: 13, fontWeight: '600', color: muted },
        filterChipTextActive: { color: '#fff' },
        customDateWrap: { gap: 10, marginBottom: 20 },
        dateInput: {
            borderColor: border,
            color: text,
            backgroundColor: colors(isDark).glass,
            borderRadius: Radius.md,
        },
        dateError: { fontSize: 12, color: '#EF4444' },
        filterFooter: { flexDirection: 'row', gap: 12, marginTop: 8 },
        filterClearBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 14,
            borderRadius: Radius.md,
            backgroundColor: colors(isDark).glass,
            borderWidth: 1,
            borderColor: border,
        },
        filterClearText: { color: text, fontWeight: '700', fontSize: 15 },
        filterApplyBtn: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: Radius.md,
            backgroundColor: primary,
            alignItems: 'center',
        },
        filterApplyText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    });
}
