import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, Dimensions, SafeAreaView, TextInput, ScrollView, Platform, KeyboardAvoidingView, Animated } from 'react-native';
import { X, Heart, Send, MoreHorizontal } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useSocial, Story } from '../../contexts/SocialContext';
import { useTheme } from '../../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

// Individual Story Item Component
const StorySlide = ({
    story,
    isActive,
    onClose,
    onNextUser,
    onPrevUser,
    onNavigateProfile,
    onLike,
    onShare,
    onReply
}: {
    story: Story,
    isActive: boolean,
    onClose: () => void,
    onNextUser: () => void,
    onPrevUser: () => void,
    onNavigateProfile: () => void,
    onLike: (itemId: string) => void,
    onShare: (itemId: string) => void,
    onReply: (itemId: string, message: string) => void
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);
    const [replyText, setReplyText] = useState('');

    // Safety check for empty items array
    const currentItem = story.items?.[currentIndex];
    const { markStoryAsViewed } = useSocial();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Reset state when story changes
    useEffect(() => {
        if (!isActive) {
            setProgress(new Animated.Value(0));
            setCurrentIndex(0);
        } else if (story.items?.length > 0) {
            // Mark first item as viewed
            markStoryAsViewed(story.id, story.items[0].id);
        }
    }, [isActive, story.id]);

    // Timer Logic
    useEffect(() => {
        if (!isActive || isPaused || !currentItem) return;

        const duration = currentItem.duration * 1000;

        Animated.timing(progress, {
            toValue: 1,
            duration: duration,
            useNativeDriver: false,
        }).start(({ finished }) => {
            if (finished) {
                handleNext();
            }
        });

        return () => {
            progress.stopAnimation();
        };
    }, [currentIndex, isActive, isPaused, currentItem]);

    const handleNext = () => {
        if (story.items && currentIndex < story.items.length - 1) {
            setProgress(new Animated.Value(0));
            setCurrentIndex(prev => prev + 1);
            markStoryAsViewed(story.id, story.items[currentIndex + 1].id);
        } else {
            onNextUser();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setProgress(new Animated.Value(0));
            setCurrentIndex(prev => prev - 1);
        } else {
            onPrevUser();
        }
    };

    const handlePressIn = () => setIsPaused(true);
    const handlePressOut = () => setIsPaused(false);

    if (!currentItem) return null;

    return (
        <View style={styles.slideContainer}>
            {/* Image Content */}
            <Image
                source={{ uri: currentItem.url }}
                style={styles.image}
                resizeMode="cover"
            />

            {/* Gradient Overlay */}
            <LinearGradient
                colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.6)']}
                style={styles.gradient}
            />

            <SafeAreaView style={styles.safeArea}>
                {/* Progress Bars */}
                <View style={styles.progressContainer}>
                    {story.items.map((item: any, index: number) => (
                        <View key={item.id} style={styles.progressBarBg}>
                            {index === currentIndex ? (
                                <Animated.View
                                    style={[
                                        styles.progressBarFill,
                                        {
                                            width: progress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0%', '100%']
                                            })
                                        }
                                    ]}
                                />
                            ) : (
                                <View style={[styles.progressBarFill, { width: index < currentIndex ? '100%' : '0%' }]} />
                            )}
                        </View>
                    ))}
                </View>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.userInfo} onPress={onNavigateProfile}>
                        <Avatar style={styles.avatar}>
                            <AvatarImage src={story.user.avatar} />
                            <AvatarFallback>{story.user.name[0]}</AvatarFallback>
                        </Avatar>
                        <Text style={styles.userName}>{story.user.name}</Text>
                        <Text style={styles.time}>
                            {new Date(currentItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </TouchableOpacity>

                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.iconBtn}>
                            <MoreHorizontal size={24} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Footer Interactions */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.footer}
                >
                    <View style={styles.inputContainer}>
                        <TextInput
                            placeholder="Envía un mensaje..."
                            placeholderTextColor="#fff"
                            style={styles.input}
                            value={replyText}
                            onChangeText={setReplyText}
                            onFocus={() => setIsPaused(true)}
                            onBlur={() => setIsPaused(false)}
                            onSubmitEditing={() => {
                                if (replyText.trim()) {
                                    onReply(currentItem.id, replyText);
                                    setReplyText('');
                                }
                            }}
                            returnKeyType="send"
                        />
                    </View>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(currentItem.id)}>
                        <Heart size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onShare(currentItem.id)}>
                        <Send size={28} color="#fff" />
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Tap Gestures - Behind UI */}
            <View style={styles.tapContainer}>
                <TouchableOpacity
                    style={styles.tapLeft}
                    onPress={handlePrev}
                    onLongPress={handlePressIn}
                    onPressOut={handlePressOut}
                    delayLongPress={200}
                />
                <TouchableOpacity
                    style={styles.tapRight}
                    onPress={handleNext}
                    onLongPress={handlePressIn}
                    onPressOut={handlePressOut}
                    delayLongPress={200}
                />
            </View>
        </View>
    );
};


