import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { X, Search } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { Radius, colors } from '../../theme/tokens';


interface SharePostModalProps {
    postContent: string;
    visible: boolean;
    onClose: () => void;
}

export const SharePostModal = ({ postContent, visible, onClose }: SharePostModalProps) => {
    const { sendMessage } = useSocial();
    const { user: authUser } = useAuth();
    const [searchText, setSearchText] = useState('');
    const [sentTo, setSentTo] = useState<string[]>([]);

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const chatsRows = useQuery(
        api.social.getMyChats,
        authUser ? {} : 'skip',
    );

    const flat = (chatsRows ?? []).map((c: any) => {
        const other = c.otherParticipants?.[0];
        return {
            id: c._id,
            name: other?.displayName ?? 'Usuario',
            username: other?.username ?? 'usuario',
            avatar: other?.avatar ?? '',
        };
    });

    const filteredChats = flat.filter(
        (c) =>
            c.name.toLowerCase().includes(searchText.toLowerCase()) ||
            c.username.toLowerCase().includes(searchText.toLowerCase()),
    );

    const handleSend = (chatId: string) => {
        sendMessage(chatId, `Shared Post: ${postContent}`);
        setSentTo((prev) => [...prev, chatId]);
    };

    const renderItem = ({ item }: { item: typeof flat[number] }) => {
        const isSent = sentTo.includes(item.id);
        return (
            <View style={styles.userItem}>
                <View style={styles.userInfo}>
                    <Avatar style={styles.avatar}>
                        {item.avatar ? <AvatarImage src={item.avatar} /> : null}
                        <AvatarFallback>{item.name[0] ?? 'U'}</AvatarFallback>
                    </Avatar>
                    <View>
                        <Text style={styles.userName}>{item.name}</Text>
                        <Text style={styles.userHandle}>@{item.username}</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[styles.sendBtn, isSent && styles.sentBtn]}
                    onPress={() => !isSent && handleSend(item.id)}
                    disabled={isSent}
                >
                    {isSent ? (
                        <Text style={styles.sentText}>Enviado</Text>
                    ) : (
                        <Text style={styles.sendText}>Enviar</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <Sheet open={visible} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <SheetTitle style={styles.title}>Compartir</SheetTitle>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? "#F9FAFB" : "#111"} />
                    </TouchableOpacity>
                </SheetHeader>

                <View style={styles.searchContainer}>
                    <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Buscar personas..."
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                <FlatList
                    data={filteredChats}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No se encontraron chats recientes.</Text>
                        </View>
                    }
                />
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: colors(isDark).glass,
        height: '70%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(33, 150, 243,0.14)' },
    title: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111' },
    closeBtn: { position: 'absolute', right: 16, top: 16 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors(isDark).glass, margin: 16, borderRadius: Radius.md, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: isDark ? '#F9FAFB' : '#111' },
    list: { paddingHorizontal: 16 },
    userItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F9FAFB' },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 44, height: 44, marginRight: 12 },
    userName: { fontWeight: '600', fontSize: 14, color: isDark ? '#F9FAFB' : '#111' },
    userHandle: { fontSize: 12, color: '#6B7280' },
    sendBtn: { backgroundColor: '#0095F6', paddingHorizontal: 16, paddingVertical: 6, borderRadius: Radius.sm },
    sentBtn: { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: isDark ? '#4B5563' : '#DBDBDB' },
    sendText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    sentText: { color: isDark ? '#F9FAFB' : '#111', fontWeight: '600', fontSize: 13 },
    empty: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#9CA3AF' }
});
