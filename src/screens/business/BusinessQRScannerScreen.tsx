import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';

/**
 * Legacy route `BusinessQR` — redirects to the unified POS scanner
 * (`BusinessScanner`) so web/native camera + redeem live in one place.
 */
export default function BusinessQRScannerScreen() {
    const navigation = useNavigation<any>();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    useEffect(() => {
        navigation.replace('BusinessScanner');
    }, [navigation]);

    return (
        <View style={[styles.center, { backgroundColor: c.bg }]}>
            <ActivityIndicator color={c.primary} size="large" />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
