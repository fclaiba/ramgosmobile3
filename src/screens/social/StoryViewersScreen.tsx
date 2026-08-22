import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';
import { Avatar, AvatarImage, AvatarFallback } from '../../components/ui/avatar';
import { openUserProfile } from '../../navigation/openUserProfile';

/** A4: `getStoryViewers` ya existía y funcionaba, pero ninguna pantalla lo
 *  consumía — el viewer (`StoryViewer.tsx`) ya tiene su propio modal
 *  inline para esto; esta versión ruteada es para llegar acá desde
 *  cualquier otro lado (ej. un deep link o el perfil propio) sin depender
 *  de estar parado adentro del viewer. */
export default function StoryViewersScreen({ route, navigation }: any) {
    const storyId = route?.params?.storyId;
    const insets = useSafeAreaInsets();
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    const viewers = useQuery(
        api.social.getStoryViewers,
        sessionToken && storyId ? { sessionToken, storyId } : 'skip',
    );

    return (
        <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={c.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.text }]}>Vistas ({viewers?.length ?? 0})</Text>
            </View>
            {viewers === undefined ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
            ) : (
                <FlatList
                    data={viewers}
                    keyExtractor={(v: any) => v.viewerUserId}
                    contentContainerStyle={{ padding: 16, gap: 8 }}
                    renderItem={({ item }: any) => (
                        <TouchableOpacity
                            style={styles.row}
                            activeOpacity={0.7}
                            onPress={() => openUserProfile(navigation, item.viewerUserId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver el perfil de ${item.displayName ?? item.username ?? 'este usuario'}`}
                        >
                            <Avatar style={{ width: 36, height: 36 }}>
                                <AvatarImage src={item.avatar} />
                                <AvatarFallback>{(item.displayName ?? '?')[0]}</AvatarFallback>
                            </Avatar>
                            <Text style={{ color: c.text, fontSize: 14 }}>{item.displayName ?? item.username ?? 'Usuario'}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{ color: c.textSecondary, padding: 16 }}>Nadie vio esta historia todavía.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(150,150,150,0.2)' },
    backBtn: { padding: 4, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
