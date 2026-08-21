import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';
import { StorySlidesContent } from '../../components/social/StoryViewer';

/**
 * A3.5: viewer de una destacada — reusa `StorySlidesContent` (mismo
 * progress-bar/gestos/stickers que el tray) en vez de duplicarlo, con
 * `getHighlightStories` como única "fila" del grupo (un highlight no tiene
 * el concepto de múltiples autores).
 */
export default function HighlightViewerScreen({ route, navigation }: any) {
    const highlightId = route?.params?.highlightId;
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const data = useQuery(
        api.social.getHighlightStories,
        sessionToken && highlightId ? { sessionToken, highlightId } : 'skip',
    );

    if (data === undefined) {
        return (
            <View style={[styles.center, { backgroundColor: '#000' }]}>
                <ActivityIndicator color={colors(isDark).primary} />
            </View>
        );
    }
    if (!data || data.stories.length === 0) {
        navigation.goBack();
        return null;
    }

    return (
        <StorySlidesContent
            groups={[{ author: { displayName: data.title, avatar: data.coverImage }, stories: data.stories }]}
            initialGroupIndex={0}
            onClose={() => navigation.goBack()}
            onNavigateProfile={() => {}}
        />
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
