import * as React from "react"
import { View, StyleSheet } from "react-native"
import { useTheme } from '../../contexts/ThemeContext';
import { colors } from '../../theme/tokens';

type SeparatorVariant = 'default' | 'subtle' | 'strong';

const Separator = React.forwardRef<
    React.ElementRef<typeof View>,
    React.ComponentPropsWithoutRef<typeof View> & {
        orientation?: "horizontal" | "vertical"
        decorative?: boolean
        variant?: SeparatorVariant
    }
>(
    (
        { orientation = "horizontal", decorative = true, variant = 'default', ...props },
        ref
    ) => {
        const { colorScheme } = useTheme();
        const isDark = colorScheme === 'dark';
        const c = colors(isDark);

        const color =
            variant === 'subtle' ? c.divider
            : variant === 'strong' ? c.border
            : c.divider; // default uses divider token

        return (
            <View
                ref={ref}
                style={[
                    orientation === "horizontal"
                        ? [styles.horizontal, { backgroundColor: color }]
                        : [styles.vertical, { backgroundColor: color }],
                    props.style,
                ]}
                {...props}
            />
        )
    }
)
Separator.displayName = "Separator"

const styles = StyleSheet.create({
    horizontal: {
        height: StyleSheet.hairlineWidth,
        width: "100%",
    },
    vertical: {
        height: "100%",
        width: StyleSheet.hairlineWidth,
    },
})

export { Separator }
