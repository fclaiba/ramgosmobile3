import React, { useState } from 'react';
import { View, FlatList, Dimensions, StyleSheet } from 'react-native';
import { LoopItem } from './LoopItem';
import { Post as PostType } from '../../contexts/SocialContext';

const { height } = Dimensions.get('window');

interface LoopFeedProps {
    posts: PostType[];
    onUserClick: (id: string) => void;
    onEndReached?: () => void;
    onCommercePress?: (listingId: string, postId: string) => void;
}

export const LoopFeed = ({ posts, onUserClick, onEndReached, onCommercePress }: LoopFeedProps) => {
    const [activeIndex, setActiveIndex] = useState(0);

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
                keyExtractor={(item) => item._id || item.id}
                renderItem={({ item, index }) => (
                    <LoopItem
                        post={item}
                        isActive={activeIndex === index}
                        onUserClick={onUserClick}
                        onCommercePress={onCommercePress}
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
