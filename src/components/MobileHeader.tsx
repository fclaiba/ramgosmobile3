import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';

import { Menu, ChevronLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

export const MobileHeader = ({ title, subtitle, actions, onMenuPress, backButton, onBack }: any) => {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {backButton ? (
                        <TouchableOpacity onPress={onBack}>
                            <ChevronLeft color="#000" size={24} />
                        </TouchableOpacity>
                    ) : onMenuPress ? (
                        <TouchableOpacity onPress={onMenuPress}>
                            <Menu color="#000" size={24} />
                        </TouchableOpacity>
                    ) : null}
                    <View>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    </View>
                </View>
                <View>{actions}</View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
        zIndex: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0'
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1A1A1A'
    },
    subtitle: {
        fontSize: 12,
        color: '#666'
    }
});
