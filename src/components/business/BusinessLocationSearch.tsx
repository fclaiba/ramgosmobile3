import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Search, MapPin } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { glassShadow, Radius, colors } from '../../theme/tokens';




interface Props {
    onSelect: (place: { name: string; address: string; placeId: string }) => void;
}

export const BusinessLocationSearch = ({ onSelect }: Props) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const dbResults = useQuery(api.locations.search, { query: query.length > 2 ? query : "" }) as
        | Array<{ id: string; name: string; address: string }>
        | undefined;
    const results = dbResults ?? [];

    const handleSearch = (text: string) => {
        setQuery(text);
    };

    return (
        <View style={styles.container}>
            <View style={[styles.searchBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' }]}>
                <Search size={20} color={isDark ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.input, { color: colors(isDark).text }]}
                    placeholder="Buscar tu negocio en Google Maps..."
                    placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                    value={query}
                    onChangeText={handleSearch}
                />
                {loading && <ActivityIndicator size="small" color="#2196F3" />}
            </View>

            {results.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: colors(isDark).glass, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' }]}>
                    <FlatList
                        data={results}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.item, { borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' }]}
                                onPress={() => onSelect({ name: item.name, address: item.address, placeId: item.id })}
                            >
                                <View style={[styles.iconBox, { backgroundColor: colors(isDark).glass }]}>
                                    <MapPin size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                </View>
                                <View>
                                    <Text style={[styles.itemName, { color: colors(isDark).text }]}>{item.name}</Text>
                                    <Text style={styles.itemAddress}>{item.address}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}
        </View>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        zIndex: 10,
        marginBottom: 16
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 50,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    input: {
        flex: 1,
        fontSize: 16,
        height: '100%',
    },
    resultsList: {
        position: 'absolute',
        top: 56,
        left: 0,
        right: 0,
        borderRadius: Radius.md,
        borderWidth: 1,
        maxHeight: 200,
        elevation: 5,
        ...glassShadow(isDark),overflow: 'hidden'
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    itemName: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2
    },
    itemAddress: {
        fontSize: 12,
        color: isDark ? '#6B7280' : '#9CA3AF'
    }
});
