import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { CheckCircle2 } from 'lucide-react-native';
import { Radius, colors } from '../../theme/tokens';
import { SocialFollowButton } from './SocialFollowButton';

export type SocialListUser = {
    id: string;
    name?: string;
    username?: string;
    avatar?: string;
    verified?: boolean;
};

interface UserListItemProps {
    user: SocialListUser;
    onPress: () => void;
}

export const UserListItem = ({ user, onPress }: UserListItemProps) => {
    const { user: authUser } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const isMe = !!authUser?.id && String(authUser.id) === String(user.id);

    return (
        <TouchableOpacity style={styles.container} onPress={onPress}>
            <Image
                source={{ uri: user.avatar || 'https://i.pravatar.cc/150?u=ramgos' }}
                style={styles.avatar}
            />
            <View style={styles.info}>
                <View style={styles.nameRow}>
                    <Text style={styles.name}>{user.name || 'Usuario'}</Text>
                    {user.verified && (
                        <CheckCircle2 size={14} color="#3B82F6" style={{ marginLeft: 4 }} />
                    )}
                </View>
                <Text style={styles.username}>@{user.username || 'usuario'}</Text>
            </View>

            {!isMe && <SocialFollowButton targetUserId={user.id} compact />}
        </TouchableOpacity>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            backgroundColor: colors(isDark).bg,
            marginBottom: 1,
        },
        avatar: {
            width: 48,
            height: 48,
            borderRadius: Radius.xl,
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
            color: colors(isDark).text,
        },
        username: {
            fontSize: 14,
            color: colors(isDark).textMuted,
        },
    });
