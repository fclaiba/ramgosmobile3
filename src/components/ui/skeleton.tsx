import * as React from "react"
import { Animated, StyleSheet, View } from "react-native"

function Skeleton({
    className,
    ...props
}: React.ComponentPropsWithoutRef<typeof View>) {
    const opacity = React.useRef(new Animated.Value(0.5)).current

    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.8,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.5,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        ).start()
    }, [])

    return (
        <Animated.View
            style={[
                styles.skeleton,
                { opacity },
                props.style
            ]}
            {...props}
        />
    )
}

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: "#D1D5DB", // muted
        borderRadius: 4,
    }
})

export { Skeleton }
