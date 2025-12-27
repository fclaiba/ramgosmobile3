import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Image, SafeAreaView } from 'react-native';
import { ArrowLeft, Search, Send, Image as ImageIcon, Smile, Phone, Video, Info } from 'lucide-react-native';
import { useSocial } from '../../contexts/SocialContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface DirectMessagesProps {
    onClose: () => void;
}

export const DirectMessages = ({ onClose }: DirectMessagesProps) => {
    const { getUserById, currentUser, chats, sendMessage, searchUsers, createChat } = useSocial();
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');
    const [searchText, setSearchText] = useState('');

    // Derived Conversations List
    const conversations = chats.map(chat => {
        const otherUserId = chat.participants.find(id => id !== currentUser.id) || '';
        const otherUser = getUserById(otherUserId);
        const lastMsg = chat.messages[chat.messages.length - 1];

        return {
            id: chat.id,
            userId: otherUserId,
            otherUser,
            lastMessage: lastMsg ? lastMsg.text : 'Nuevo chat',
            time: lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            unread: chat.messages.filter(m => !m.read && m.senderId !== currentUser.id).length
        };
    }).filter(c => c.otherUser); // Filter out invalid users

    // Search Results
    const searchResults = useMemo(() => {
        if (!searchText) return [];
        const users = searchUsers(searchText);
        return users.filter(u => u.id !== currentUser.id);
    }, [searchText, searchUsers, currentUser.id]);

    const handleSelectUser = (userId: string) => {
        const chatId = createChat(userId);
        setSelectedChat(chatId);
        setSearchText('');
    };

    // Mock Conversations


    const activeChatData = selectedChat ? chats.find(c => c.id === selectedChat) : null;
    const currentChatUser = activeChatData ? getUserById(activeChatData.participants.find(id => id !== currentUser.id) || '') : null;

    const handleSendMessage = () => {
        if (!messageText.trim() || !selectedChat) return;
        sendMessage(selectedChat, messageText);
        setMessageText('');
    };

    const renderConversationList = () => (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backButton}>
                    <ArrowLeft size={24} color="#000" />
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
        </SafeAreaView>
    );

    const renderChat = () => {
        if (!currentChatUser) return null;
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.chatHeader}>
                    <View style={styles.chatHeaderLeft}>
                        <TouchableOpacity onPress={() => setSelectedChat(null)} style={styles.backButton}>
                            <ArrowLeft size={24} color="#000" />
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
                        <Phone size={20} color="#000" style={{ marginRight: 16 }} />
                        <Video size={24} color="#000" />
                    </View>
                </View>

                <ScrollView style={styles.chatContent} contentContainerStyle={{ padding: 16 }}>
                    {activeChatData?.messages.map((msg) => {
                        const isMe = msg.senderId === currentUser.id;
                        return (
                            <View key={msg.id} style={[styles.messageBubble, isMe ? styles.messageSent : styles.messageReceived]}>
                                <Text style={[styles.messageText, isMe && styles.sentText]}>{msg.text}</Text>
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
            </SafeAreaView>
        );
    };

    return (
        <Modal visible={true} animationType="slide" presentationStyle="pageSheet">
            {!selectedChat ? renderConversationList() : renderChat()}
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backButton: { marginRight: 12 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },

    searchContainer: { padding: 16 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#000' },

    listContainer: { flex: 1 },
    convItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
    avatar: { width: 56, height: 56 },
    smallAvatar: { width: 36, height: 36, marginRight: 8 },
    unreadBadge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#fff' },

    convInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    convHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    convName: { fontWeight: '600', fontSize: 15, color: '#111' },
    convTime: { fontSize: 12, color: '#9CA3AF' },
    convLastMessage: { fontSize: 13, color: '#6B7280' },
    unreadMessage: { color: '#111', fontWeight: '500' },

    chatHeader: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    chatHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
    chatHeaderRight: { flexDirection: 'row', alignItems: 'center' },
    chatName: { fontWeight: '600', fontSize: 14 },
    chatUsername: { fontSize: 11, color: '#6B7280' },

    chatContent: { flex: 1 },
    messageBubble: { padding: 12, borderRadius: 16, maxWidth: '80%', marginBottom: 8 },
    messageReceived: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    messageSent: { backgroundColor: '#000', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    messageText: { fontSize: 15, color: '#111' },
    sentText: { color: '#fff' },

    inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    attachButton: { padding: 8 },
    messageInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 8, fontSize: 15, color: '#000' },
    sendButton: { width: 40, height: 40, backgroundColor: '#000', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }
});
