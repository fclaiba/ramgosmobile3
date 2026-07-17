import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Search, MapPin } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';



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
            <View style={[styles.searchBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)' }]}>
                <Search size={20} color={isDark ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.input, { color: isDark ? '#F9FAFB' : '#111827' }]}
                    placeholder="Buscar tu negocio en Google Maps..."
                    placeholderTextColor={isDark ? '#9CA3AF' : '#9CA3AF'}
                    value={query}
                    onChangeText={handleSearch}
                />
                {loading && <ActivityIndicator size="small" color="#7C3AED" />}
            </View>

            {results.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)' }]}>
                    <FlatList
                        data={results}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.item, { borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)' }]}
                                onPress={() => onSelect({ name: item.name, address: item.address, placeId: item.id })}
                            >
                                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' }]}>
                                    <MapPin size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                                </View>
                                <View>
                                    <Text style={[styles.itemName, { color: isDark ? '#F9FAFB' : '#111827' }]}>{item.name}</Text>
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
        borderRadius: 12,
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
        borderRadius: 12,
        borderWidth: 1,
        maxHeight: 200,
        elevation: 5,
        shadowColor: isDark ? '#F9FAFB' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        overflow: 'hidden'
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
        borderRadius: 16,
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
