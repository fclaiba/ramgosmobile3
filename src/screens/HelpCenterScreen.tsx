import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { BookOpen, Users, ShoppingBag, CreditCard, Award, Heart, Shield, MessageCircle, ChevronRight, Search, X, Video } from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { LinearGradient } from 'expo-linear-gradient';

const categories = [
    { id: 'getting-started', name: 'Primeros Pasos', icon: BookOpen, colors: ['#3b82f6', '#06b6d4'] }, // blue-500 to cyan-500
    { id: 'account', name: 'Mi Cuenta', icon: Users, colors: ['#a855f7', '#ec4899'] }, // purple-500 to pink-500
    { id: 'shopping', name: 'Compras', icon: ShoppingBag, colors: ['#22c55e', '#10b981'] }, // green-500 to emerald-500
    { id: 'payments', name: 'Pagos', icon: CreditCard, colors: ['#eab308', '#f97316'] }, // yellow-500 to orange-500
    { id: 'rewards', name: 'Recompensas', icon: Award, colors: ['#ef4444', '#ec4899'] }, // red-500 to pink-500
    { id: 'tamagotchi', name: 'Mi Mascota', icon: Heart, colors: ['#9333ea', '#db2777'] }, // purple-600 to pink-600
    { id: 'social', name: 'Social', icon: MessageCircle, colors: ['#06b6d4', '#3b82f6'] }, // cyan-500 to blue-500
    { id: 'security', name: 'Seguridad', icon: Shield, colors: ['#374151', '#111827'] }, // gray-700 to gray-900
];

export default function HelpCenterScreen({ navigation }: any) {
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Centro de Ayuda"
                subtitle="Encuentra respuestas rápidas"
                onMenuPress={() => navigation.openDrawer && navigation.openDrawer()}
                backButton
                onBack={() => navigation.goBack()}
            />

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={18} color="#666" style={{ marginRight: 8 }} />
                    <Input
                        placeholder="Busca tu pregunta..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={{ flex: 1, borderWidth: 0 }}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={18} color="#666" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Quick Actions */}
                <View style={styles.quickActionsRow}>
                    <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('Support')}>
                        <Card style={styles.quickActionCard}>
                            <CardContent style={styles.quickActionContent}>
                                <LinearGradient
                                    colors={['#3b82f6', '#06b6d4']}
                                    style={styles.iconContainer}
                                >
                                    <MessageCircle size={24} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.quickActionText}>Contactar Soporte</Text>
                            </CardContent>
                        </Card>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.quickAction} onPress={() => Alert.alert('Info', 'Video tutoriales próximamente')}>
                        <Card style={styles.quickActionCard}>
                            <CardContent style={styles.quickActionContent}>
                                <LinearGradient
                                    colors={['#ef4444', '#ec4899']}
                                    style={styles.iconContainer}
                                >
                                    <Video size={24} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.quickActionText}>Tutoriales</Text>
                            </CardContent>
                        </Card>
                    </TouchableOpacity>
                </View>

                {/* Categories Grid */}
                <Text style={styles.sectionTitle}>Categorías</Text>
                <View style={styles.categoriesGrid}>
                    {categories.map((category) => (
                        <TouchableOpacity
                            key={category.id}
                            style={styles.categoryItem}
                            onPress={() => Alert.alert(category.name, 'Lista de artículos de esta categoría (Próximamente)')}
                        >
                            <Card style={styles.categoryCard}>
                                <CardContent style={styles.categoryContent}>
                                    <LinearGradient
                                        colors={category.colors as any}
                                        style={styles.categoryIconContainer}
                                    >
                                        <category.icon size={20} color="#fff" />
                                    </LinearGradient>
                                    <Text style={styles.categoryName} numberOfLines={1}>{category.name}</Text>
                                    <Text style={styles.articleCount}>5 artículos</Text>
                                </CardContent>
                            </Card>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Popular Articles */}
                <Text style={styles.sectionTitle}>Más Populares</Text>
                {[
                    'Cómo crear tu primera cuenta',
                    'Sistema de puntos y recompensas',
                    'Guía del Tamagotchi'
                ].map((article, index) => (
                    <TouchableOpacity key={index} style={styles.articleRow} onPress={() => Alert.alert('Artículo', article)}>
                        <Card style={styles.articleCard}>
                            <CardContent style={styles.articleContent}>
                                <Text style={styles.articleTitle}>{article}</Text>
                                <ChevronRight size={18} color="#ccc" />
                            </CardContent>
                        </Card>
                    </TouchableOpacity>
                ))}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    searchContainer: { padding: 16, paddingBottom: 0 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    content: { padding: 16 },
    quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    quickAction: { flex: 1 },
    quickActionCard: { borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.1, elevation: 2 },
    quickActionContent: { alignItems: 'center', padding: 16 },
    iconContainer: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    quickActionText: { fontSize: 13, fontWeight: '500', color: '#333' },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#111' },
    categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    categoryItem: { width: '48%' },
    categoryCard: { borderWidth: 1, borderColor: '#eee' },
    categoryContent: { alignItems: 'center', padding: 16 },
    categoryIconContainer: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    categoryName: { fontSize: 13, fontWeight: '500', color: '#333', marginBottom: 4 },
    articleCount: { fontSize: 11, color: '#999' },
    articleRow: { marginBottom: 8 },
    articleCard: { borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.05, elevation: 1 },
    articleContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    articleTitle: { fontSize: 14, color: '#333' }
});
