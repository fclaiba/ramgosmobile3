import * as React from "react"
import { TextInput, StyleSheet } from "react-native"
import { useTheme } from '../../contexts/ThemeContext';

const Input = React.forwardRef<
    React.ElementRef<typeof TextInput>,
    React.ComponentPropsWithoutRef<typeof TextInput>
>(({ style, ...props }, ref) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    return (
        <TextInput
            style={[styles.input, style]}
            ref={ref}
            placeholderTextColor="#9CA3AF"
            {...props}
        />
    )
})
Input.displayName = "Input"

const getStyles = (isDark: boolean) => StyleSheet.create({
    input: {
        height: 40,
        width: "100%",
        borderRadius: 6,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#e5e7eb', // input border
        backgroundColor: "transparent",
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: isDark ? "#fff" : "#111",
    }
})

export { Input }
