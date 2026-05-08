import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Search, X, CheckCircle } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';

interface UserSearchProps {
    onUserSelect?: (userId: string) => void;
}

export const UserSearch = ({ onUserSelect }: UserSearchProps) => {
    const { followUser, unfollowUser, isFollowing, currentUser } = useSocial();
    const { user: authUser } = useAuth();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Debounce search input by 250ms to avoid hammering the backend.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const searchRows = useQuery(
        api.social.searchUsers,
        authUser && debouncedQuery
            ? { actorId: authUser.id as any, term: debouncedQuery, limit: 25 }
            : 'skip',
    );

    const isSearching = debouncedQuery.length > 0;
    const results = (searchRows ?? [])
        .filter((u: any) => u.userId !== currentUser.id)
        .map((u: any) => ({
            id: u.userId,
            name: u.displayName,
            username: u.username,
            avatar: u.avatar ?? '',
            verified: Boolean(u.verified),
            followers: u.followerCount ?? 0,
        }));

    const handleFollow = (userId: string) => {
        if (isFollowing(userId)) {
            unfollowUser(userId);
        } else {
            followUser(userId);
        }
    };

    return (
        <View style={styles.container}>
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
                <ScrollView style={styles.resultsContainer} contentContainerStyle={styles.resultsContent}>
                    {results.length === 0 ? (
                        <Text style={styles.emptyText}>No se encontraron usuarios</Text>
                    ) : (
                        results.map((user) => (
                            <TouchableOpacity
                                key={user.id}
                                style={styles.userCard}
                                onPress={() => onUserSelect?.(user.id)}
                            >
                                <View style={styles.userInfo}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <View style={styles.textContainer}>
                                        <View style={styles.nameRow}>
                                            <Text style={styles.name}>{user.name}</Text>
                                            {user.verified && <CheckCircle size={14} color="#3B82F6" style={{ marginLeft: 4 }} />}
                                        </View>
                                        <Text style={styles.username}>@{user.username}</Text>
                                        <Text style={styles.followers}>{user.followers} seguidores</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.followButton, isFollowing(user.id) ? styles.followingButton : {}]}
                                    onPress={() => handleFollow(user.id)}
                                >
                                    <Text style={[styles.followText, isFollowing(user.id) ? styles.followingText : {}]}>
                                        {isFollowing(user.id) ? 'Siguiendo' : 'Seguir'}
                                    </Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            )}
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { width: '100%', zIndex: 10 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111' },
    clearButton: { padding: 4 },

    resultsContainer: { maxHeight: 300, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 12, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    resultsContent: { padding: 8 },
    emptyText: { textAlign: 'center', padding: 16, color: '#6B7280' },

    userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatar: { width: 40, height: 40, marginRight: 12 },
    textContainer: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    name: { fontWeight: '600', fontSize: 14, color: isDark ? '#F9FAFB' : '#111' },
    username: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
    followers: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

    followButton: { backgroundColor: isDark ? '#4F46E5' : '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    followingButton: { backgroundColor: isDark ? '#374151' : '#fff', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB' },
    followText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    followingText: { color: isDark ? '#F9FAFB' : '#000' }
});
