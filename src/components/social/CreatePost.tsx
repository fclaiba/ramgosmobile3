import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { X, Image as ImageIcon, Send } from 'lucide-react-native';
import { useSocial } from '../../contexts/SocialContext';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

export const CreatePost = ({ onClose }: { onClose: () => void }) => {
    const { currentUser, createPost } = useSocial();
    const [content, setContent] = useState('');

    const { theme, colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const handlePost = () => {
        if (!content.trim()) return;
        createPost(content, 'text');
        onClose();
    };

    return (
        <Sheet open={true} onOpenChange={(val: boolean) => !val && onClose()}>
            <SheetContent side="bottom" style={styles.sheetContent}>
                <SheetHeader style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color={isDark ? '#D1D5DB' : '#374151'} />
                    </TouchableOpacity>
                    <SheetTitle style={styles.title}>Crear Publicación</SheetTitle>
                    <TouchableOpacity
                        onPress={handlePost}
                        disabled={!content.trim()}
                        style={[styles.postBtn, !content.trim() && styles.postBtnDisabled]}
                    >
                        <Text style={[styles.postBtnText, !content.trim() && styles.postBtnTextDisabled]}>
                            Publicar
                        </Text>
                    </TouchableOpacity>
                </SheetHeader>

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
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    sheetContent: {
        backgroundColor: isDark ? '#1F2937' : '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%'
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    closeBtn: { padding: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#F9FAFB' : '#111827' },
    postBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    postBtnDisabled: { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    postBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    postBtnTextDisabled: { color: '#9CA3AF' },

    content: { padding: 20, flex: 1 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    userName: { fontWeight: 'bold', fontSize: 15, color: isDark ? '#F9FAFB' : '#111827' },
    input: { fontSize: 16, color: isDark ? '#F9FAFB' : '#111827', minHeight: 120, flex: 1 },

    footer: { padding: 16, borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', marginBottom: 20 },
    mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: isDark ? '#374151' : '#F9FAFB' },
    mediaText: { color: isDark ? '#D1D5DB' : '#6B7280', fontWeight: '500' }
});
