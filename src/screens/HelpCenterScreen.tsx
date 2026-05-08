import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import {
    BookOpen,
    Users,
    ShoppingBag,
    CreditCard,
    Award,
    MessageCircle,
    ChevronRight,
    Search,
    X,
    Video,
    Star,
} from 'lucide-react-native';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { MobileHeader } from '../components/MobileHeader';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../contexts/ThemeContext';
import {
    HELP_CATEGORIES,
    HELP_ARTICLES,
    POPULAR_ARTICLE_IDS,
    getArticlesByCategory,
    searchArticles,
    type HelpCategoryId,
    type HelpArticle,
} from '../data/helpArticles';

const CATEGORY_VISUAL: Record<
    HelpCategoryId,
    { icon: any; colors: [string, string] }
> = {
    compras: { icon: ShoppingBag, colors: ['#22c55e', '#10b981'] },
    vendedor: { icon: CreditCard, colors: ['#eab308', '#f97316'] },
    cuenta: { icon: Users, colors: ['#a855f7', '#ec4899'] },
    influencers: { icon: Award, colors: ['#ef4444', '#ec4899'] },
    recompensas: { icon: Star, colors: ['#3b82f6', '#06b6d4'] },
};

const TUTORIALS_URL = 'https://www.youtube.com/@ramgosapp';

export default function HelpCenterScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const [searchQuery, setSearchQuery] = useState('');

    const popular = useMemo<HelpArticle[]>(
        () =>
            POPULAR_ARTICLE_IDS.map((id) =>
                HELP_ARTICLES.find((a) => a.id === id),
            ).filter((a): a is HelpArticle => !!a),
        [],
    );

    const searchResults = useMemo<HelpArticle[]>(
        () => searchArticles(searchQuery),
        [searchQuery],
    );

    const goToArticle = (articleId: string) => {
        navigation.navigate('HelpArticleDetail', { articleId });
    };

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
                    <Search size={18} color={isDark ? '#9CA3AF' : '#666'} style={{ marginRight: 8 }} />
                    <Input
                        placeholder="Busca tu pregunta..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={{ flex: 1, borderWidth: 0, color: isDark ? '#fff' : '#000' }}
                        placeholderTextColor={isDark ? '#6B7280' : '#999'}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={18} color={isDark ? '#9CA3AF' : '#666'} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {searchQuery.length > 0 ? (
                    <>
                        <Text style={styles.sectionTitle}>
                            {searchResults.length > 0
                                ? `${searchResults.length} resultado(s)`
                                : 'Sin resultados'}
                        </Text>
                        {searchResults.map((article) => (
                            <ArticleRow
                                key={article.id}
                                article={article}
                                isDark={isDark}
                                onPress={() => goToArticle(article.id)}
                            />
                        ))}
                        {searchResults.length === 0 && (
                            <Text style={styles.emptyHint}>
                                Probá con otras palabras clave o contactá soporte directamente.
                            </Text>
                        )}
                    </>
                ) : (
                    <>
                        {/* Quick Actions */}
                        <View style={styles.quickActionsRow}>
                            <TouchableOpacity
                                style={styles.quickAction}
                                onPress={() => navigation.navigate('Support')}
                            >
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

                            <TouchableOpacity
                                style={styles.quickAction}
                                onPress={() => Linking.openURL(TUTORIALS_URL)}
                            >
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

                        {/* Popular */}
                        <Text style={styles.sectionTitle}>Más populares</Text>
                        {popular.map((article) => (
                            <ArticleRow
                                key={article.id}
                                article={article}
                                isDark={isDark}
                                onPress={() => goToArticle(article.id)}
                            />
                        ))}

                        {/* Categories */}
                        {HELP_CATEGORIES.map((category) => {
                            const visual = CATEGORY_VISUAL[category.id];
                            const articles = getArticlesByCategory(category.id);
                            if (articles.length === 0) return null;
                            return (
                                <View key={category.id} style={{ marginTop: 16 }}>
                                    <View style={styles.categoryHeader}>
                                        <LinearGradient
                                            colors={visual.colors}
                                            style={styles.categoryHeaderIcon}
                                        >
                                            <visual.icon size={16} color="#fff" />
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.categoryHeaderName}>
                                                {category.name}
                                            </Text>
                                            <Text style={styles.categoryHeaderDesc}>
                                                {category.description}
                                            </Text>
                                        </View>
                                    </View>
                                    {articles.map((article) => (
                                        <ArticleRow
                                            key={article.id}
                                            article={article}
                                            isDark={isDark}
                                            onPress={() => goToArticle(article.id)}
                                        />
                                    ))}
                                </View>
                            );
                        })}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const ArticleRow = ({
    article,
    isDark,
    onPress,
}: {
    article: HelpArticle;
    isDark: boolean;
    onPress: () => void;
}) => {
    const styles = getStyles(isDark);
    return (
        <TouchableOpacity style={styles.articleRow} onPress={onPress}>
            <Card style={styles.articleCard}>
                <CardContent style={styles.articleContent}>
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.articleTitle} numberOfLines={2}>
                            {article.title}
                        </Text>
                        <Text style={styles.articleSummary} numberOfLines={2}>
                            {article.summary}
                        </Text>
                    </View>
                    <ChevronRight size={18} color={isDark ? '#4B5563' : '#ccc'} />
                </CardContent>
            </Card>
        </TouchableOpacity>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#111827' : '#FAFAFA' },
        searchContainer: { padding: 16, paddingBottom: 0 },
        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#1F2937' : '#F0F0F0',
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
        },
        content: { padding: 16 },
        quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
        quickAction: { flex: 1 },
        quickActionCard: {
            borderWidth: 0,
            shadowColor: isDark ? '#F9FAFB' : '#000',
            shadowOpacity: 0.1,
            elevation: 2,
            backgroundColor: isDark ? '#1F2937' : '#fff',
        },
        quickActionContent: { alignItems: 'center', padding: 16 },
        iconContainer: {
            width: 48,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        quickActionText: { fontSize: 13, fontWeight: '500', color: isDark ? '#F9FAFB' : '#333' },
        sectionTitle: {
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 12,
            color: isDark ? '#F9FAFB' : '#111',
        },
        categoryHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
            marginTop: 4,
        },
        categoryHeaderIcon: {
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        categoryHeaderName: {
            fontSize: 16,
            fontWeight: '700',
            color: isDark ? '#F9FAFB' : '#111',
        },
        categoryHeaderDesc: {
            fontSize: 12,
            color: isDark ? '#9CA3AF' : '#6B7280',
            marginTop: 2,
        },
        articleRow: { marginBottom: 8 },
        articleCard: {
            borderWidth: 0,
            shadowColor: isDark ? '#F9FAFB' : '#000',
            shadowOpacity: 0.05,
            elevation: 1,
            backgroundColor: isDark ? '#1F2937' : '#fff',
        },
        articleContent: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 14,
            gap: 10,
        },
        articleTitle: { fontSize: 14, fontWeight: '600', color: isDark ? '#F9FAFB' : '#111827' },
        articleSummary: {
            fontSize: 12,
            color: isDark ? '#9CA3AF' : '#6B7280',
            lineHeight: 16,
        },
        emptyHint: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            fontSize: 13,
            textAlign: 'center',
            paddingVertical: 24,
        },
    });
