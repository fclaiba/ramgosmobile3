import React, { useEffect, useState } from 'react';
import {
    TouchableOpacity,
    View,
    StyleSheet,
    ActivityIndicator,
    Platform,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';

type AppleAuthButtonProps = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
};

/**
 * iOS: botón oficial de Apple. Android: oculto (Sign in with Apple nativo es iOS-only).
 */
export function AppleAuthButton({
    label,
    onPress,
    disabled = false,
    loading = false,
    style,
}: AppleAuthButtonProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles();
    const busy = disabled || loading;
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'ios') {
            setAvailable(false);
            return;
        }
        let mounted = true;
        void AppleAuthentication.isAvailableAsync()
            .then((ok) => {
                if (mounted) setAvailable(ok);
            })
            .catch(() => {
                if (mounted) setAvailable(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    if (!available) {
        return null;
    }

    if (loading) {
        return (
            <TouchableOpacity
                style={[styles.button, styles.buttonDisabled, style]}
                disabled
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <ActivityIndicator size="small" color="#FFFFFF" />
            </TouchableOpacity>
        );
    }

    return (
        <View style={[{ width: '100%', opacity: busy ? 0.65 : 1 }, style]}>
            <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                }
                buttonStyle={
                    isDark
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={Radius.md}
                style={styles.nativeButton}
                onPress={busy ? () => undefined : onPress}
            />
        </View>
    );
}

const getStyles = () =>
    StyleSheet.create({
        nativeButton: {
            width: '100%',
            height: 52,
        },
        button: {
            width: '100%',
            minHeight: 52,
            borderRadius: Radius.md,
            backgroundColor: '#000000',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
        },
        buttonDisabled: {
            opacity: 0.65,
        },
    });
