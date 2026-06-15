import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MiMascotaView } from '../components/pet/MiMascotaView';
import { useTheme } from '../contexts/ThemeContext';

export default function MiMascotaScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <View style={styles.container}>
            <MiMascotaView navigation={navigation} />
        </View>
    );
}

const getStyles = (isDark: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
});
