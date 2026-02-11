import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';

export const Card = ({ children, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    return (
        <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : 'white' }, style]}>
            {children}
        </View>
    );
};

export const CardContent = ({ children, style }: any) => (
    <View style={[styles.content, style]}>
        {children}
    </View>
);

const styles = StyleSheet.create({
    card: {
        borderRadius: 16, // bg color handled dynamically
        marginVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
        overflow: 'hidden'
    },
    content: {
        padding: 16
    },
    header: {
        padding: 16,
        paddingBottom: 0
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        // color handled dynamically
    },
    footer: {
        padding: 16,
        paddingTop: 0
    }
});

export const CardHeader = ({ children, style }: any) => <View style={[styles.header, style]}>{children}</View>;
export const CardTitle = ({ children, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    return <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#1a1a1a' }, style]}>{children}</Text>;
};
export const CardFooter = ({ children, style }: any) => <View style={[styles.footer, style]}>{children}</View>;
