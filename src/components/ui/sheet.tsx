import * as React from "react"
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, Platform } from "react-native"
import { X } from "lucide-react-native"
import { useTheme } from "../../contexts/ThemeContext"

const Sheet = ({ open, onOpenChange, children }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    if (!open) return null;
    return (
        <Modal transparent visible={open} onRequestClose={() => onOpenChange(false)} animationType="fade">
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
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    content: {
        backgroundColor: isDark ? "#1F2937" : "#fff",
        padding: 0,
        ...Platform.select({
            web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)' },
            default: {
                shadowColor: isDark ? "#F9FAFB" : "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
            },
        }),
        elevation: 5,
        position: 'absolute',
    },
    left: {
        left: 0,
        top: 0,
        bottom: 0,
        width: "75%",
        maxWidth: 400,
        borderRightWidth: 1,
        borderColor: isDark ? "#374151" : "#E5E7EB",
    },
    right: {
        right: 0,
        top: 0,
        bottom: 0,
        width: "75%",
        maxWidth: 400,
        borderLeftWidth: 1,
        borderColor: isDark ? "#374151" : "#E5E7EB",
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
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderWidth: 1,
        borderColor: isDark ? "#374151" : "#E5E7EB",
    },
    bottom: {
        bottom: 0,
        left: 0,
        right: 0,
        marginHorizontal: 'auto', // Centers horizontally on large screens
        width: '100%',
        maxWidth: 600, // Max width for desktop
        height: '85%',
        maxHeight: '90%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: isDark ? "#374151" : "#E5E7EB",
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


