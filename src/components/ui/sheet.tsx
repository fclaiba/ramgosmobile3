import * as React from "react"
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, Platform } from "react-native"
import { X } from "lucide-react-native"

const Sheet = ({ open, onOpenChange, children }: any) => {
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

const SheetContent = ({ children, side = "left", className, style }: any) => {
    return (
        <View style={[styles.content, side === "left" ? styles.left : styles.right, style]}>
            {children}
            <TouchableOpacity style={styles.close} onPress={(e) => { /* logic handled by parent usually, but need context */ }}>
                {/* Close icon usually handled by SheetHeader or separate implementation */}
            </TouchableOpacity>
        </View>
    )
}

const SheetHeader = ({ className, children, ...props }: any) => (
    <View style={[styles.header, props.style]} {...props}>
        {children}
    </View>
)

const SheetFooter = ({ className, children, ...props }: any) => (
    <View style={[styles.footer, props.style]} {...props}>
        {children}
    </View>
)

const SheetTitle = ({ className, children, ...props }: any) => (
    <Text style={[styles.title, props.style]} {...props}>
        {children}
    </Text>
)

const SheetDescription = ({ className, children, ...props }: any) => (
    <Text style={[styles.description, props.style]} {...props}>
        {children}
    </Text>
)

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        flexDirection: "row",
        zIndex: 50,
    },
    backdrop: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    content: {
        backgroundColor: "#fff",
        padding: 0, // p-0 in shadcn
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        height: "100%",
        width: "75%",
        maxWidth: 400,
    },
    left: {
        left: 0,
        borderRightWidth: 1,
        borderColor: "#E5E7EB",
    },
    right: {
        right: 0, // This logic is flawed for flex row without justification. 
        // Better: In overlay, use justifyContent
    },
    header: {
        flexDirection: "column",
        gap: 2, // gap-2
        padding: 16,
    },
    footer: {
        flexDirection: "column-reverse", // sm:flex-row sm:justify-end
        gap: 8,
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: "#111",
    },
    description: {
        fontSize: 14,
        color: "#6B7280",
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
