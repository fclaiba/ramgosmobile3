import React, { useState } from 'react';
import { View, FlatList, Dimensions, StyleSheet } from 'react-native';
import { ReelItem } from './ReelItem';
import { Post as PostType } from '../../contexts/SocialContext';

const { height } = Dimensions.get('window');

interface ReelFeedProps {
    posts: PostType[];
    onUserClick: (id: string) => void;
    onEndReached?: () => void;
}

export const ReelFeed = ({ posts, onUserClick, onEndReached }: ReelFeedProps) => {
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
                    <ReelItem
                        post={item}
                        isActive={activeIndex === index}
                        onUserClick={onUserClick}
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
