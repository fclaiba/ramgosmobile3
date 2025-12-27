import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Modal, SafeAreaView } from 'react-native';
import { X, Image as ImageIcon, Send } from 'lucide-react-native';
import { useSocial } from '../../contexts/SocialContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';

export const CreatePost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createPost } = useSocial();
    const [content, setContent] = useState('');

    const handlePost = () => {
        if (!content.trim()) return;
        createPost(content, 'text');
        onClose();
    };

    return (
        <Modal animationType="slide" presentationStyle="pageSheet" visible={true} onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#374151" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Crear Publicación</Text>
                        <TouchableOpacity
                            onPress={handlePost}
                            disabled={!content.trim()}
                            style={[styles.postBtn, !content.trim() && styles.postBtnDisabled]}
                        >
                            <Text style={[styles.postBtnText, !content.trim() && styles.postBtnTextDisabled]}>
                                Publicar
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <View style={styles.userInfo}>
                            <Avatar>
                                <AvatarImage src={currentUser?.avatar} />
                                <AvatarFallback>{currentUser?.name?.[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <Text style={styles.userName}>{currentUser?.name || 'Usuario'}</Text>
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="¿Qué estás pensando?"
                            multiline
                            autoFocus
                            value={content}
                            onChangeText={setContent}
                            placeholderTextColor="#9CA3AF"
                            textAlignVertical="top"
                        />
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.mediaBtn}>
                            <ImageIcon size={24} color="#6B7280" />
                            <Text style={styles.mediaText}>Foto/Video</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    closeBtn: { padding: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    postBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    postBtnDisabled: { backgroundColor: '#E5E7EB' },
    postBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    postBtnTextDisabled: { color: '#9CA3AF' },

    content: { padding: 20, flex: 1 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    userName: { fontWeight: 'bold', fontSize: 15, color: '#111827' },
    input: { fontSize: 16, color: '#111827', minHeight: 120 },

    footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB' },
    mediaText: { color: '#6B7280', fontWeight: '500' }
});
