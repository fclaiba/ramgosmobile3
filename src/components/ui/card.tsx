import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

export const Card = ({ children, style }: any) => (
    <View style={[styles.card, style]}>
        {children}
    </View>
);

export const CardContent = ({ children, style }: any) => (
    <View style={[styles.content, style]}>
        {children}
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'white',
        borderRadius: 16,
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
        color: '#1a1a1a'
    },
    footer: {
        padding: 16,
        paddingTop: 0
    }
});

export const CardHeader = ({ children, style }: any) => <View style={[styles.header, style]}>{children}</View>;
export const CardTitle = ({ children, style }: any) => <Text style={[styles.title, style]}>{children}</Text>;
export const CardFooter = ({ children, style }: any) => <View style={[styles.footer, style]}>{children}</View>;
