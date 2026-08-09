import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { UserListItem } from '../../components/social/UserListItem';
import { MobileHeader } from '../../components/MobileHeader';
import { colors } from '../../theme/tokens';

export default function UserListScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { userId, type } = route.params || {};
    // type: 'followers' | 'following'

    const { user: authUser, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const title = type === 'followers' ? 'Seguidores' : 'Siguiendo';
    const authArgs =
        authUser && sessionToken ? { sessionToken, userId: String(userId) } : 'skip';

    const followersRows = useQuery(
        api.social.getFollowers,
        type === 'followers' ? (authArgs as any) : 'skip',
    );
    const followingRows = useQuery(
        api.social.getFollowing,
        type === 'following' ? (authArgs as any) : 'skip',
    );

    const otherIds = useMemo(() => {
        if (type === 'followers')
            return (followersRows ?? []).map((r: any) => r.followerUserId);
        if (type === 'following')
            return (followingRows ?? []).map((r: any) => r.followeeUserId);
        return [];
    }, [type, followersRows, followingRows]);

    const fetchedUsers = useQuery(
        api.social.getUsersByIds,
        authUser && sessionToken && otherIds.length > 0
            ? { userIds: otherIds, sessionToken }
            : 'skip',
    );

    const users = useMemo(() => {
        if (!fetchedUsers) return [];
        return fetchedUsers.map((u: any) => ({
            id: u.userId,
            name: u.displayName ?? 'Usuario',
            username: u.username ?? 'usuario',
            avatar: u.avatar ?? '',
            verified: u.verified ?? false,
        }));
    }, [fetchedUsers]);

    return (
        <View style={styles.container}>
            <MobileHeader
                title={title}
                subtitle={userId ? String(userId).slice(-6) : undefined}
                backButton
                onBack={() => navigation.goBack()}
            />
            <FlatList
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <UserListItem
                        user={item}
                        onPress={() =>
                            navigation.navigate('HybridProfile', {
                                userId: item.id,
                            })
                        }
                    />
                )}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No hay usuarios</Text>
                    </View>
                }
            />
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors(isDark).bg,
        },
        list: {
            paddingTop: 8,
        },
        empty: {
            padding: 40,
            alignItems: 'center',
        },
        emptyText: {
            color: colors(isDark).textMuted,
        },
    });
