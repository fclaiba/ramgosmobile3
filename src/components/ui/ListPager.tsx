import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { glassTokens } from '../../utils/glass';

export const LIST_PAGE_SIZE = 10;
const PAGER_WINDOW = 5;

export function paginate<T>(items: T[], page: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    return {
        page: safePage,
        totalPages,
        total: items.length,
        items: items.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE),
    };
}

function pagerWindow(page: number, totalPages: number) {
    if (totalPages <= PAGER_WINDOW) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, page - 2);
    if (start + PAGER_WINDOW - 1 > totalPages) start = totalPages - PAGER_WINDOW + 1;
    return Array.from({ length: PAGER_WINDOW }, (_, i) => start + i);
}

type Props = {
    isDark: boolean;
    page: number;
    totalPages: number;
    total: number;
    onPage: (page: number) => void;
};

export function ListPager({ isDark, page, totalPages, total, onPage }: Props) {
    const styles = useMemo(() => getStyles(isDark), [isDark]);
    if (totalPages <= 1) return null;

    const from = (page - 1) * LIST_PAGE_SIZE + 1;
    const to = Math.min(page * LIST_PAGE_SIZE, total);
    const pages = pagerWindow(page, totalPages);
    const first = pages[0];
    const last = pages[pages.length - 1];

    return (
        <View style={styles.wrap}>
            <Text style={styles.info}>{from}–{to} de {total}</Text>
            <View style={styles.row}>
                {first > 1 && (
                    <>
                        <PagerBtn styles={styles} n={1} active={page === 1} onPress={onPage} />
                        {first > 2 && <Text style={styles.ellipsis}>…</Text>}
                    </>
                )}
                {pages.map((n) => (
                    <PagerBtn key={n} styles={styles} n={n} active={page === n} onPress={onPage} />
                ))}
                {last < totalPages && (
                    <>
                        {last < totalPages - 1 && <Text style={styles.ellipsis}>…</Text>}
                        <PagerBtn styles={styles} n={totalPages} active={page === totalPages} onPress={onPage} />
                    </>
                )}
            </View>
        </View>
    );
}

function PagerBtn({ styles, n, active, onPress }: { styles: ReturnType<typeof getStyles>; n: number; active: boolean; onPress: (p: number) => void }) {
    return (
        <TouchableOpacity
            style={[styles.btn, active && styles.btnActive]}
            onPress={() => onPress(n)}
            activeOpacity={0.85}
        >
            <Text style={[styles.btnText, active && styles.btnTextActive]}>{n}</Text>
        </TouchableOpacity>
    );
}

function getStyles(isDark: boolean) {
    const glass = glassTokens(isDark);
    const glassCard = {
        backgroundColor: glass.bg,
        borderWidth: 1,
        borderColor: glass.border,
        ...glass.shadow,
        ...glass.backdrop,
    } as const;

    return StyleSheet.create({
        wrap: { marginTop: 4, marginBottom: 14, gap: 8, ...glassCard, padding: 10, borderRadius: 14 },
        info: { fontSize: 11.5, color: isDark ? '#9CA3AF' : '#6B7280', textAlign: 'center' },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
        btn: {
            minWidth: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(129,140,248,0.12)' : 'rgba(79,70,229,0.08)',
            borderWidth: 1, borderColor: isDark ? 'rgba(129,140,248,0.25)' : 'rgba(79,70,229,0.15)',
        },
        btnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
        btnText: { fontSize: 13, fontWeight: '700', color: isDark ? '#C7D2FE' : '#4F46E5' },
        btnTextActive: { color: '#FFF' },
        ellipsis: { fontSize: 14, color: isDark ? '#6B7280' : '#9CA3AF', paddingHorizontal: 2 },
    });
}
