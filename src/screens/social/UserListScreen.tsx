import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { UserListItem } from '../../components/social/UserListItem';
import { MobileHeader } from '../../components/MobileHeader';

export default function UserListScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { userId, type } = route.params || {};
    // type: 'followers' | 'following'

    const { getUserById } = useSocial();
    const { user: authUser } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const user = getUserById(userId);
    const title = type === 'followers' ? 'Seguidores' : 'Siguiendo';

    const followersRows = useQuery(
        api.social.getFollowers,
        authUser && type === 'followers' ? { userId } : 'skip',
    );
    const followingRows = useQuery(
        api.social.getFollowing,
        authUser && type === 'following' ? { userId } : 'skip',
    );

    const otherIds = useMemo(() => {
        if (type === 'followers') return (followersRows ?? []).map((r: any) => r.followerUserId);
        if (type === 'following') return (followingRows ?? []).map((r: any) => r.followeeUserId);
        return [];
    }, [type, followersRows, followingRows]);

    const fetchedUsers = useQuery(
        api.social.getUsersByIds,
        authUser && otherIds.length > 0 ? { userIds: otherIds } : 'skip'
    );

    const users = useMemo(() => {
        if (!fetchedUsers) return [];
        return fetchedUsers.map((u: any) => ({
            id: u.userId,
            name: u.displayName ?? 'Usuario',
            displayName: u.displayName ?? 'Usuario',
            username: u.username ?? 'usuario',
            avatar: u.avatar ?? '',
            bio: u.bio ?? '',
            followers: u.followerCount ?? 0,
            following: u.followingCount ?? 0,
            isInfluencer: u.isInfluencer ?? false,
            verified: u.verified ?? false,
        }));
    }, [fetchedUsers]);

    return (
        <View style={styles.container}>
            <MobileHeader
                title={user ? user.name : title}
                subtitle={title}
                backButton
                onBack={() => navigation.goBack()}
            />
            <FlatList
                data={users}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <UserListItem
                        user={item}
                        onPress={() => {
                            // If we are already on a profile stack, we might want to push?
                            // For simplicity, let's navigate to Social -> ViewProfile
                            // But UserList is likely inside the same stack.
                            // We need to handle navigation properly.
                            // Assuming 'Social' stack or global stack.
                            // But usually UserProfile handles this via "viewingProfile" state in SocialScreen.
                            // This Screen concept might conflict with SocialScreen's state-based navigation if not careful.
                            // IF we are using React Navigation fully:
                            // navigation.push('UserProfile', { userId: item.id });

                            // HOWEVER, SocialScreen.tsx uses local state `viewingProfile`.
                            // If `UserListScreen` is a separate screen in Stack, we can navigate to another screen.
                            // Let's assume we register UserProfileScreen as a standalone screen too or handle it here?

                            // Re-using the SocialScreen pattern is tricky if we are outside of it.
                            // Let's assume we will add `UserProfileScreen` as a real screen in App.tsx to solve this architecture issue.
                            // For now, let's console log.
                            console.log('Navigate to user', item.id);
                        }}
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

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
    },
    list: {
        paddingTop: 8,
    },
    empty: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
});
