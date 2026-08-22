import React, { useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, ActivityIndicator, Image, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { useSocialFeed } from '../../hooks/useSocialFeed';
import { Post } from './Post';
import { useNavigation } from '@react-navigation/native';
import { Grid, List, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { pushUserProfile } from '../../navigation/openUserProfile';

interface SocialProfileFeedProps {
    authorUserId: string;
    externalHeader?: React.ReactNode;
}

const { width } = Dimensions.get('window');
const GRID_IMG_SIZE = width / 3;

export const SocialProfileFeed: React.FC<SocialProfileFeedProps> = ({ authorUserId, externalHeader }) => {
    const { posts, isLoadingFirstPage, loadMore, refresh } = useSocialFeed({ authorUserId, pageSize: 50 });
    const navigation = useNavigation<any>();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const [activeTab, setActiveTab] = useState<'grid' | 'list'>('grid');
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

    // Filter posts that have valid images for the grid
    const photoPosts = useMemo(() => {
        return posts.filter((p: any) => 
            p.images && 
            p.images.length > 0 && 
            !p.images[0].startsWith('blob:') && 
            !p.images[0].startsWith('file:')
        );
    }, [posts]);

    const handleUserClick = (userId: string) => {
        if (userId !== authorUserId) {
            pushUserProfile(navigation, userId);
        }
        setSelectedPostId(null);
    };

    const handleGridItemPress = (postId: string) => {
        setSelectedPostId(postId);
    };

    const renderGridItem = ({ item }: { item: any }) => {
        return (
            <TouchableOpacity 
                style={[styles.gridItemContainer, { borderColor: isDark ? '#000' : '#FFF', borderWidth: 1 }]}
                activeOpacity={0.8}
                onPress={() => handleGridItemPress(String(item._id))}
            >
                <Image 
                    source={{ uri: item.images[0] }} 
                    style={styles.gridImage} 
                    resizeMode="cover"
                />
            </TouchableOpacity>
        );
    };

    // The modal that opens when a grid item is clicked, showing a scrollable list starting from that item
    const renderPostModal = () => {
        if (!selectedPostId) return null;
        
        // Find the index of the selected post in the photoPosts array to slice it
        // Or we can just show the normal feed but we can't easily jump to index without getItemLayout.
        // A simple trick is to re-order the array so the clicked post is first, 
        // OR filter the posts to start from the clicked post downwards!
        const startIndex = posts.findIndex(p => String(p._id) === selectedPostId);
        const modalPosts = startIndex >= 0 ? posts.slice(startIndex) : posts;

        return (
            <Modal
                visible={selectedPostId !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setSelectedPostId(null)}
            >
                <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}>
                    <View style={[styles.modalHeader, { borderBottomColor: isDark ? '#374151' : '#E5E7EB' }]}>
                        <TouchableOpacity style={styles.modalBackBtn} onPress={() => setSelectedPostId(null)}>
                            <ChevronLeft size={28} color={isDark ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#000' }]}>Publicaciones</Text>
                        <View style={{ width: 40 }} />
                    </View>
                    <FlatList
                        data={modalPosts}
                        keyExtractor={(item) => String(item._id)}
                        renderItem={({ item }) => (
                            <View style={styles.postWrapper}>
                                <Post post={item} onUserClick={handleUserClick} />
                            </View>
                        )}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        onEndReached={loadMore}
                        onEndReachedThreshold={0.5}
                    />
                </SafeAreaView>
            </Modal>
        );
    };

    if (isLoadingFirstPage) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#4F46E5" />
            </View>
        );
    }

    if (posts.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 16 }}>Aún no hay publicaciones</Text>
            </View>
        );
    }

    const renderCombinedHeader = () => (
        <View>
            {externalHeader}
            <View style={[styles.tabsRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'grid' && styles.activeTabButton]} 
                    onPress={() => setActiveTab('grid')}
                >
                    <Grid size={24} color={activeTab === 'grid' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tabButton, activeTab === 'list' && styles.activeTabButton]} 
                    onPress={() => setActiveTab('list')}
                >
                    <List size={26} color={activeTab === 'list' ? (isDark ? '#FFF' : '#000') : '#9CA3AF'} />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {activeTab === 'grid' ? (
                <FlatList
                    key="grid-view"
                    ListHeaderComponent={renderCombinedHeader}
                    data={photoPosts}
                    keyExtractor={(item) => String(item._id)}
                    renderItem={renderGridItem}
                    numColumns={3}
                    contentContainerStyle={styles.gridContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 16 }}>No hay fotos</Text>
                        </View>
                    }
                />
            ) : (
                <FlatList
                    key="list-view"
                    ListHeaderComponent={renderCombinedHeader}
                    data={posts}
                    keyExtractor={(item) => String(item._id)}
                    renderItem={({ item }) => (
                        <View style={styles.postWrapper}>
                            <Post post={item} onUserClick={handleUserClick} />
                        </View>
                    )}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                />
            )}

            {renderPostModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    tabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        borderBottomWidth: 1,
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTabButton: {
        borderBottomColor: '#4F46E5', // or theme dependent
    },
    gridContent: {
        paddingBottom: 100,
    },
    listContent: {
        paddingBottom: 100,
    },
    gridItemContainer: {
        width: GRID_IMG_SIZE,
        height: GRID_IMG_SIZE,
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    postWrapper: {
        marginBottom: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    modalBackBtn: {
        padding: 8,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    }
});
