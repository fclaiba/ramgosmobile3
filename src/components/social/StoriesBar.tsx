import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Plus as PlusIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useSocial, Story } from '../../contexts/SocialContext';
import { useTheme } from '../../contexts/ThemeContext';

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
                                        colors={['#8B5CF6', '#EC4899', '#F59E0B']}
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
    addStoryContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: isDark ? '#374151' : '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#E5E7EB' },
    addStoryIcon: { opacity: 0.5 },
    absolutePlus: { position: 'absolute', bottom: 0, right: 0 },
    plusBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: isDark ? '#1F2937' : '#fff' },

    // Story Avatar Style
    avatarWrapper: { width: 68, height: 68, justifyContent: 'center', alignItems: 'center' },
    gradientRing: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
    noStoryRing: { backgroundColor: isDark ? '#4B5563' : '#E5E7EB' },
    imageBorder: { width: 62, height: 62, borderRadius: 31, backgroundColor: isDark ? '#1F2937' : '#fff', justifyContent: 'center', alignItems: 'center' },
    avatar: { width: 56, height: 56, borderRadius: 28 },

    name: { fontSize: 11, textAlign: 'center', color: isDark ? '#D1D5DB' : '#374151', width: '100%' }
});
