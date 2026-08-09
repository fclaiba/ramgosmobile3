import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, Dimensions, SafeAreaView, TextInput, Platform, KeyboardAvoidingView, Animated, Share, Alert } from 'react-native';
import { X, Heart, Send, MoreHorizontal } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Radius, colors } from '../../theme/tokens';
import { ImageWithFallback } from '../figma/ImageWithFallback';

const { width, height } = Dimensions.get('window');

// --- Single story slide (one image) ---
const StorySlide = ({
    storyItem,
    author,
    isActive,
    totalItems,
    currentIndex,
    onClose,
    onNext,
    onPrev,
    onNavigateProfile,
}: {
    storyItem: any;
    author: any;
    isActive: boolean;
    totalItems: number;
    currentIndex: number;
    onClose: () => void;
    onNext: () => void;
    onPrev: () => void;
    onNavigateProfile: () => void;
}) => {
    const [progress] = useState(new Animated.Value(0));
    const [isPaused, setIsPaused] = useState(false);
    const [message, setMessage] = useState('');
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    
    const { user: authUser, sessionToken } = useAuth();
    const { show } = useToast();
    const toggleLike = useMutation(api.social.toggleLike);
    const deleteStory = useMutation(api.social.deleteStory);
    const sendDirectMessage = useMutation(api.social.sendDirectMessage);
    const createChat = useMutation(api.social.createChat);
    
    const isMyStory = authUser && author?.userId === (authUser as any).id;

    useEffect(() => {
        if (!isActive || isPaused || !storyItem) return;
        progress.setValue(0);
        const duration = (storyItem.durationSec || 5) * 1000;
        const anim = Animated.timing(progress, {
            toValue: 1,
            duration,
            useNativeDriver: false,
        });
        anim.start(({ finished }) => { if (finished) onNext(); });
        return () => { progress.stopAnimation(); };
    }, [isActive, isPaused, storyItem?._id, currentIndex]);

    if (!storyItem) return null;

    const imageUrl = storyItem.imageUrl || storyItem.url || '';
    const displayName = author?.displayName || author?.username || '?';
    const avatarUrl = author?.avatar || '';
    const timeLabel = storyItem.createdAt
        ? new Date(storyItem.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <View style={styles.slideContainer}>
            <ImageWithFallback src={imageUrl} style={styles.image} resizeMode="contain" />
            <LinearGradient
                colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
                pointerEvents="none"
            />
            
            {/* Tap gestures: Absolute fill over the image, but under Header/Footer. We put it here so it doesn't block SafeAreaView clicks if we just use absolute fill */}
            <View style={styles.tapContainer}>
                <TouchableOpacity
                    style={styles.tapLeft}
                    onPress={onPrev}
                    onLongPress={() => setIsPaused(true)}
                    onPressOut={() => setIsPaused(false)}
                    delayLongPress={200}
                />
                <TouchableOpacity
                    style={styles.tapRight}
                    onPress={onNext}
                    onLongPress={() => setIsPaused(true)}
                    onPressOut={() => setIsPaused(false)}
                    delayLongPress={200}
                />
            </View>

            <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                {/* Progress bar */}
                <View style={styles.progressContainer}>
                    {Array.from({ length: totalItems }).map((_, idx) => (
                        <View key={idx} style={styles.progressBarBg}>
                            {idx === currentIndex ? (
                                <Animated.View
                                    style={[styles.progressBarFill, {
                                        width: progress.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0%', '100%'],
                                        }),
                                    }]}
                                />
                            ) : (
                                <View style={[styles.progressBarFill, { width: idx < currentIndex ? '100%' : '0%' }]} />
                            )}
                        </View>
                    ))}
                </View>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.userInfo} onPress={onNavigateProfile}>
                        <Avatar style={styles.avatar}>
                            <AvatarImage src={avatarUrl} />
                            <AvatarFallback>{displayName[0]}</AvatarFallback>
                        </Avatar>
                        <Text style={styles.userName}>{displayName}</Text>
                        <Text style={styles.time}>{timeLabel}</Text>
                    </TouchableOpacity>
                    
                    <View style={styles.headerActions}>
                        {isMyStory && (
                            <TouchableOpacity 
                                onPress={() => {
                                    setIsPaused(true);
                                    Alert.alert('Eliminar historia', '¿Estás seguro que deseas eliminar esta historia?', [
                                        { text: 'Cancelar', onPress: () => setIsPaused(false), style: 'cancel' },
                                        { text: 'Eliminar', style: 'destructive', onPress: async () => {
                                            try {
                                                await deleteStory({ storyId: storyItem._id, sessionToken });
                                                show('Historia eliminada', 'success');
                                                onNext();
                                            } catch (e: any) {
                                                show(e.message, 'error');
                                            }
                                            setIsPaused(false);
                                        }}
                                    ]);
                                }} 
                                style={styles.iconBtn}
                            >
                                <MoreHorizontal size={24} color="#fff" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Footer actions */}
                <View style={styles.footer}>
                    {!isMyStory && (
                        <View style={styles.inputContainer}>
                            <TextInput
                                placeholder="Envía un mensaje..."
                                placeholderTextColor="rgba(255,255,255,0.7)"
                                style={styles.input}
                                value={message}
                                onChangeText={setMessage}
                                onFocus={() => setIsPaused(true)}
                                onBlur={() => setIsPaused(false)}
                                onSubmitEditing={async () => {
                                    if (!message.trim()) return;
                                    try {
                                        const chatId = await createChat({ sessionToken, participantId: author.userId });
                                        await sendDirectMessage({
                                            sessionToken,
                                            chatId,
                                            body: `(Respondiendo a tu historia): ${message}`,
                                        });
                                        show('Mensaje enviado', 'success');
                                        setMessage('');
                                        setIsPaused(false);
                                    } catch (e: any) {
                                        show(e.message, 'error');
                                    }
                                }}
                            />
                        </View>
                    )}
                    <TouchableOpacity 
                        style={styles.actionBtn}
                        onPress={async () => {
                            try {
                                await toggleLike({ targetType: 'story', targetId: storyItem._id, sessionToken });
                                show('¡Te gusta esto!', 'success');
                            } catch (e) {
                                show('Error al dar me gusta', 'error');
                            }
                        }}
                    >
                        <Heart size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.actionBtn}
                        onPress={async () => {
                            setIsPaused(true);
                            try {
                                await Share.share({
                                    message: `Mira esta historia de ${author.displayName}: ${imageUrl}`,
                                });
                            } catch (e) {}
                            setIsPaused(false);
                        }}
                    >
                        <Send size={28} color="#fff" />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
};


