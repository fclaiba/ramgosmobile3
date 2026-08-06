import React, { useEffect, useState } from 'react';
import {
    TouchableOpacity,
    Text,
    View,
    StyleSheet,
    ActivityIndicator,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppleIcon } from './SocialIcons';
import { Radius } from '../../theme/tokens';
import { isAppleSignInAvailable } from '../../services/auth/appleSignIn';

type AppleAuthButtonProps = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
};

/** Web: CTA estilo Google; solo si hay Services ID configurado. */
export function AppleAuthButton({
    label,
    onPress,
    disabled = false,
    loading = false,
    style,
}: AppleAuthButtonProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const busy = disabled || loading;
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        let mounted = true;
        void isAppleSignInAvailable().then((ok) => {
            if (mounted) setAvailable(ok);
        });
        return () => {
            mounted = false;
        };
    }, []);

    if (!available) {
        return null;
    }

    return (
        <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled, style]}
            onPress={onPress}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
                <View style={styles.content}>
                    <View style={styles.iconWrap}>
                        <AppleIcon isDark />
                    </View>
                    <Text style={styles.label}>{label}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const getStyles = (_isDark: boolean) =>
    StyleSheet.create({
        button: {
            width: '100%',
            minHeight: 52,
            borderRadius: Radius.md,
            backgroundColor: '#000000',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
        },
        buttonDisabled: {
            opacity: 0.65,
        },
        content: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        },
        iconWrap: {
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
        },
        label: {
            fontSize: 16,
            fontWeight: '600',
            color: '#FFFFFF',
            letterSpacing: 0.1,
        },
    });
