import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Plus as PlusIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useSocial, Story } from '../../contexts/SocialContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius, colors, glassShadow } from '../../theme/tokens';
import { glassSurface } from '../../utils/glass';


interface StoriesBarProps {
    onStoryClick: (storyId: string) => void;
    onAddStory: () => void;
}

export const StoriesBar = ({ onStoryClick, onAddStory }: StoriesBarProps) => {
    const { stories } = useSocial();
    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <View style={styles.wrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
                <TouchableOpacity style={styles.storyItem} onPress={onAddStory}>
                    <View style={styles.addStoryContainer}>
                        <View style={styles.addStoryIcon}>
                            <PlusIcon size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                        </View>
                        <View style={styles.absolutePlus}>
                            <View style={styles.plusBadge}>
                                <PlusIcon size={10} color="#fff" />
                            </View>
                        </View>
                    </View>
                    <Text style={styles.name}>Crear</Text>
                </TouchableOpacity>

                {stories.map((story: Story) => {
                    const hasStory = story.items?.length > 0;
                    const hasUnviewed = story.items?.some((item: any) => !item.viewed);

                    return (
                        <TouchableOpacity key={story.id} style={styles.storyItem} onPress={() => onStoryClick(story.id)}>
                            <View style={styles.avatarWrapper}>
                                {hasStory && hasUnviewed ? (
                                    <LinearGradient
                                        colors={['#4FC3F7', '#EC4899', '#F59E0B']}
                                        style={styles.gradientRing}
                                    >
                                        <View style={styles.imageBorder}>
                                            <Avatar style={styles.avatar}>
                                                <AvatarImage src={story.user.avatar} />
                                                <AvatarFallback>{story.user.name[0]}</AvatarFallback>
                                            </Avatar>
                                        </View>
                                    </LinearGradient>
                                ) : (
                                    <View style={[styles.gradientRing, styles.noStoryRing]}>
                                        <View style={styles.imageBorder}>
                                            <Avatar style={styles.avatar}>
                                                <AvatarImage src={story.user.avatar} />
                                                <AvatarFallback>{story.user.name[0]}</AvatarFallback>
                                            </Avatar>
                                        </View>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.name} numberOfLines={1}>{story.user.name}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    wrapper: { backgroundColor: 'transparent' }, // Handled by parent container opacity/color usually
    container: { paddingHorizontal: 16, gap: 16, paddingVertical: 12 },
    storyItem: { alignItems: 'center', gap: 6, width: 68 },

    // Add Story Style
    addStoryContainer: { width: 64, height: 64, ...glassSurface(true, 'regular', { borderRadius: Radius['2xl'] }), justifyContent: 'center', alignItems: 'center' },
    addStoryIcon: { opacity: 0.5 },
    absolutePlus: { position: 'absolute', bottom: 0, right: 0 },
    plusBadge: { width: 20, height: 20, borderRadius: Radius.md, backgroundColor: '#4FC3F7', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isDark ? '#09090B' : '#FAFAFA' },

    // Story Avatar Style
    avatarWrapper: { width: 68, height: 68, justifyContent: 'center', alignItems: 'center' },
    gradientRing: { width: 68, height: 68, borderRadius: Radius.full, justifyContent: 'center', alignItems: 'center', ...glassShadow(isDark) },
    noStoryRing: { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)' },
    imageBorder: { width: 62, height: 62, borderRadius: Radius.full, backgroundColor: colors(isDark).glass, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isDark ? '#000' : '#fff' },
    avatar: { width: 58, height: 58, borderRadius: Radius.full },

    name: { fontSize: 11, textAlign: 'center', color: isDark ? '#D1D5DB' : '#374151', width: '100%' }
});
