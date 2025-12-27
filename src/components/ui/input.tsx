import * as React from "react"
import { TextInput, StyleSheet } from "react-native"

const Input = React.forwardRef<
    React.ElementRef<typeof TextInput>,
    React.ComponentPropsWithoutRef<typeof TextInput>
>(({ className, ...props }, ref) => {
    return (
        <TextInput
            style={[styles.input, props.style]}
            ref={ref}
            placeholderTextColor="#9CA3AF"
            {...props}
        />
    )
})
Input.displayName = "Input"

const styles = StyleSheet.create({
    input: {
        height: 40,
        width: "100%",
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#E5E7EB", // input border
        backgroundColor: "transparent",
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: "#111",
    }
})

export { Input }
