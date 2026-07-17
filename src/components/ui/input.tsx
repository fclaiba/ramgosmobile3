import * as React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Type, Touch } from '../../theme/tokens';

const Input = React.forwardRef<
    React.ElementRef<typeof TextInput>,
    React.ComponentPropsWithoutRef<typeof TextInput>
>(({ style, ...props }, ref) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);

    return (
        <TextInput
            style={[
                styles.input,
                {
                    borderColor: c.border,
                    backgroundColor: c.glass,
                    color: c.text,
                    minHeight: Touch.min,
                },
                style,
            ]}
            ref={ref}
            placeholderTextColor={c.textSubtle}
            {...props}
        />
    );
});
Input.displayName = 'Input';

const styles = StyleSheet.create({
    input: {
        width: '100%',
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 14,
        paddingVertical: 10,
        ...Type.body,
    },
});

export { Input };
