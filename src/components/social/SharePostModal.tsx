import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, FlatList, SafeAreaView, Image } from 'react-native';
import { X, Search, Send, Check } from 'lucide-react-native';
import { useSocial, Chat } from '../../contexts/SocialContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface SharePostModalProps {
    postContent: string; // Or link/ID
    visible: boolean;
    onClose: () => void;
}

export const SharePostModal = ({ postContent, visible, onClose }: SharePostModalProps) => {
    const { chats, getUserById, currentUser, sendMessage } = useSocial();
    const [searchText, setSearchText] = useState('');
    const [sentTo, setSentTo] = useState<string[]>([]); // Track sent status per session

    // Filter chats based on search
    const filteredChats = chats.filter(chat => {
        const otherId = chat.participants.find(p => p !== currentUser.id);
        const user = otherId ? getUserById(otherId) : null;
        if (!user) return false;
        return user.name.toLowerCase().includes(searchText.toLowerCase()) ||
            user.username.toLowerCase().includes(searchText.toLowerCase());
    });

    const handleSend = (chatId: string) => {
        sendMessage(chatId, `Shared Post: ${postContent}`);
        setSentTo(prev => [...prev, chatId]);
    };

    const renderItem = ({ item }: { item: Chat }) => {
        const otherId = item.participants.find(p => p !== currentUser.id);
        const user = otherId ? getUserById(otherId) : null;
        if (!user) return null;

        const isSent = sentTo.includes(item.id);

        return (
            <View style={styles.userItem}>
                <View style={styles.userInfo}>
                    <Avatar style={styles.avatar}>
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                    </Avatar>
                    <View>
                        <Text style={styles.userName}>{user.name}</Text>
                        <Text style={styles.userHandle}>@{user.username}</Text>
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
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Compartir</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color="#111" />
                    </TouchableOpacity>
                </View>

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
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    title: { fontSize: 16, fontWeight: 'bold' },
    closeBtn: { position: 'absolute', right: 16, top: 16 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', margin: 16, borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: '#111' },
    list: { paddingHorizontal: 16 },
    userItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 44, height: 44, marginRight: 12 },
    userName: { fontWeight: '600', fontSize: 14, color: '#111' },
    userHandle: { fontSize: 12, color: '#6B7280' },
    sendBtn: { backgroundColor: '#0095F6', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
    sentBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DBDBDB' },
    sendText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    sentText: { color: '#111', fontWeight: '600', fontSize: 13 },
    empty: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#9CA3AF' }
});
