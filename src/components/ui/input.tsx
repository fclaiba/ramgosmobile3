import * as React from 'react';
import { TextInput, StyleSheet, View, Text, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Type, Touch, Motion } from '../../theme/tokens';
import { glassInput } from '../../utils/glass';

interface InputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {
    /** Error state — shows red border glow */
    error?: boolean;
    /** Optional left icon element */
    leftIcon?: React.ReactNode;
    /** Optional right icon element */
    rightIcon?: React.ReactNode;
    /** Label above the input */
    label?: string;
}

const AnimatedView = Animated.createAnimatedComponent(View);

const Input = React.forwardRef<
    React.ElementRef<typeof TextInput>,
    InputProps
>(({ style, error, leftIcon, rightIcon, label, ...props }, ref) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const g = glassInput(isDark);

    // Focus animation
    const focusProgress = useSharedValue(0);

    const borderStyle = useAnimatedStyle(() => {
        const borderColor = error
            ? g.borderError
            : focusProgress.value > 0.5
            ? g.borderFocus
            : g.border;
        return {
            borderColor,
            backgroundColor: focusProgress.value > 0.5 ? g.bgFocus : g.bg,
        };
    });

    const handleFocus = React.useCallback(
        (e: any) => {
            focusProgress.value = withTiming(1, { duration: Motion.colorTransition });
            props.onFocus?.(e);
        },
        [focusProgress, props],
    );

    const handleBlur = React.useCallback(
        (e: any) => {
            focusProgress.value = withTiming(0, { duration: Motion.colorTransition });
            props.onBlur?.(e);
        },
        [focusProgress, props],
    );

    return (
        <View style={styles.wrapper}>
            {label && (
                <Text style={[styles.label, { color: error ? c.danger : c.textMuted }]}>
                    {label}
                </Text>
            )}
            <AnimatedView
                style={[
                    styles.container,
                    {
                        borderRadius: g.radius,
                    },
                    g.backdrop,
                    borderStyle,
                    error && { borderColor: g.borderError },
                ]}
            >
                {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
                <TextInput
                    style={[
                        styles.input,
                        {
                            color: g.text,
                            minHeight: Touch.min,
                        },
                        leftIcon ? { paddingLeft: 0 } : {},
                        rightIcon ? { paddingRight: 0 } : {},
                        style,
                    ]}
                    ref={ref}
                    placeholderTextColor={g.placeholder}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...props}
                />
                {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
            </AnimatedView>
        </View>
    );
});
Input.displayName = 'Input';

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
    },
    label: {
        ...Type.caption,
        marginBottom: 6,
        fontWeight: '600',
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        overflow: 'hidden',
    },
    iconLeft: {
        paddingLeft: 14,
        justifyContent: 'center',
    },
    iconRight: {
        paddingRight: 14,
        justifyContent: 'center',
    },
    input: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
        ...Type.body,
    },
});

export { Input };
