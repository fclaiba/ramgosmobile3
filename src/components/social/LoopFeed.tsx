import React, { useMemo, useState } from 'react';
import { View, FlatList, useWindowDimensions, StyleSheet } from 'react-native';
import { LoopItem } from './LoopItem';
import { useVideoPlayerPool } from '../../hooks/useVideoPlayerPool';
import type { SocialFeedPost } from './types';

interface LoopFeedProps {
    posts: SocialFeedPost[];
    onUserClick: (id: string) => void;
    onEndReached?: () => void;
    onCommercePress?: (listingId: string, postId: string) => void;
    /** Alto de cada item para el paging (`getItemLayout`). Default: pantalla
     *  completa (tab Reels). El tab "Loops" de una comunidad (B2) vive
     *  debajo de un header+tabs, así que le pasa el alto real de su
     *  contenedor — si no, el paging calcularía contra la pantalla entera y
     *  desalinearía el swipe contra un contenedor más chico. */
    itemHeight?: number;
}

export const LoopFeed = ({ posts, onUserClick, onEndReached, onCommercePress, itemHeight }: LoopFeedProps) => {
    const { height: windowHeight, width } = useWindowDimensions();
    const height = itemHeight ?? windowHeight;
    const [activeIndex, setActiveIndex] = useState(0);

    // Pool de 3 reproductores compartidos por todo el feed — ver
    // `useVideoPlayerPool` para el porqué. `posts` cambia de referencia en
    // cada refetch aunque el contenido sea el mismo; el propio hook ya
    // deduplica el `replaceAsync`, así que no hace falta memoizar más.
    const videoUrls = useMemo(() => posts.map((p: any) => p.videoUrl), [posts]);
    const getPlayer = useVideoPlayerPool(videoUrls, activeIndex);

    const onViewableItemsChanged = React.useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index);
        }
    }).current;

    const viewabilityConfig = React.useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    return (
        <View style={styles.container}>
            <FlatList
                data={posts}
                keyExtractor={(item) => String(item._id ?? item.id)}
                renderItem={({ item, index }) => (
                    <LoopItem
                        post={item}
                        isActive={activeIndex === index}
                        player={getPlayer(index)}
                        onUserClick={onUserClick}
                        onCommercePress={onCommercePress}
                        itemHeight={height}
                    />
                )}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.5}
                // Subtract tab bar height approximately (adjust as needed in app context)
                getItemLayout={(data, index) => (
                    {length: height, offset: height * index, index}
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
});