export const StoryViewer = ({ storyId, onClose, onNavigateProfile }: { storyId: string, onClose: () => void, onNavigateProfile: (userId: string) => void }) => {
    const { stories, likeStory, replyToStory, shareStory } = useSocial();
    const initialIndex = stories.findIndex(s => s.id === storyId);
    const [activeIndex, setActiveIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
    const scrollViewRef = useRef<ScrollView>(null);

    // If stories haven't loaded yet, close the viewer
    useEffect(() => {
        if (stories.length === 0) {
            onClose();
        }
    }, [stories.length]);

    // Initial Scroll
    useEffect(() => {
        if (scrollViewRef.current && initialIndex >= 0) {
            setTimeout(() => {
                scrollViewRef.current?.scrollTo({ x: initialIndex * width, animated: false });
            }, 0);
        }
    }, [initialIndex]);

    const handleMomentumScrollEnd = (event: any) => {
        const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
        setActiveIndex(newIndex);
    };

    const handleNextUser = () => {
        if (activeIndex < stories.length - 1) {
            scrollViewRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
            setActiveIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const handlePrevUser = () => {
        if (activeIndex > 0) {
            scrollViewRef.current?.scrollTo({ x: (activeIndex - 1) * width, animated: true });
            setActiveIndex(prev => prev - 1);
        } else {
            onClose();
        }
    };

    // If stories array is still empty (before auto-close fires), render nothing
    if (stories.length === 0) {
        return null;
    }

    return (
        <Modal animationType="slide" visible={true} transparent={false} onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'black' }}>
                <ScrollView
                    ref={scrollViewRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleMomentumScrollEnd}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ width: width * stories.length }}
                >
                    {stories.map((story, index) => (
                        <View key={story.id} style={{ width, height }}>
                            <StorySlide
                                story={story}
                                isActive={index === activeIndex}
                                onClose={onClose}
                                onNextUser={handleNextUser}
                                onPrevUser={handlePrevUser}
                                onNavigateProfile={() => {
                                    onClose();
                                    onNavigateProfile(story.userId);
                                }}
                                onLike={(itemId) => likeStory(story.id, itemId)}
                                onShare={(itemId) => shareStory(story.id, itemId)}
                                onReply={(itemId, msg) => replyToStory(story.id, itemId, msg)}
                            />
                        </View>
                    ))}
                </ScrollView>
            </View>
        </Modal>
    );
};

const getStyles = (isDark: any) => StyleSheet.create({
    slideContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },
    image: { width, height, position: 'absolute' },
    gradient: { ...StyleSheet.absoluteFill },
    safeArea: { flex: 1, flexDirection: 'column' },

    progressContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, gap: 4, height: 14 },
    progressBarBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 32, height: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
    userName: {
        color: isDark ? '#09090B' : '#FAFAFA',
        fontWeight: 'bold',
        fontSize: 13,
        ...Platform.select({
            web: { textShadow: '0px 0px 4px rgba(0,0,0,0.5)' },
            default: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }
        })
    },
    time: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '400' },
    headerActions: { flexDirection: 'row', gap: 16 },
    iconBtn: { padding: 4 },

    footer: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 16 },
    inputContainer: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
    input: { color: isDark ? '#09090B' : '#FAFAFA', fontSize: 16 },
    actionBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },

    tapContainer: { ...StyleSheet.absoluteFill, flexDirection: 'row', zIndex: -1 }, // Behind UI
    tapLeft: { width: width * 0.3, height: '100%' },
    tapRight: { width: width * 0.7, height: '100%' },
});
