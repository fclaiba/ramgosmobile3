import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Plus as PlusIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors } from '../../theme/tokens';

interface StoriesBarProps {
    onStoryClick: (userId: string) => void;
    onAddStory: () => void;
}

export const StoriesBar = ({ onStoryClick, onAddStory }: StoriesBarProps) => {
    const { sessionToken, user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const storyGroups = useQuery(
        api.social.getStoriesForFollowing,
        sessionToken ? { sessionToken } : 'skip'
    ) ?? [];

    const myGroup = storyGroups.find((g: any) => g.author?.userId === (user as any)?.id);
    const hasMyStory = !!myGroup;

    return (
        <View style={styles.wrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
                {/* "Your Story" button — always first */}
                <TouchableOpacity 
                    style={styles.storyItem} 
                    onPress={hasMyStory ? () => onStoryClick((user as any)?.id) : onAddStory}
                >
                    <View style={styles.addStoryOuter}>
                        {hasMyStory ? (
                            <LinearGradient colors={['#4FC3F7', '#EC4899', '#F59E0B']} style={styles.gradientRing}>
                                <View style={styles.imageBorder}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={(user as any)?.avatar || ''} />
                                        <AvatarFallback>{(user?.name || 'T')[0]}</AvatarFallback>
                                    </Avatar>
                                </View>
                            </LinearGradient>
                        ) : (
                            <View style={styles.noStoryRing}>
                                <View style={styles.imageBorder}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={(user as any)?.avatar || ''} />
                                        <AvatarFallback>{(user?.name || 'T')[0]}</AvatarFallback>
                                    </Avatar>
                                </View>
                            </View>
                        )}
                        <View style={styles.plusOverlay}>
                            <TouchableOpacity style={styles.plusBadge} onPress={onAddStory}>
                                <PlusIcon size={12} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.name} numberOfLines={1}>Tu historia</Text>
                </TouchableOpacity>

                {/* Other users' stories */}
                {storyGroups
                    .filter((g: any) => g.author?.userId !== (user as any)?.id)
                    .map((group: any) => {
                        const author = group.author;
                        if (!author) return null;
                        const displayName = author.displayName || author.username || '?';
                        const avatarUrl = author.avatar || '';
                        const fallbackImg = !avatarUrl && group.stories?.[0]?.imageUrl
                            ? group.stories[0].imageUrl
                            : avatarUrl;

                        // A1: anillo con gradiente sólo si queda algo sin ver
                        // — antes todos los anillos eran iguales, ordenados
                        // sólo por lista de seguidos.
                        const ring = group.hasUnseen ? (
                            <LinearGradient colors={['#4FC3F7', '#EC4899', '#F59E0B']} style={styles.gradientRing}>
                                <View style={styles.imageBorder}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={fallbackImg} />
                                        <AvatarFallback>{displayName[0]}</AvatarFallback>
                                    </Avatar>
                                </View>
                            </LinearGradient>
                        ) : (
                            <View style={styles.noStoryRing}>
                                <View style={styles.imageBorder}>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={fallbackImg} />
                                        <AvatarFallback>{displayName[0]}</AvatarFallback>
                                    </Avatar>
                                </View>
                            </View>
                        );

                        return (
                            <TouchableOpacity
                                key={author.userId}
                                style={styles.storyItem}
                                onPress={() => onStoryClick(author.userId)}
                            >
                                {ring}
                                <Text style={styles.name} numberOfLines={1}>{displayName.split(' ')[0]}</Text>
                            </TouchableOpacity>
                        );
                    })}
            </ScrollView>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    wrapper: { marginBottom: 12 },
    container: { paddingHorizontal: 12, gap: 14, paddingVertical: 8 },
    storyItem: { alignItems: 'center', width: 72 },
    addStoryOuter: { position: 'relative', marginBottom: 4 },
    gradientRing: {
        width: 68, height: 68, borderRadius: 34,
        alignItems: 'center', justifyContent: 'center', padding: 3,
    },
    noStoryRing: {
        width: 68, height: 68, borderRadius: 34,
        alignItems: 'center', justifyContent: 'center', padding: 3,
        borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
    },
    imageBorder: {
        width: 62, height: 62, borderRadius: 31,
        backgroundColor: isDark ? '#09090B' : '#FAFAFA',
        padding: 2, alignItems: 'center', justifyContent: 'center',
    },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    plusOverlay: {
        position: 'absolute', bottom: -2, right: -2, zIndex: 2,
    },
    plusBadge: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#0095F6',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: isDark ? '#09090B' : '#FAFAFA',
    },
    name: {
        fontSize: 11, color: isDark ? '#D1D5DB' : '#4B5563',
        textAlign: 'center', marginTop: 4, fontWeight: '500',
    },
});
