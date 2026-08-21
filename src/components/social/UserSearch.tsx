import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Search, X, CheckCircle, Tag } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';
import { glassShadow, Radius, colors } from '../../theme/tokens';
import { SocialFollowButton } from './SocialFollowButton';
import { formatCompactCount } from '../../utils/formatCompactCount';
import { formatCurrency } from '../../utils/formatters';
import { useDebouncedSearchTerm } from '../../hooks/useDebounce';


interface UserSearchProps {
    onUserSelect?: (userId: string) => void;
    onClose?: () => void;
}

/**
 * Discovery unificado: personas Y productos en el mismo buscador. Antes
 * esto sólo pegaba contra `userDirectory.search` — para encontrar un
 * producto había que ir a otro lado. `api.discovery.search` corre las dos
 * búsquedas en paralelo (ver `convex/discovery.ts` para el porqué no es
 * búsqueda semántica/vectorial todavía).
 */
export const UserSearch = ({ onUserSelect, onClose }: UserSearchProps) => {
    const { user: authUser, sessionToken } = useAuth();
    const navigation = useNavigation<any>();
    const [query, setQuery] = useState('');

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const debouncedQuery = useDebouncedSearchTerm(query, 250, 2);

    const searchResult = useQuery(
        api.discovery.search,
        debouncedQuery ? { term: debouncedQuery, limit: 20, sessionToken } : 'skip',
    );

    const isSearching = debouncedQuery.length > 0;
    const results = (searchResult?.people ?? [])
        .map((u: any) => ({
            id: u.userId,
            name: u.displayName,
            username: u.username,
            avatar: u.avatar ?? '',
            verified: Boolean(u.verified),
            followers: u.followerCount ?? 0,
        }));
    const products = searchResult?.products ?? [];

    const handleProductSelect = (listing: any) => {
        onClose?.();
        navigation.navigate('ProductDetail', { productId: listing._id });
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose?.()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={isDark ? '#F9FAFB' : '#000'} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Buscar Usuarios</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <View style={styles.searchContainer}>
                        <Search size={20} color="#6B7280" style={styles.searchIcon} />
                        <TextInput
                            placeholder="Buscar usuarios..."
                            value={query}
                            onChangeText={setQuery}
                            style={styles.input}
                            placeholderTextColor="#9CA3AF"
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
                                <X size={20} color="#6B7280" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {isSearching && (
                        <ScrollView
                            style={styles.resultsContainer}
                            contentContainerStyle={styles.resultsContent}
                        >
                            {results.length === 0 && products.length === 0 ? (
                                <Text style={styles.emptyText}>Sin resultados</Text>
                            ) : (
                                <>
                                    {results.length > 0 && (
                                        <>
                                            <Text style={styles.sectionLabel}>Personas</Text>
                                            {results.map((user) => (
                                                <TouchableOpacity
                                                    key={user.id}
                                                    style={styles.userCard}
                                                    onPress={() => onUserSelect?.(user.id)}
                                                >
                                                    <View style={styles.userInfo}>
                                                        <Avatar style={styles.avatar}>
                                                            {user.avatar ? (
                                                                <AvatarImage src={user.avatar} />
                                                            ) : null}
                                                            <AvatarFallback>
                                                                {(user.name || 'U')[0]}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <View style={styles.textContainer}>
                                                            <View style={styles.nameRow}>
                                                                <Text style={styles.name}>{user.name}</Text>
                                                                {user.verified && (
                                                                    <CheckCircle
                                                                        size={14}
                                                                        color="#3B82F6"
                                                                        style={{ marginLeft: 4 }}
                                                                    />
                                                                )}
                                                            </View>
                                                            <Text style={styles.username}>
                                                                @{user.username}
                                                            </Text>
                                                            <Text style={styles.followers}>
                                                                {formatCompactCount(user.followers)} seguidores
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <SocialFollowButton targetUserId={user.id} compact />
                                                </TouchableOpacity>
                                            ))}
                                        </>
                                    )}

                                    {products.length > 0 && (
                                        <>
                                            <Text style={styles.sectionLabel}>Productos</Text>
                                            {products.map((listing: any) => (
                                                <TouchableOpacity
                                                    key={listing._id}
                                                    style={styles.userCard}
                                                    onPress={() => handleProductSelect(listing)}
                                                >
                                                    <View style={styles.userInfo}>
                                                        {listing.image ? (
                                                            <Image source={{ uri: listing.image }} style={styles.productThumb} />
                                                        ) : (
                                                            <View style={[styles.productThumb, styles.productThumbPlaceholder]}>
                                                                <Tag size={18} color="#9CA3AF" />
                                                            </View>
                                                        )}
                                                        <View style={styles.textContainer}>
                                                            <Text style={styles.name} numberOfLines={1}>{listing.title}</Text>
                                                            <Text style={styles.productPrice}>{formatCurrency(listing.price)}</Text>
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                        </ScrollView>
                    )}
                </View>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        sheetContent: {
            backgroundColor: colors(isDark).glass,
            height: '90%',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
        },
        container: { flex: 1 },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        closeBtn: { padding: 4 },
        headerTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: colors(isDark).text,
        },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
            borderRadius: Radius.xl,
            paddingHorizontal: 12,
        },
        searchIcon: { marginRight: 8 },
        input: {
            flex: 1,
            height: 44,
            color: colors(isDark).text,
            fontSize: 15,
        },
        clearButton: { padding: 4 },
        resultsContainer: { flex: 1 },
        resultsContent: { paddingHorizontal: 16, paddingBottom: 40 },
        emptyText: {
            textAlign: 'center',
            color: colors(isDark).textMuted,
            marginTop: 40,
        },
        userCard: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
            ...glassShadow(isDark),
        },
        userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
        avatar: { width: 48, height: 48 },
        textContainer: { flex: 1 },
        nameRow: { flexDirection: 'row', alignItems: 'center' },
        name: { fontSize: 15, fontWeight: '700', color: colors(isDark).text },
        username: { fontSize: 13, color: colors(isDark).textMuted },
        followers: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
        sectionLabel: {
            fontSize: 12,
            fontWeight: '700',
            color: colors(isDark).textMuted,
            textTransform: 'uppercase',
            marginTop: 12,
            marginBottom: 4,
        },
        productThumb: { width: 48, height: 48, borderRadius: Radius.md },
        productThumbPlaceholder: {
            backgroundColor: isDark ? '#374151' : '#E5E7EB',
            justifyContent: 'center',
            alignItems: 'center',
        },
        productPrice: { fontSize: 13, color: '#10B981', fontWeight: '700', marginTop: 2 },
    });
