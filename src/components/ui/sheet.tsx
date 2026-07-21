import * as React from "react"
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, Platform } from "react-native"
import { X } from "lucide-react-native"
import { useTheme } from "../../contexts/ThemeContext"

const Sheet = ({ open, onOpenChange, children, animationType = 'slide' }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

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
    const styles = getStyles(isDark);
    const contentStyle = [
        styles.content,
        side === "left" && styles.left,
        side === "right" && styles.right,
        side === "top" && styles.top,
        side === "bottom" && styles.bottom,
        style
    ];

    return (
        <View style={contentStyle}>
            {children}
            {/* Close button can be added here if needed, but usually in Header */}
        </View>
    )
}

const SheetHeader = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <View style={[styles.header, props.style]} {...props}>
            {children}
        </View>
    )
}

const SheetFooter = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <View style={[styles.footer, props.style]} {...props}>
            {children}
        </View>
    )
}

const SheetTitle = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <Text style={[styles.title, props.style]} {...props}>
            {children}
        </Text>
    )
}

const SheetDescription = ({ className, children, ...props }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    return (
        <Text style={[styles.description, props.style]} {...props}>
            {children}
        </Text>
    )
}

const getStyles = (isDark: boolean) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    backdrop: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(15,10,30,0.4)',
    },
    content: {
        // Liquid glass sheet chrome — brand-soft, not flat gray
        backgroundColor: isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.92)',
        padding: 0,
        ...Platform.select({
            web: {
                boxShadow: isDark
                    ? '0 -8px 40px rgba(0,0,0,0.45)'
                    : '0 -8px 40px rgba(33, 150, 243,0.12)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
            } as any,
            default: {
                shadowColor: isDark ? '#000' : '#2196F3',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: isDark ? 0.35 : 0.14,
                shadowRadius: 20,
            },
        }),
        elevation: 8,
        position: 'absolute',
    },
    left: {
        left: 0,
        top: 0,
        bottom: 0,
        width: "75%",
        maxWidth: 400,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
    },
    right: {
        right: 0,
        top: 0,
        bottom: 0,
        width: "75%",
        maxWidth: 400,
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
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
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
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
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
    },
    header: {
        flexDirection: "column",
        gap: 4,
        padding: 24,
        paddingBottom: 16,
    },
    footer: {
        flexDirection: "column-reverse",
        gap: 12,
        padding: 24,
        paddingTop: 0,
    },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        color: isDark ? "#F9FAFB" : "#111827",
    },
    description: {
        fontSize: 14,
        color: isDark ? "#9CA3AF" : "#6B7280",
    },
    close: {
        position: "absolute",
        right: 16,
        top: 16,
    }
})

export {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
}


