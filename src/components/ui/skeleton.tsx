import * as React from "react"
import { Animated, StyleSheet, View } from "react-native"
import { useTheme } from '../../contexts/ThemeContext';

function Skeleton({
    ...props
}: React.ComponentPropsWithoutRef<typeof View>) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
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

const getStyles = (isDark: boolean) => StyleSheet.create({
    skeleton: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)', // muted
        borderRadius: 4,
    }
})

export { Skeleton }
