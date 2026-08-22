import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Text } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Post } from '../../components/social/Post';
import { Radius, colors } from '../../theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openUserProfile } from '../../navigation/openUserProfile';

export default function PostDetailScreen({ route, navigation }: any) {
    const { postId } = route.params;
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    // Utilizamos la query existente para traer el post específico
    const post = useQuery(api.social.getPostById, {
        sessionToken: sessionToken ?? undefined,
        postId: postId as any,
    });

    const handleUserClick = (userId: string) => {
        openUserProfile(navigation, userId);
    };

    const handleCommercePress = (listingId: string) => {
        navigation.navigate('ItemDetail', { itemId: listingId });
    };

    return (
        <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Volver">
                    <ArrowLeft size={24} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.text }]}>Publicación</Text>
            </View>

            {post === undefined ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={c.primary} />
                </View>
            ) : post === null ? (
                <View style={styles.center}>
                    <Text style={[styles.errorText, { color: c.textSecondary }]}>
                        La publicación no existe o fue eliminada.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Post 
                        post={post} 
                        onUserClick={handleUserClick} 
                        onCommercePress={handleCommercePress} 
                    />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150,150,150,0.2)',
    },
    backBtn: {
        padding: 4,
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    errorText: {
        fontSize: 16,
        textAlign: 'center',
    },
    scrollContent: {
        paddingVertical: 16,
    },
});
