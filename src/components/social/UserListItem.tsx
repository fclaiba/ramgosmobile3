import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSocial, User } from '../../contexts/SocialContext';
import { useTheme } from '../../contexts/ThemeContext';
import { CheckCircle2 } from 'lucide-react-native';

interface UserListItemProps {
    user: User;
    onPress: () => void;
}

export const UserListItem = ({ user, onPress }: UserListItemProps) => {
    const { isFollowing, followUser, unfollowUser, currentUser } = useSocial();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const isFollowed = isFollowing(user.id);
    const isMe = user.id === currentUser.id;

    const handleAction = () => {
        if (isFollowed) {
            unfollowUser(user.id);
        } else {
            followUser(user.id);
        }
    };

    return (
        <TouchableOpacity style={styles.container} onPress={onPress}>
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
            <View style={styles.info}>
                <View style={styles.nameRow}>
                    <Text style={styles.name}>{user.name}</Text>
                    {user.verified && <CheckCircle2 size={14} color="#3B82F6" style={{ marginLeft: 4 }} />}
                </View>
                <Text style={styles.username}>@{user.username}</Text>
            </View>

            {!isMe && (
                <TouchableOpacity
                    style={[styles.btn, isFollowed && styles.btnFollowing]}
                    onPress={handleAction}
                >
                    <Text style={[styles.btnText, isFollowed && styles.btnTextFollowing]}>
                        {isFollowed ? 'Siguiendo' : 'Seguir'}
                    </Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: isDark ? '#1F2937' : '#fff',
        marginBottom: 1,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E5E7EB',
    },
    info: {
        flex: 1,
        marginLeft: 12,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    name: {
        fontSize: 16,
        fontWeight: '600',
        color: isDark ? '#F9FAFB' : '#111827',
    },
    username: {
        fontSize: 14,
        color: isDark ? '#9CA3AF' : '#6B7280',
    },
    btn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#7C3AED',
        borderRadius: 20,
    },
    btnFollowing: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: isDark ? '#4B5563' : '#E5E7EB',
    },
    btnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    btnTextFollowing: {
        color: isDark ? '#F9FAFB' : '#111827',
    },
});