// --- Main StoryViewer: receives a userId, fetches their stories from Convex ---
export const StoryViewer = ({
    storyId: userId,
    onClose,
    onNavigateProfile,
}: {
    storyId: string;
    onClose: () => void;
    onNavigateProfile: (userId: string) => void;
}) => {
    const { sessionToken } = useAuth();

    const storyGroups = useQuery(
        api.social.getStoriesForFollowing,
        sessionToken ? { sessionToken } : 'skip'
    ) ?? [];

    const groupIndex = storyGroups.findIndex((g: any) => g.author?.userId === userId);
    const [activeGroupIdx, setActiveGroupIdx] = useState(groupIndex >= 0 ? groupIndex : 0);
    const [activeStoryIdx, setActiveStoryIdx] = useState(0);

    useEffect(() => {
        const idx = storyGroups.findIndex((g: any) => g.author?.userId === userId);
        if (idx >= 0) setActiveGroupIdx(idx);
    }, [userId, storyGroups.length]);

    const currentGroup = storyGroups[activeGroupIdx];
    const stories = currentGroup?.stories ?? [];
    const author = currentGroup?.author;
    const currentStory = stories[activeStoryIdx];
    const viewStoryMut = useMutation(api.social.viewStory);

    useEffect(() => {
        const id = currentStory?._id;
        if (!id || !sessionToken) return;
        viewStoryMut({
            sessionToken,
            storyId: id as any,
        }).catch(() => {});
    }, [currentStory?._id, sessionToken, viewStoryMut]);

    const handleNext = () => {
        if (activeStoryIdx < stories.length - 1) {
            setActiveStoryIdx(prev => prev + 1);
        } else if (activeGroupIdx < storyGroups.length - 1) {
            setActiveGroupIdx(prev => prev + 1);
            setActiveStoryIdx(0);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (activeStoryIdx > 0) {
            setActiveStoryIdx(prev => prev - 1);
        } else if (activeGroupIdx > 0) {
            setActiveGroupIdx(prev => prev - 1);
            const prevGroup = storyGroups[activeGroupIdx - 1];
            setActiveStoryIdx((prevGroup?.stories?.length ?? 1) - 1);
        } else {
            onClose();
        }
    };

    if (!currentGroup || stories.length === 0) return null;

    return (
        <Modal animationType="slide" visible={true} transparent={false} onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'black' }}>
                <StorySlide
                    storyItem={currentStory}
                    author={author}
                    isActive={true}
                    totalItems={stories.length}
                    currentIndex={activeStoryIdx}
                    onClose={onClose}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onNavigateProfile={() => {
                        onClose();
                        onNavigateProfile(author?.userId);
                    }}
                />
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
    progressBarBg: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: Radius.sm, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fff' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 12 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 32, height: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
    userName: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
        ...Platform.select({
            web: { textShadow: '0px 0px 4px rgba(0,0,0,0.5)' } as any,
            default: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }
        })
    },
    time: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '400' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { padding: 4 },

    footer: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 16 },
    inputContainer: { flex: 1, height: 48, borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
    input: { color: '#fff', fontSize: 16 },
    actionBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },

    tapContainer: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
    tapLeft: { width: width * 0.3, height: '100%' },
    tapRight: { width: width * 0.7, height: '100%' },
});
