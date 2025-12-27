import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions, Animated, StatusBar, Platform } from 'react-native';
import { useSocial, CommercialProduct, Post as PostType } from '../../contexts/SocialContext';
import { ArrowLeft, MapPin, ShoppingBag, Heart, MessageCircle, CheckCircle2, MoreHorizontal, Grid, List, ShoppingCart } from 'lucide-react-native';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Post } from './Post';
import { InstagramPost } from './InstagramPost';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');
const COVER_HEIGHT = 200;

interface UserProfileProps {
    userId: string;
    onBack: () => void;
}

export const UserProfile = ({ userId, onBack }: UserProfileProps) => {
    const { getUserById, getPostsByUser, getInstagramPostsByUser, getHighlightsByUser, getCommercialItemsByUser, currentUser, isFollowing, followUser, unfollowUser } = useSocial();
    const user = getUserById(userId);
    const userPosts = getPostsByUser(userId);
    const instagramPosts = getInstagramPostsByUser(userId);
    const highlights = getHighlightsByUser(userId);
    const commercialItems = getCommercialItemsByUser(userId);
    const [isUserFollowing, setIsUserFollowing] = useState(() => isFollowing(userId));
    const [activeTab, setActiveTab] = useState<'posts' | 'instagram' | 'commercial'>('posts');

    const scrollY = useRef(new Animated.Value(0)).current;

    if (!user) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.errorText}>Usuario no encontrado</Text>
            </View>
        );
    }

    const isCurrentUser = user.id === currentUser.id;

    const handleFollow = () => {
        if (isUserFollowing) {
            unfollowUser(user.id);
            setIsUserFollowing(false);
        } else {
            followUser(user.id);
            setIsUserFollowing(true);
        }
    };

    // Header Animation
    const headerOpacity = scrollY.interpolate({
        inputRange: [0, COVER_HEIGHT - 100],
        outputRange: [0, 1],
        extrapolate: 'clamp'
    });

    const renderTabContent = () => {
        switch (activeTab) {
            case 'posts':
                return (
                    <View style={styles.postsContainer}>
                        {userPosts.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No hay publicaciones aún</Text>
                            </View>
                        ) : (
                            userPosts.map((post) => (
                                <View key={post.id} style={styles.postWrapper}>
                                    <Post post={post} onUserClick={() => { }} />
                                </View>
                            ))
                        )}
                    </View>
                );
            case 'instagram':
                return (
                    <View style={styles.gridContainer}>
                        {instagramPosts.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No hay fotos</Text>
                            </View>
                        ) : (
                            instagramPosts.map((post) => (
                                <View key={post.id} style={styles.gridItemWrapper}>
                                    <InstagramPost post={post} />
                                </View>
                            ))
                        )}
                    </View>
                );
            case 'commercial':
                return (
                    <View style={styles.commercialContainer}>
                        {commercialItems.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No hay productos en tienda</Text>
                            </View>
                        ) : (
                            commercialItems.map((item) => (
                                <TouchableOpacity key={item.id} activeOpacity={0.9} style={styles.productCard}>
                                    <Image source={{ uri: item.image }} style={styles.productImage} />
                                    <View style={styles.productInfo}>
                                        <View>
                                            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                                            <Text style={styles.productCategory}>Tienda Oficial</Text>
                                        </View>
                                        <View style={styles.productFooter}>
                                            <Text style={styles.productPrice}>${item.price}</Text>
                                            <TouchableOpacity style={styles.addButton}>
                                                <Text style={styles.addButtonText}>Ver</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                );
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Fixed Header */}
            <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
                <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>{user.name}</Text>
                </View>
            </Animated.View>

            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <BlurView intensity={50} tint="dark" style={styles.iconBlur}>
                    <ArrowLeft size={20} color="#fff" />
                </BlurView>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreButton}>
                <BlurView intensity={50} tint="dark" style={styles.iconBlur}>
                    <MoreHorizontal size={20} color="#fff" />
                </BlurView>
            </TouchableOpacity>

            <Animated.ScrollView
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true }
                )}
                scrollEventThrottle={16}
            >
                {/* Cover & Avatar */}
                <View style={styles.coverContainer}>
                    <Image
                        source={{ uri: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80' }}
                        style={styles.coverImage}
                    />
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.6)']}
                        style={styles.coverGradient}
                    />
                </View>

                <View style={styles.profileBody}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarContainer}>
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                            </Avatar>
                        </View>
                        {!isCurrentUser && (
                            <View style={styles.actionsContainer}>
                                <TouchableOpacity style={styles.messageButton}>
                                    <MessageCircle size={20} color="#374151" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.followButton, isUserFollowing && styles.followingButton]}
                                    onPress={handleFollow}
                                >
                                    <Text style={[styles.followButtonText, isUserFollowing && styles.followingButtonText]}>
                                        {isUserFollowing ? 'Siguiendo' : 'Seguir'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Info */}
                    <View style={styles.infoContainer}>
                        <View style={styles.nameRow}>
                            <Text style={styles.displayName}>{user.name}</Text>
                            {user.verified && <CheckCircle2 size={18} color="#3B82F6" style={{ marginLeft: 6 }} />}
                        </View>
                        <Text style={styles.username}>@{user.username}</Text>
                        <Text style={styles.bio}>{user.bio}</Text>

                        {/* Stats */}
                        <View style={styles.statsRow}>
                            <TouchableOpacity style={styles.statItem}>
                                <Text style={styles.statValue}>{user.following}</Text>
                                <Text style={styles.statLabel}>Siguiendo</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statItem}>
                                <Text style={styles.statValue}>{user.followers}</Text>
                                <Text style={styles.statLabel}>Seguidores</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Highlights */}
                    {highlights.length > 0 && (
                        <View style={styles.highlightsSection}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsContent}>
                                {highlights.map((h) => (
                                    <TouchableOpacity key={h.id} style={styles.highlightItem}>
                                        <View style={styles.highlightCircle}>
                                            <View style={styles.highlightInnerParams}>
                                                <Image source={{ uri: h.coverImage }} style={styles.highlightImage} />
                                            </View>
                                        </View>
                                        <Text style={styles.highlightTitle} numberOfLines={1}>{h.title}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Tabs */}
                    <View style={styles.tabsContainer}>
                        <TouchableOpacity onPress={() => setActiveTab('posts')} style={[styles.tab, activeTab === 'posts' && styles.activeTab]}>
                            <List size={20} color={activeTab === 'posts' ? '#7C3AED' : '#9CA3AF'} />
                            <Text style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('instagram')} style={[styles.tab, activeTab === 'instagram' && styles.activeTab]}>
                            <Grid size={20} color={activeTab === 'instagram' ? '#7C3AED' : '#9CA3AF'} />
                            <Text style={[styles.tabText, activeTab === 'instagram' && styles.activeTabText]}>Galería</Text>
                        </TouchableOpacity>
                        {user.isInfluencer && (
                            <TouchableOpacity onPress={() => setActiveTab('commercial')} style={[styles.tab, activeTab === 'commercial' && styles.activeTab]}>
                                <ShoppingBag size={20} color={activeTab === 'commercial' ? '#7C3AED' : '#9CA3AF'} />
                                <Text style={[styles.tabText, activeTab === 'commercial' && styles.activeTabText]}>Tienda</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Content */}
                    <View style={styles.contentContainer}>
                        {renderTabContent()}
                    </View>
                </View>
            </Animated.ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: '#6B7280' },

    // Header
    header: { position: 'absolute', top: 0, left: 0, right: 0, height: Platform.OS === 'ios' ? 100 : 80, zIndex: 10, justifyContent: 'flex-end', paddingBottom: 12, overflow: 'hidden' },
    headerContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 50 },
    headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
    backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 40, left: 16, zIndex: 20 },
    moreButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 40, right: 16, zIndex: 20 },
    iconBlur: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

    // Cover
    coverContainer: { height: COVER_HEIGHT, width: '100%' },
    coverImage: { width: '100%', height: '100%' },
    coverGradient: { ...StyleSheet.absoluteFillObject },

    // Body
    profileBody: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30, paddingBottom: 40 },

    profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: -45 },
    avatarContainer: { borderWidth: 4, borderColor: '#fff', borderRadius: 50, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    avatar: { width: 90, height: 90, borderRadius: 45 },

    actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    messageButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
    followButton: { backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24, shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    followingButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', shadowOpacity: 0 },
    followButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    followingButtonText: { color: '#374151', fontWeight: '600' },

    // Info
    infoContainer: { paddingHorizontal: 20, marginTop: 16 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    displayName: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
    username: { fontSize: 15, color: '#6B7280', marginTop: 2, fontWeight: '500' },
    bio: { fontSize: 15, color: '#374151', marginTop: 12, lineHeight: 22 },

    statsRow: { flexDirection: 'row', marginTop: 20, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F3F4F6' },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statValue: { fontWeight: '800', fontSize: 16, color: '#111827' },
    statLabel: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
    statDivider: { width: 1, height: '60%', backgroundColor: '#E5E7EB', marginHorizontal: 20, alignSelf: 'center' },

    // Highlights
    highlightsSection: { marginTop: 20 },
    highlightsContent: { paddingHorizontal: 20 },
    highlightItem: { marginRight: 20, alignItems: 'center', width: 72 },
    highlightCircle: { width: 68, height: 68, borderRadius: 34, padding: 2, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 6 },
    highlightInnerParams: { flex: 1, borderRadius: 32, overflow: 'hidden', padding: 2, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3F4F6' },
    highlightImage: { width: '100%', height: '100%', borderRadius: 32 },
    highlightTitle: { fontSize: 11, color: '#374151', fontWeight: '500', textAlign: 'center' },

    // Tabs
    tabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginTop: 24, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 4, marginBottom: 16 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
    activeTab: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
    activeTabText: { color: '#7C3AED' },

    // Content
    contentContainer: { minHeight: 400 },
    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: '#9CA3AF', fontSize: 14 },

    postsContainer: { paddingHorizontal: 0 },
    postWrapper: { marginBottom: 8, borderBottomWidth: 8, borderBottomColor: '#F3F4F6' },

    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', paddingHorizontal: 1 },
    gridItemWrapper: { padding: 1 },

    commercialContainer: { padding: 16, gap: 12 },
    productCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
    productImage: { width: 100, height: 100, borderRadius: 16, backgroundColor: '#F3F4F6' },
    productInfo: { flex: 1, marginLeft: 16, justifyContent: 'space-between', paddingVertical: 4 },
    productName: { fontWeight: '700', fontSize: 15, color: '#1F2937', marginBottom: 4 },
    productCategory: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
    productFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    productPrice: { color: '#7C3AED', fontWeight: '800', fontSize: 18 },
    addButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 12 },
    addButtonText: { fontSize: 12, fontWeight: '700', color: '#374151' },
});
