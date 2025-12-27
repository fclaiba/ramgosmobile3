import * as React from "react"
import { View, StyleSheet } from "react-native"
// import { cn } from "nativewind"
// I'll assume cn utility might not exist or be different. I'll implement a simple one if needed or just use array styles.
// For now, standard RN implementation.

const Separator = React.forwardRef<
    React.ElementRef<typeof View>,
    React.ComponentPropsWithoutRef<typeof View> & {
        orientation?: "horizontal" | "vertical"
        decorative?: boolean
    }
>(
    (
        { className, orientation = "horizontal", decorative = true, ...props },
        ref
    ) => (
        <View
            ref={ref}
            style={[
                orientation === "horizontal" ? styles.horizontal : styles.vertical,
                props.style
            ]}
            {...props}
        />
    )
)
Separator.displayName = "Separator"

const styles = StyleSheet.create({
    horizontal: {
        height: 1,
        width: "100%",
        backgroundColor: "#E5E7EB" // border-border
    },
    vertical: {
        height: "100%",
        width: 1,
        backgroundColor: "#E5E7EB"
    }
})

export { Separator }
