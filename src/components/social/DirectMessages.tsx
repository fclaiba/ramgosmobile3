import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, SafeAreaView } from 'react-native';
import { ArrowLeft, Search, Send, Image as ImageIcon, Phone, Video } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useSocial } from '../../contexts/SocialContext';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent } from '../ui/sheet';

interface DirectMessagesProps {
    onClose: () => void;
}

export const DirectMessages = ({ onClose }: DirectMessagesProps) => {
    const { currentUser, sendMessage, createChat } = useSocial();
    const { user: authUser } = useAuth();
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');
    const [searchText, setSearchText] = useState('');

    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    // Reactive queries.
    const chatsRows = useQuery(
        api.social.getMyChats,
        authUser ? { actorId: authUser.id as any } : 'skip',
    );
    const userSearchResult = useQuery(
        api.social.searchUsers,
        authUser && searchText ? { actorId: authUser.id as any, term: searchText, limit: 20 } : 'skip',
    );
    const messagesResult = useQuery(
        api.social.getChatMessages,
        authUser && selectedChat
            ? { actorId: authUser.id as any, chatId: selectedChat as any, limit: 100 }
            : 'skip',
    );
    const markAsReadMut = useMutation(api.social.markChatAsRead);

    // Mark chat as read whenever it's opened.
    useEffect(() => {
        if (selectedChat && authUser) {
            markAsReadMut({ actorId: authUser.id as any, chatId: selectedChat as any }).catch(() => {});
        }
    }, [selectedChat, authUser, markAsReadMut]);

    const conversations = (chatsRows ?? []).map((chat: any) => {
        const other = chat.otherParticipants?.[0];
        const otherUserId = chat.participantIds?.find((id: string) => id !== currentUser.id) ?? '';
        return {
            id: chat._id,
            userId: otherUserId,
            otherUser: other
                ? {
                    id: other.userId,
                    name: other.displayName,
                    username: other.username,
                    avatar: other.avatar ?? '',
                }
                : null,
            lastMessage: chat.lastMessagePreview ?? 'Nuevo chat',
            time: chat.lastMessageAt
                ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '',
            unread: chat.unreadCount ?? 0,
        };
    }).filter((c: any) => c.otherUser);

    const searchResults = (userSearchResult ?? [])
        .filter((u: any) => u.userId !== currentUser.id)
        .map((u: any) => ({
            id: u.userId,
            name: u.displayName,
            username: u.username,
            avatar: u.avatar ?? '',
        }));

    const handleSelectUser = async (userId: string) => {
        try {
            const chatId = await Promise.resolve(createChat(userId));
            setSelectedChat(chatId);
            setSearchText('');
        } catch (err) {
            console.warn('[DM] createChat failed', err);
        }
    };

    const activeChat = selectedChat
        ? conversations.find((c: any) => c.id === selectedChat)
        : null;
    const currentChatUser = activeChat?.otherUser ?? null;

    const handleSendMessage = () => {
        if (!messageText.trim() || !selectedChat) return;
        sendMessage(selectedChat, messageText);
        setMessageText('');
    };

    const renderConversationList = () => (
        <View style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backButton}>
                    <ArrowLeft size={24} color={isDark ? "#F9FAFB" : "#000"} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Mensajes</Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={20} color="#9CA3AF" />
                    <TextInput
                        placeholder="Buscar personas..."
                        style={styles.searchInput}
                        placeholderTextColor="#9CA3AF"
                        value={searchText}
                        onChangeText={setSearchText}
                    />
                </View>
            </View>

            <ScrollView style={styles.listContainer}>
                {searchText ? (
                    // Search Results
                    searchResults.map(user => (
                        <TouchableOpacity key={user.id} style={styles.convItem} onPress={() => handleSelectUser(user.id)}>
                            <Avatar style={styles.avatar}>
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                            </Avatar>
                            <View style={styles.convInfo}>
                                <Text style={styles.convName}>{user.name}</Text>
                                <Text style={styles.convLastMessage}>@{user.username}</Text>
                            </View>
                        </TouchableOpacity>
                    ))
                ) : (
                    // Existing Conversations
                    conversations.map((conv) => {
                        if (!conv.otherUser) return null;
                        return (
                            <TouchableOpacity key={conv.id} style={styles.convItem} onPress={() => setSelectedChat(conv.id)}>
                                <View>
                                    <Avatar style={styles.avatar}>
                                        <AvatarImage src={conv.otherUser.avatar} />
                                        <AvatarFallback>{conv.otherUser.name[0]}</AvatarFallback>
                                    </Avatar>
                                    {conv.unread > 0 && <View style={styles.unreadBadge} />}
                                </View>
                                <View style={styles.convInfo}>
                                    <View style={styles.convHeader}>
                                        <Text style={styles.convName}>{conv.otherUser.name}</Text>
                                        <Text style={styles.convTime}>{conv.time}</Text>
                                    </View>
                                    <Text style={[styles.convLastMessage, conv.unread > 0 && styles.unreadMessage]} numberOfLines={1}>
                                        {conv.lastMessage}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );

    const renderChat = () => {
        if (!currentChatUser) return null;
        return (
            <View style={styles.safeArea}>
                <View style={styles.chatHeader}>
                    <View style={styles.chatHeaderLeft}>
                        <TouchableOpacity onPress={() => setSelectedChat(null)} style={styles.backButton}>
                            <ArrowLeft size={24} color={isDark ? "#F9FAFB" : "#000"} />
                        </TouchableOpacity>
                        <Avatar style={styles.smallAvatar}>
                            <AvatarImage src={currentChatUser.avatar} />
                            <AvatarFallback>{currentChatUser.name[0]}</AvatarFallback>
                        </Avatar>
                        <View>
                            <Text style={styles.chatName}>{currentChatUser.name}</Text>
                            <Text style={styles.chatUsername}>@{currentChatUser.username}</Text>
                        </View>
                    </View>
                    <View style={styles.chatHeaderRight}>
                        <Phone size={20} color={isDark ? "#F9FAFB" : "#000"} style={{ marginRight: 16 }} />
                        <Video size={24} color={isDark ? "#F9FAFB" : "#000"} />
                    </View>
                </View>

                <ScrollView style={styles.chatContent} contentContainerStyle={{ padding: 16 }}>
                    {(messagesResult?.items ?? []).map((msg: any) => {
                        const isMe = msg.senderUserId === currentUser.id;
                        return (
                            <View key={msg._id} style={[styles.messageBubble, isMe ? styles.messageSent : styles.messageReceived]}>
                                <Text style={[styles.messageText, isMe && styles.sentText]}>{msg.body}</Text>
                            </View>
                        );
                    })}
                </ScrollView>

                <View style={styles.inputArea}>
                    <TouchableOpacity style={styles.attachButton}>
                        <ImageIcon size={24} color="#6B7280" />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Mensaje..."
                        value={messageText}
                        onChangeText={setMessageText}
                        placeholderTextColor="#9CA3AF"
                    />
                    <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                        <Send size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SafeAreaView style={{ flex: 1 }}>
                    {!selectedChat ? renderConversationList() : renderChat()}
                </SafeAreaView>
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: isDark ? '#111827' : '#fff',
        height: '95%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    safeArea: { flex: 1 },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    backButton: { marginRight: 12 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#000' },

    searchContainer: { padding: 16 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: isDark ? '#F9FAFB' : '#000' },

    listContainer: { flex: 1 },
    convItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F9FAFB' },
    avatar: { width: 56, height: 56 },
    smallAvatar: { width: 36, height: 36, marginRight: 8 },
    unreadBadge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#fff' },

    convInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    convHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    convName: { fontWeight: '600', fontSize: 15, color: isDark ? '#F9FAFB' : '#111' },
    convTime: { fontSize: 12, color: '#9CA3AF' },
    convLastMessage: { fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' },
    unreadMessage: { color: isDark ? '#F9FAFB' : '#111', fontWeight: '500' },

    chatHeader: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    chatHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
    chatHeaderRight: { flexDirection: 'row', alignItems: 'center' },
    chatName: { fontWeight: '600', fontSize: 14, color: isDark ? '#F9FAFB' : '#000' },
    chatUsername: { fontSize: 11, color: '#6B7280' },

    chatContent: { flex: 1 },
    messageBubble: { padding: 12, borderRadius: 16, maxWidth: '80%', marginBottom: 8 },
    messageReceived: { backgroundColor: isDark ? '#374151' : '#F3F4F6', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    messageSent: { backgroundColor: isDark ? '#4F46E5' : '#000', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    messageText: { fontSize: 15, color: isDark ? '#F9FAFB' : '#111' },
    sentText: { color: '#fff' },

    inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6' },
    attachButton: { padding: 8 },
    messageInput: { flex: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 8, fontSize: 15, color: isDark ? '#F9FAFB' : '#000' },
    sendButton: { width: 40, height: 40, backgroundColor: isDark ? '#4F46E5' : '#000', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }
});
