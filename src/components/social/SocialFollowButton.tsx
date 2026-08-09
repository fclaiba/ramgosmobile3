import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors } from '../../theme/tokens';

type Props = {
    targetUserId: string;
    compact?: boolean;
};

export function SocialFollowButton({ targetUserId, compact }: Props) {
    const { user, sessionToken } = useAuth();
    const { show } = useToast();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark, compact);
    const [loading, setLoading] = useState(false);

    const meId = user?.id ? String(user.id) : '';
    const isMe = !!meId && meId === String(targetUserId);

    const following = useQuery(
        api.social.isFollowing,
        meId && targetUserId && sessionToken
            ? {
                  sessionToken,
                  followerUserId: meId,
                  followeeUserId: String(targetUserId),
              }
            : 'skip',
    );
    const followMut = useMutation(api.social.follow);
    const unfollowMut = useMutation(api.social.unfollow);

    if (isMe) return null;

    const isFollowing = following === true;

    const onPress = async () => {
        if (!sessionToken || !meId) {
            show('Iniciá sesión para seguir usuarios', 'warning');
            return;
        }
        setLoading(true);
        try {
            if (isFollowing) {
                await unfollowMut({
                    sessionToken,
                    targetUserId: String(targetUserId),
                });
            } else {
                await followMut({
                    sessionToken,
                    targetUserId: String(targetUserId),
                });
            }
        } catch (e: any) {
            show(e?.message || 'No se pudo actualizar el seguimiento', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.btn, isFollowing && styles.btnFollowing]}
            onPress={onPress}
            disabled={loading || following === undefined}
        >
            {loading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors(isDark).text : '#fff'} />
            ) : (
                <Text style={[styles.btnText, isFollowing && styles.btnTextFollowing]}>
                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                </Text>
            )}
        </TouchableOpacity>
    );
}

const getStyles = (isDark: boolean, compact?: boolean) =>
    StyleSheet.create({
        btn: {
            paddingHorizontal: compact ? 12 : 16,
            paddingVertical: compact ? 6 : 8,
            backgroundColor: '#2196F3',
            borderRadius: Radius.xl,
            minWidth: compact ? 88 : 100,
            alignItems: 'center',
        },
        btnFollowing: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)',
        },
        btnText: {
            fontSize: 14,
            fontWeight: '600',
            color: '#fff',
        },
        btnTextFollowing: {
            color: colors(isDark).text,
        },
    });
