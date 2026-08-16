import React from 'react';
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
import { GoogleIcon } from './SocialIcons';
import { Radius, colors } from '../../theme/tokens';

type GoogleAuthButtonProps = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
};

/**
 * Full-width Google CTA shared by Login and Register.
 * Keeps icon + label aligned with secondary auth buttons (not a tiny icon chip).
 */
export function GoogleAuthButton({
    label,
    onPress,
    disabled = false,
    loading = false,
    style,
}: GoogleAuthButtonProps) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const busy = disabled || loading;

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
                <ActivityIndicator size="small" color={colors(isDark).text} />
            ) : (
                <View style={styles.content}>
                    <View style={styles.iconWrap}>
                        <GoogleIcon />
                    </View>
                    <Text style={styles.label}>{label}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        button: {
            width: '100%',
            minHeight: 52,
            borderRadius: Radius.lg,
            backgroundColor: c.surface2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
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
            color: c.text,
            letterSpacing: 0.1,
        },
    });
};
