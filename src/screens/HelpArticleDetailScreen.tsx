/**
 * HelpArticleDetailScreen — renders a single help article.
 *
 * Markdown rendering: we keep this dependency-free by parsing a tiny subset
 * of Markdown (paragraphs, ordered lists, **bold**, `code`). The corpus in
 * `src/data/helpArticles.ts` is hand-authored to stay within those bounds.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MobileHeader } from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { getArticleById, type HelpArticle } from '../data/helpArticles';

type Block =
    | { kind: 'heading'; text: string }
    | { kind: 'paragraph'; text: string }
    | { kind: 'list'; ordered: boolean; items: string[] };

const parseMarkdown = (raw: string): Block[] => {
    const lines = raw.split('\n');
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }
        if (line.startsWith('### ')) {
            blocks.push({ kind: 'heading', text: line.slice(4).trim() });
            i++;
            continue;
        }
        const orderedMatch = /^(\d+)\.\s+(.*)$/.exec(line);
        const bulletMatch = /^-\s+(.*)$/.exec(line);
        if (orderedMatch || bulletMatch) {
            const ordered = !!orderedMatch;
            const items: string[] = [];
            while (i < lines.length) {
                const l = lines[i];
                const o = /^(\d+)\.\s+(.*)$/.exec(l);
                const b = /^-\s+(.*)$/.exec(l);
                if (ordered && o) {
                    items.push(o[2]);
                    i++;
                } else if (!ordered && b) {
                    items.push(b[1]);
                    i++;
                } else {
                    break;
                }
            }
            blocks.push({ kind: 'list', ordered, items });
            continue;
        }
        blocks.push({ kind: 'paragraph', text: line.trim() });
        i++;
    }
    return blocks;
};

const RichText = ({ text, isDark }: { text: string; isDark: boolean }) => {
    // Split on **bold** and `code`. Keep simple: alternating regular / styled spans.
    const parts: { kind: 'text' | 'bold' | 'code'; value: string }[] = [];
    let remaining = text;
    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/;
    while (remaining.length > 0) {
        const match = tokenRegex.exec(remaining);
        if (!match) {
            parts.push({ kind: 'text', value: remaining });
            break;
        }
        if (match.index > 0) {
            parts.push({ kind: 'text', value: remaining.slice(0, match.index) });
        }
        const token = match[0];
        if (token.startsWith('**')) {
            parts.push({ kind: 'bold', value: token.slice(2, -2) });
        } else if (token.startsWith('`')) {
            parts.push({ kind: 'code', value: token.slice(1, -1) });
        }
        remaining = remaining.slice(match.index + token.length);
    }
    return (
        <Text style={{ color: isDark ? '#E5E7EB' : '#1F2937', fontSize: 15, lineHeight: 22 }}>
            {parts.map((p, idx) => {
                if (p.kind === 'bold') {
                    return (
                        <Text
                            key={idx}
                            style={{ fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' }}
                        >
                            {p.value}
                        </Text>
                    );
                }
                if (p.kind === 'code') {
                    return (
                        <Text
                            key={idx}
                            style={{
                                fontFamily: 'monospace',
                                backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
                                color: '#7C3AED',
                                paddingHorizontal: 4,
                                borderRadius: 4,
                            }}
                        >
                            {p.value}
                        </Text>
                    );
                }
                return (
                    <Text key={idx}>
                        {p.value}
                    </Text>
                );
            })}
        </Text>
    );
};

export default function HelpArticleDetailScreen({ route, navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const articleId: string | undefined = route?.params?.articleId;
    const article: HelpArticle | undefined = articleId
        ? getArticleById(articleId)
        : undefined;

    const blocks = useMemo(
        () => (article ? parseMarkdown(article.body) : []),
        [article],
    );

    if (!article) {
        return (
            <View style={styles.container}>
                <MobileHeader
                    title="Artículo"
                    subtitle="No encontrado"
                    backButton
                    onBack={() => navigation.goBack()}
                />
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                        No encontramos este artículo. Probá volver al Centro de Ayuda.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MobileHeader
                title={article.title}
                subtitle={article.summary}
                backButton
                onBack={() => navigation.goBack()}
            />
            <ScrollView contentContainerStyle={styles.content}>
                {blocks.map((block, idx) => {
                    if (block.kind === 'heading') {
                        return (
                            <Text key={idx} style={styles.heading}>
                                {block.text}
                            </Text>
                        );
                    }
                    if (block.kind === 'list') {
                        return (
                            <View key={idx} style={styles.list}>
                                {block.items.map((item, j) => (
                                    <View key={j} style={styles.listItem}>
                                        <Text style={styles.bullet}>
                                            {block.ordered ? `${j + 1}.` : '•'}
                                        </Text>
                                        <View style={{ flex: 1 }}>
                                            <RichText text={item} isDark={isDark} />
                                        </View>
                                    </View>
                                ))}
                            </View>
                        );
                    }
                    return (
                        <View key={idx} style={styles.paragraph}>
                            <RichText text={block.text} isDark={isDark} />
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#111827' : '#FFFFFF' },
        content: { padding: 20, paddingBottom: 40, gap: 12 },
        heading: {
            color: isDark ? '#F9FAFB' : '#111827',
            fontSize: 18,
            fontWeight: '700',
            marginTop: 8,
        },
        paragraph: { paddingVertical: 4 },
        list: { gap: 8, paddingLeft: 4, paddingVertical: 4 },
        listItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
        bullet: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            fontSize: 15,
            lineHeight: 22,
            minWidth: 18,
        },
        emptyBox: { padding: 30, alignItems: 'center' },
        emptyText: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            textAlign: 'center',
            fontSize: 14,
        },
    });
