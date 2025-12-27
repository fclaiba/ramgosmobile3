import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, TextInput, Image } from 'react-native';
import { X, Image as ImageIcon, Check } from 'lucide-react-native';
import { useSocial } from '../../contexts/SocialContext';
import { ImageWithFallback } from '../figma/ImageWithFallback';

export const CreateStory = ({ onClose }: { onClose: () => void }) => {
    const { createStory } = useSocial();
    const [imageUrl, setImageUrl] = useState('');

    const handleCreate = () => {
        if (!imageUrl) return;
        createStory(imageUrl);
        onClose();
    };

    return (
        <Modal animationType="slide" presentationStyle="pageSheet" visible={true} onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Crear Historia</Text>
                        <View style={{ width: 28 }} />
                    </View>

                    <View style={styles.content}>
                        {imageUrl ? (
                            <ImageWithFallback src={imageUrl} style={styles.previewImage} />
                        ) : (
                            <View style={styles.placeholder}>
                                <ImageIcon size={64} color="#666" />
                                <Text style={styles.placeholderText}>Ingresa la URL de la imagen</Text>
                            </View>
                        )}

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="URL de imagen..."
                                placeholderTextColor="#999"
                                value={imageUrl}
                                onChangeText={setImageUrl}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.createBtn, !imageUrl && styles.disabledBtn]}
                            onPress={handleCreate}
                            disabled={!imageUrl}
                        >
                            <Text style={styles.createBtnText}>Compartir en tu historia</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    previewImage: { width: '100%', height: '80%', borderRadius: 16, resizeMode: 'cover' },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    placeholderText: { color: '#666', fontSize: 16 },
    inputContainer: { width: '100%', marginTop: 20 },
    input: { backgroundColor: '#333', color: '#fff', padding: 16, borderRadius: 12, fontSize: 16 },
    footer: { padding: 20 },
    createBtn: { backgroundColor: '#8B5CF6', padding: 16, borderRadius: 16, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#4B5563', opacity: 0.5 },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
