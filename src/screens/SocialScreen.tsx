import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, useWindowDimensions } from 'react-native';
import { Search, Plus as PlusIcon, Send } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { MobileHeader } from '../components/MobileHeader';
import { MobileNav } from '../components/MobileNav';

import { useTheme } from '../contexts/ThemeContext';
import { Post } from '../components/social';

import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveLayout } from '../components/ResponsiveLayout';
import { DesktopSidebar } from '../components/DesktopSidebar';

export default function SocialScreen({ navigation, onMenuPress, isTabMode }: any) {
    const { width } = useWindowDimensions();
    const { colorScheme } = useTheme();
    const { isDesktop } = useResponsive();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // ponytail: Direct queries
    const postsResult = useQuery(api.social.getFeed, { limit: 20 });
    const posts = postsResult?.items || [];

    const handleUserClick = (userId: string) => console.log('user clicked', userId);

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
            <LinearGradient colors={isDark ? ['#111827', '#000'] : ['#F9FAFB', '#F3F4F6']} style={StyleSheet.absoluteFill} />

            <MobileHeader
                title="Social"
                subtitle="Conecta con la comunidad"
                onMenuPress={onMenuPress}
                actions={
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.iconBtn}>
                            <Send size={20} color={isDark ? '#fff' : "#111827"} />
                        </TouchableOpacity>
                    </View>
                }
            />

            <FlatList
                data={posts}
                keyExtractor={(item) => item._id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                renderItem={({ item }) => <Post post={item} onUserClick={handleUserClick} />}
                ListHeaderComponent={
                    <TouchableOpacity style={styles.createPostBar}>
                        <View style={styles.avatarPlaceholder}><Text style={styles.avatarLetter}>R</Text></View>
                        <View style={styles.cpInput}><Text style={styles.cpText}>¿Qué estás pensando?</Text></View>
                        <PlusIcon size={20} color={isDark ? '#fff' : "#000"} />
                    </TouchableOpacity>
                }
                ListEmptyComponent={
                    <Text style={{textAlign: 'center', color: 'gray', marginTop: 20}}>No hay publicaciones aún.</Text>
                }
            />

            {!isTabMode && !isDesktop && (
                <MobileNav
                    activeSection="social"
                    onSectionChange={(section) => {
                        if (section === 'home') navigation.navigate('Home');
                        else if (section === 'marketplace') navigation.navigate('Marketplace');
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
    createPostBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1F2937' : '#fff', padding: 12, borderRadius: 16, marginBottom: 16, gap: 12 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? '#374151' : '#E5E5E5', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#9CA3AF' : '#666' },
    cpInput: { flex: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', height: 36, borderRadius: 18, justifyContent: 'center', paddingHorizontal: 16 },
    cpText: { color: isDark ? '#9CA3AF' : '#9CA3AF', fontSize: 13 },
});