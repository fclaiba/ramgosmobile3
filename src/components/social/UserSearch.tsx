import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Search, X, CheckCircle } from 'lucide-react-native';
import { useSocial, User } from '../../contexts/SocialContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface UserSearchProps {
    onUserSelect?: (userId: string) => void;
}

export const UserSearch = ({ onUserSelect }: UserSearchProps) => {
    const { searchUsers, followUser, unfollowUser, isFollowing, currentUser } = useSocial();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (query.trim().length > 0) {
            setIsSearching(true);
            const users = searchUsers(query).filter((u) => u.id !== currentUser.id);
            setResults(users);
        } else {
            setResults([]);
            setIsSearching(false);
        }
    }, [query]);

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

const styles = StyleSheet.create({
    container: { width: '100%', zIndex: 10 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: '#111' },
    clearButton: { padding: 4 },

    resultsContainer: { maxHeight: 300, backgroundColor: '#fff', borderRadius: 12, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    resultsContent: { padding: 8 },
    emptyText: { textAlign: 'center', padding: 16, color: '#6B7280' },

    userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    avatar: { width: 40, height: 40, marginRight: 12 },
    textContainer: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    name: { fontWeight: '600', fontSize: 14, color: '#111' },
    username: { fontSize: 12, color: '#6B7280' },
    followers: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

    followButton: { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    followingButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
    followText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    followingText: { color: '#000' }
});
