import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, useWindowDimensions, Platform } from 'react-native';
import { Search, Plus as PlusIcon, Send, Film, List } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav } from '../components/MobileNav';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Post, ReelFeed, StoriesBar, StoryViewer, CreatePost, CreateStory, UserSearch, DirectMessages } from '../components/social';

import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { Radius, colors, glassShadow } from '../theme/tokens';
import { glassSurface } from '../utils/glass';


export default function SocialScreen({ navigation, onMenuPress, isTabMode }: any) {
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const { sessionToken } = useAuth();
    const { isDesktop } = useResponsive();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [activeTab, setActiveTab] = useState<'feed' | 'reels'>('feed');
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [showCreateStory, setShowCreateStory] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showMessages, setShowMessages] = useState(false);

    // ponytail: Direct queries
    const postsResult = useQuery(api.social.getFeed, sessionToken ? { limit: 20, sessionToken } : 'skip');
    const posts = postsResult?.items || [];
    
    const feedPosts = posts.filter((p: any) => p.type !== 'video');
    const reelPosts = posts.filter((p: any) => p.type === 'video');

    const handleUserClick = (userId: string) => console.log('user clicked', userId);

    const renderTabs = () => (
        <View style={styles.tabContainer}>
            <View style={[styles.tabSegment, glassSurface(isDark, 'subtle')]}>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'feed' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('feed')}
                >
                    <List size={18} color={activeTab === 'feed' ? (isDark ? '#fff' : '#000') : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>Feed</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'reels' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('reels')}
                >
                    <Film size={18} color={activeTab === 'reels' ? (isDark ? '#fff' : '#000') : '#6B7280'} />
                    <Text style={[styles.tabText, activeTab === 'reels' && styles.tabTextActive]}>Reels</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

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
                        }} 
                    />
                ) : undefined
            }
        >
            <LinearGradient colors={isDark ? ['#09090B', '#000'] : ['#FAFAFA', '#F3F4F6']} style={StyleSheet.absoluteFill} />

            <MobileHeader
                title="Social"
                subtitle="Conecta con la comunidad"
                onMenuPress={onMenuPress}
                actions={
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSearch(true)}>
                            <Search size={20} color={isDark ? '#fff' : "#111827"} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMessages(true)}>
                            <Send size={20} color={isDark ? '#fff' : "#111827"} />
                        </TouchableOpacity>
                    </View>
                }
            />
            
            {renderTabs()}

            {activeTab === 'feed' ? (
                <FlatList
                    data={feedPosts}
                    keyExtractor={(item) => item._id || item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    renderItem={({ item }) => <Post post={item} onUserClick={handleUserClick} />}
                    ListHeaderComponent={
                        <>
                            <StoriesBar 
                                onStoryClick={(id) => setSelectedStoryId(id)}
                                onAddStory={() => setShowCreateStory(true)} 
                            />
                            <TouchableOpacity style={styles.createPostBar} onPress={() => setShowCreatePost(true)}>
                                <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>R</Text></View>
                                <View style={styles.cpInput}><Text style={styles.cpText}>¿Qué estás pensando?</Text></View>
                                <PlusIcon size={20} color={isDark ? '#fff' : "#000"} />
                            </TouchableOpacity>
                        </>
                    }
                    ListEmptyComponent={
                        <Text style={{textAlign: 'center', color: 'gray', marginTop: 40}}>No hay publicaciones aún.</Text>
                    }
                />
            ) : (
                <View style={styles.reelsContainer}>
                    {reelPosts.length > 0 ? (
                        <ReelFeed posts={reelPosts} onUserClick={handleUserClick} />
                    ) : (
                        <View style={styles.emptyReels}>
                            <Film size={48} color={isDark ? '#374151' : '#D1D5DB'} />
                            <Text style={styles.emptyReelsText}>No hay reels disponibles</Text>
                        </View>
                    )}
                </View>
            )}

            {activeTab === 'feed' && (
                <TouchableOpacity style={styles.fab} onPress={() => setShowCreatePost(true)}>
                    <LinearGradient colors={['#4FC3F7', '#29B6F6']} style={styles.fabGradient}>
                        <PlusIcon size={24} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            )}

            {selectedStoryId && (
                <StoryViewer 
                    storyId={selectedStoryId} 
                    onClose={() => setSelectedStoryId(null)} 
                    onNavigateProfile={handleUserClick} 
                />
            )}

            {!isTabMode && !isDesktop && (
                <MobileNav
                    activeSection="social"
                    onSectionChange={(section) => {
                        if (section === 'home') navigation.navigate('Home');
                        else if (section === 'marketplace') navigation.navigate('Marketplace');
                    }}
                />
            )}

            {showCreatePost && <CreatePost onClose={() => setShowCreatePost(false)} />}
            {showCreateStory && <CreateStory onClose={() => setShowCreateStory(false)} />}
            {showSearch && <UserSearch onClose={() => setShowSearch(false)} onUserSelect={handleUserClick} />}
            {showMessages && <DirectMessages onClose={() => setShowMessages(false)} />}
        </ResponsiveLayout>
    );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: { flex: 1 },
    headerActions: { flexDirection: 'row', gap: 12 },
    iconBtn: { padding: 8, backgroundColor: colors(isDark).glass, borderRadius: Radius.full, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
    
    tabContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
    },
    tabSegment: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: Radius.full,
        width: '100%',
        maxWidth: 400,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: Radius.full,
        gap: 6,
    },
    tabButtonActive: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#fff',
        ...glassShadow(isDark),
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    tabTextActive: {
        color: isDark ? '#fff' : '#000',
    },

    createPostBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors(isDark).glass, padding: 12, borderRadius: Radius.xl, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: isDark ? '#374151' : '#E5E5E5', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#9CA3AF' : '#666' },
    cpInput: { flex: 1, backgroundColor: colors(isDark).glass, height: 36, borderRadius: Radius.full, justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent' },
    cpText: { color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 13 },
    
    reelsContainer: {
        flex: 1,
        backgroundColor: '#000',
        borderRadius: isDark ? Radius.xl : 0,
        overflow: 'hidden',
    },
    emptyReels: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    emptyReelsText: {
        color: isDark ? '#9CA3AF' : '#6B7280',
        fontSize: 16,
    },

    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 100 : 80,
        right: 20,
        ...glassShadow(isDark),
    },
    fabGradient: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    }
});