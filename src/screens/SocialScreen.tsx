import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Image, useWindowDimensions, FlatList } from 'react-native';
import { Search, Plus as PlusIcon, Heart, Send, Users, Sparkles, Flame, Award, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav } from '../components/MobileNav';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

import { useSocial, Post as PostType, InstagramPost as IGPostType } from '../contexts/SocialContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Existing Components
// Social Components
import {
    StoriesBar,
    UserProfile,
    CreatePost,
    CreateStory,
    StoryViewer,
    Post,
    UserSearch,
    DirectMessages,
    InstagramPost,
    CreateInstagramPost
} from '../components/social';

import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';

export default function SocialScreen({ navigation, onMenuPress, isTabMode }: any) {
    const { width } = useWindowDimensions();
    const { posts, instagramPosts, trendingTopics, suggestedUsers, communityGroups, followUser, isFollowing, joinGroup, leaveGroup } = useSocial();
    const { requireAuth } = useAuth();
    const { colorScheme } = useTheme();
    const { isDesktop } = useResponsive();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // State
    const [activeTab, setActiveTab] = useState<'feed' | 'trending' | 'community'>('feed');
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [showCreateStory, setShowCreateStory] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const [viewingStory, setViewingStory] = useState<string | null>(null);
    const [viewingProfile, setViewingProfile] = useState<string | null>(null);
    const [tabsWidth, setTabsWidth] = useState(width - 32); // Fallback to window width
    const tabAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(tabAnim, {
            toValue: activeTab === 'feed' ? 0 : activeTab === 'trending' ? 1 : 2,
            useNativeDriver: true,
        }).start();
    }, [activeTab]);

    // Handlers
    const safeAction = (action: () => void) => {
        // Here we could check requireAuth
        action();
    };

    const handleUserClick = (userId: string) => setViewingProfile(userId);
    const handleStoryClick = (id: string) => setViewingStory(id);
    const handleCreatePost = () => safeAction(() => setShowCreatePost(true));
    const handleCreateStory = () => safeAction(() => setShowCreateStory(true));
    const handleOpenMessages = () => safeAction(() => setShowMessages(true));

    // Render Helpers
    if (viewingProfile) return <UserProfile userId={viewingProfile} onBack={() => setViewingProfile(null)} />;
    if (showMessages) return <DirectMessages onClose={() => setShowMessages(false)} />;

    return (
        <ResponsiveLayout 
            style={styles.container}
            sidebar={
                !isTabMode ? (
                    <DesktopSidebar 
                        activeSection="social" 
                        onSectionChange={(section) => {
                            if (section === 'home') navigation.navigate('Home');
                            else if (section === 'marketplace') navigation.navigate('Marketplace');
                            else if (section === 'dashboard') navigation.navigate('Home', { initialTab: 'dashboard' });
                        }} 
                    />
                ) : undefined
            }
        >
            <LinearGradient
                colors={isDark ? ['#111827', '#000'] : ['#F9FAFB', '#F3F4F6']}
                style={StyleSheet.absoluteFill}
            />

            <MobileHeader
                title="Social"
                subtitle="Conecta con la comunidad"
                onMenuPress={onMenuPress}
                actions={
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={handleOpenMessages} style={styles.iconBtn}>
                            <Send size={20} color={isDark ? '#fff' : "#111827"} />
                            <View style={styles.badge}><Text style={styles.badgeText}>3</Text></View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.iconBtn}>
                            <Search size={20} color={isDark ? '#fff' : "#111827"} />
                        </TouchableOpacity>
                    </View>
                }
            />

            {showSearch && (
                <View style={styles.searchArea}>
                    <UserSearch onUserSelect={handleUserClick} />
                </View>
            )}

            <View style={{ height: 100, backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)' }}>
                <StoriesBar onStoryClick={handleStoryClick} onAddStory={handleCreateStory} />
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <View 
                    style={styles.tabsBg}
                    onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
                >
                    <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('feed')}>
                        <Text style={[styles.tabText, activeTab === 'feed' && styles.activeTabText]}>Feed</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('trending')}>
                        <Text style={[styles.tabText, activeTab === 'trending' && styles.activeTabText]}>Trending</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('community')}>
                        <Text style={[styles.tabText, activeTab === 'community' && styles.activeTabText]}>Comunidad</Text>
                    </TouchableOpacity>

                    <Animated.View
                        style={[
                            styles.activeIndicator,
                            { width: (tabsWidth - 8) / 3 }, // 8px total padding (4px each side)
                            {
                                transform: [{
                                    translateX: tabAnim.interpolate({
                                        inputRange: [0, 1, 2],
                                        outputRange: [4, ((tabsWidth - 8) / 3) + 4, (((tabsWidth - 8) / 3) * 2) + 4]
                                    })
                                }]
                            }
                        ]}
                    />
                </View>
            </View>

            {/* FEED TAB */}
            {activeTab === 'feed' && (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    renderItem={({ item }) => <Post post={item} onUserClick={handleUserClick} />}
                    ListHeaderComponent={
                        <TouchableOpacity style={styles.createPostBar} onPress={handleCreatePost}>
                            <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>T</Text></View>
                            <View style={styles.cpInput}><Text style={styles.cpText}>¿Qué estás pensando?</Text></View>
                            <PlusIcon size={20} color={isDark ? '#fff' : "#000"} />
                        </TouchableOpacity>
                    }
                    ListFooterComponent={
                        instagramPosts && instagramPosts.length > 0 ? (
                            <View style={styles.igSection}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>Galería Destacada</Text>
                                    <TouchableOpacity><Text style={styles.seeAll}>Ver todas</Text></TouchableOpacity>
                                </View>
                                <View style={styles.grid3}>
                                    {instagramPosts.slice(0, 6).map((item: IGPostType) => (
                                        <TouchableOpacity key={item.id} style={[styles.igItem, { width: (width - 40) / 3, height: (width - 40) / 3 }]}>
                                            <ImageWithFallback src={item.image} style={styles.igImg} />
                                            <View style={styles.igOverlay}>
                                                <Heart size={12} color="#fff" />
                                                <Text style={styles.igText}>{item.likes}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        ) : null
                    }
                />
            )}

            {/* TRENDING TAB */}
            {activeTab === 'trending' && (
                <FlatList
                    data={trendingTopics}
                    keyExtractor={(item, idx) => `topic-${idx}`}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    ListHeaderComponent={
                        <View>
                            <LinearGradient colors={['#EA580C', '#DC2626', '#DB2777']} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                <View style={styles.heroHeader}>
                                    <View style={styles.heroIcon}><Flame size={24} color="#fff" /></View>
                                    <View>
                                        <Text style={styles.heroTitle}>Tendencias Hoy</Text>
                                        <Text style={styles.heroSub}>Lo más popular</Text>
                                    </View>
                                </View>
                                <View style={styles.heroStats}>
                                    <View style={styles.statBadge}><TrendingUp size={12} color="#fff" style={{ marginRight: 4 }} /><Text style={styles.statText}>+45%</Text></View>
                                    <View style={styles.statBadge}><Text style={styles.statText}>12.5K posts</Text></View>
                                </View>
                            </LinearGradient>
                            <Text style={styles.sectionTitle}>Temas Populares</Text>
                        </View>
                    }
                    renderItem={({ item, index }) => (
                        <TouchableOpacity style={styles.topicCard}>
                            <View style={styles.rankBadge}><Text style={styles.rankText}>#{index + 1}</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.topicTag}>#{item.tag}</Text>
                                <Text style={styles.topicCount}>{item.posts} publicaciones</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    ListFooterComponent={
                        <View>
                            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Usuarios Destacados</Text>
                            {suggestedUsers.map((user: any) => (
                                <View key={user.id} style={styles.userCard}>
                                    <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.userName}>{user.displayName}</Text>
                                            {user.verified && <View style={styles.verified}><Award size={8} color="#fff" /></View>}
                                        </View>
                                        <Text style={styles.userHandle}>@{user.username}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.followBtn} onPress={() => safeAction(() => followUser(user.id))}>
                                        <Text style={styles.followText}>Seguir</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    }
                />
            )}

            {/* COMMUNITY TAB */}
            {activeTab === 'community' && (
                <FlatList
                    data={communityGroups}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    ListHeaderComponent={
                        <View>
                            <LinearGradient colors={['#059669', '#0D9488', '#0891B2']} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                <View style={styles.heroHeader}>
                                    <View style={styles.heroIcon}><Users size={24} color="#fff" /></View>
                                    <View>
                                        <Text style={styles.heroTitle}>Comunidades</Text>
                                        <Text style={styles.heroSub}>Encuentra tu grupo</Text>
                                    </View>
                                </View>
                                <View style={styles.communityStats}>
                                    <View style={styles.cStat}><Text style={styles.cVal}>12</Text><Text style={styles.cLabel}>Grupos</Text></View>
                                    <View style={styles.cStat}><Text style={styles.cVal}>45K</Text><Text style={styles.cLabel}>Miembros</Text></View>
                                </View>
                            </LinearGradient>
                            <Text style={styles.sectionTitle}>Grupos Destacados</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.groupCard}>
                            <View style={styles.groupHeader}>
                                <ImageWithFallback src={item.image} style={styles.groupImg} />
                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
                                <View style={styles.groupInfo}>
                                    <View style={styles.catTag}><Text style={styles.catTagText}>{item.category}</Text></View>
                                    <Text style={styles.groupName}>{item.name}</Text>
                                    <Text style={styles.groupMembers}>{item.members} miembros • Público</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={[styles.groupBtn, item.joined && styles.joinedBtn]}
                                onPress={() => safeAction(() => item.joined ? leaveGroup(item.id) : joinGroup(item.id))}
                            >
                                <Text style={[styles.groupBtnText, item.joined && styles.joinedBtnText]}>
                                    {item.joined ? 'Salir del Grupo' : 'Unirse al Grupo'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={handleCreatePost}>
                <PlusIcon size={24} color="#fff" />
            </TouchableOpacity>

            {/* Modals */}
            {showCreatePost && <CreatePost onClose={() => setShowCreatePost(false)} />}
            {showCreateStory && <CreateStory onClose={() => setShowCreateStory(false)} />}
            {viewingStory && <StoryViewer storyId={viewingStory} onClose={() => setViewingStory(null)} onNavigateProfile={handleUserClick} />}
            {/* Navbar for Standalone Mode */}
            {!isTabMode && !isDesktop && (
                <MobileNav
                    activeSection="social"
                    onSectionChange={(section) => {
                        if (section === 'home') navigation.navigate('Home');
                        else if (section === 'marketplace') navigation.navigate('Marketplace');
                        else if (section === 'dashboard') navigation.navigate('Home', { initialTab: 'dashboard' });
                    }}
                />
            )}
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    headerActions: { flexDirection: 'row', gap: 12 },
    iconBtn: { padding: 8, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 12 },
    badge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#8B5CF6', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    searchArea: { padding: 16, backgroundColor: isDark ? '#1F2937' : '#fff', borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#f0f0f0' },

    // Tabs
    tabsContainer: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' },
    tabsBg: { flexDirection: 'row', backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 16, padding: 4, height: 44, position: 'relative' },
    tab: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
    activeIndicator: { position: 'absolute', top: 4, bottom: 4, backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '500', color: isDark ? '#9CA3AF' : '#6B7280' },
    activeTabText: { color: isDark ? '#F9FAFB' : '#111827', fontWeight: '600' },

    // Feed
    createPostBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 12, borderRadius: 16, marginBottom: 16, gap: 12 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? '#374151' : '#E5E5E5', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#9CA3AF' : '#666' },
    cpInput: { flex: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', height: 36, borderRadius: 18, justifyContent: 'center', paddingHorizontal: 16 },
    cpText: { color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 13 },

    igSection: { marginTop: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    seeAll: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },
    grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    igItem: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
    igImg: { width: '100%', height: '100%' },
    igOverlay: { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', gap: 4 },
    igText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

    // Trending
    heroCard: { borderRadius: 24, padding: 24, marginBottom: 24 },
    heroHeader: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 20 },
    heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    heroTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
    heroStats: { flexDirection: 'row', gap: 8 },
    statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    topicCard: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center', gap: 16 },
    rankBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#FFF7ED', justifyContent: 'center', alignItems: 'center' },
    rankText: { fontSize: 16, fontWeight: 'bold', color: '#EA580C' },
    topicTag: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    topicCount: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },

    userCard: { flexDirection: 'row', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 12, borderRadius: 16, marginBottom: 12, alignItems: 'center', gap: 12 },
    userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? '#374151' : '#E5E5E5' },
    userName: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
    verified: { marginLeft: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
    userHandle: { fontSize: 12, color: isDark ? '#9CA3AF' : '#6B7280' },
    followBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#374151' : '#E5E7EB' },
    followText: { fontSize: 12, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },

    // Community
    communityStats: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 12, alignItems: 'center' },
    cVal: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    cLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },

    groupCard: { backgroundColor: isDark ? '#1F2937' : '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
    groupHeader: { height: 140 },
    groupImg: { width: '100%', height: '100%' },
    groupInfo: { position: 'absolute', bottom: 12, left: 12, right: 12 },
    catTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
    catTagText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    groupName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
    groupMembers: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
    groupBtn: { margin: 12, backgroundColor: isDark ? '#111827' : '#111827', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    groupBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    joinedBtn: { backgroundColor: isDark ? '#374151' : '#F3F4F6' },
    joinedBtnText: { color: isDark ? '#F9FAFB' : '#111827' },

    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center', shadowColor: '#8B5CF6', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    modalHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#fff' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    closeText: { color: '#4F46E5', fontSize: 16 },
    modalContent: { flex: 1, padding: 16 }
});
