import * as React from "react"
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../contexts/ThemeContext"
import { colors, Radius, Type, Space, Elevation } from "../../theme/tokens"
import { glassSheet } from "../../utils/glass"

const Sheet = ({ open, onOpenChange, children, animationType = 'slide' }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    React.useEffect(() => {
        if (!open || Platform.OS !== 'web') return;
        // Avoid "aria-hidden on focused descendant" when a sheet opens over the page.
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
    }, [open]);

    if (!open) return null;
    return (
        <Modal
            transparent
            visible={open}
            onRequestClose={() => onOpenChange(false)}
            animationType={animationType}
            accessibilityViewIsModal
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={() => onOpenChange(false)} />
                {children}
            </View>
        </Modal>
    )
}

const SheetContent = ({ children, side = "right", className, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const gs = glassSheet(isDark);
    const s = getStyles(isDark, c, gs);

    const contentStyle = [
        s.content,
        side === "left" && s.left,
        side === "right" && s.right,
        side === "top" && s.top,
        side === "bottom" && s.bottom,
        style
    ];

    return (
        <View style={contentStyle}>
            {/* Handle bar for bottom sheets */}
            {side === "bottom" && (
                <View style={s.handleWrap}>
                    <View style={[s.handle, { backgroundColor: gs.handleColor }]} />
                </View>
            )}
            {/* Specular rim */}
            {(side === "bottom" || side === "top") && (
                <LinearGradient
                    colors={[gs.specular, 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={s.specular}
                />
            )}
            {children}
        </View>
    )
}

const SheetHeader = ({ className, children, ...props }: any) => {
    return (
        <View style={[styles.header, props.style]} {...props}>
            {children}
        </View>
    )
}

const SheetFooter = ({ className, children, ...props }: any) => {
    return (
        <View style={[styles.footer, props.style]} {...props}>
            {children}
        </View>
    )
}

const SheetTitle = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    return (
        <Text style={[styles.title, { color: c.text }, props.style]} {...props}>
            {children}
        </Text>
    )
}

const SheetDescription = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    return (
        <Text style={[styles.description, { color: c.textMuted }, props.style]} {...props}>
            {children}
        </Text>
    )
}

/* ─── Dynamic styles (depend on theme/tokens) ────────────────────── */

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>, gs: ReturnType<typeof glassSheet>) =>
    StyleSheet.create({
        content: {
            backgroundColor: isDark ? 'rgba(12,12,14,0.92)' : 'rgba(255,255,255,0.92)',
            padding: 0,
            position: 'absolute',
            overflow: 'hidden',
            ...gs.shadow,
            ...(Platform.OS === 'web'
                ? ({
                      backdropFilter: `blur(${gs.blurWeb}px) saturate(1.35)`,
                      WebkitBackdropFilter: `blur(${gs.blurWeb}px) saturate(1.35)`,
                  } as any)
                : {}),
        },
        left: {
            left: 0,
            top: 0,
            bottom: 0,
            width: "75%",
            maxWidth: 400,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        right: {
            right: 0,
            top: 0,
            bottom: 0,
            width: "75%",
            maxWidth: 400,
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        top: {
            top: 0,
            left: 0,
            right: 0,
            marginHorizontal: 'auto',
            width: '100%',
            maxWidth: 600,
            height: '85%',
            maxHeight: '90%',
            borderBottomLeftRadius: gs.radius,
            borderBottomRightRadius: gs.radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        bottom: {
            bottom: 0,
            left: 0,
            right: 0,
            marginHorizontal: 'auto',
            width: '100%',
            maxWidth: 600,
            height: '85%',
            maxHeight: '90%',
            borderTopLeftRadius: gs.radius,
            borderTopRightRadius: gs.radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
        },
        handleWrap: {
            alignItems: 'center',
            paddingTop: 10,
            paddingBottom: 4,
        },
        handle: {
            width: 40,
            height: 4,
            borderRadius: 2,
        },
        specular: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            zIndex: 0,
        },
    });

/* ─── Static styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    backdrop: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.50)',
    },
    header: {
        flexDirection: "column",
        gap: 4,
        padding: Space[6],
        paddingBottom: Space[4],
    },
    footer: {
        flexDirection: "column-reverse",
        gap: Space[3],
        padding: Space[6],
        paddingTop: 0,
    },
    title: {
        ...Type.heading,
    },
    description: {
        ...Type.body,
    },
    close: {
        position: "absolute",
        right: 16,
        top: 16,
    },
});

export {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
}
