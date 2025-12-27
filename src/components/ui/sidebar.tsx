import * as React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Dimensions, Platform } from "react-native";
import { PanelLeft } from "lucide-react-native";
import { Button } from "./button";
import { Input } from "./input";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./sheet";
import { Skeleton } from "./skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// Constants
const SIDEBAR_WIDTH = 256; // 16rem = ~256px
const SIDEBAR_WIDTH_MOBILE = 288; // 18rem = ~288px
const SIDEBAR_WIDTH_ICON = 48; // 3rem = ~48px

type SidebarContextProps = {
    state: "expanded" | "collapsed";
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    isMobile: boolean;
    toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
    const context = React.useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider.");
    }
    return context;
}

function SidebarProvider({
    defaultOpen = true,
    open: openProp,
    onOpenChange: setOpenProp,
    children,
}: any) {
    const [openMobile, setOpenMobile] = React.useState(false);
    const [_open, _setOpen] = React.useState(defaultOpen);
    const open = openProp ?? _open;

    const setOpen = React.useCallback(
        (value: boolean | ((value: boolean) => boolean)) => {
            const openState = typeof value === "function" ? value(open) : value;
            if (setOpenProp) {
                setOpenProp(openState);
            } else {
                _setOpen(openState);
            }
        },
        [setOpenProp, open]
    );

    // Basic mobile detection (can be improved)
    const isMobile = Dimensions.get('window').width < 768;

    const toggleSidebar = React.useCallback(() => {
        return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
    }, [isMobile, setOpen, setOpenMobile]);

    const state = open ? "expanded" : "collapsed" as "expanded" | "collapsed";

    const contextValue = React.useMemo(
        () => ({
            state,
            open,
            setOpen,
            isMobile,
            openMobile,
            setOpenMobile,
            toggleSidebar,
        }),
        [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    );

    return (
        <SidebarContext.Provider value={contextValue}>
            <TooltipProvider>
                <View style={styles.provider}>{children}</View>
            </TooltipProvider>
        </SidebarContext.Provider>
    );
}

function Sidebar({ side = "left", variant = "sidebar", collapsible = "offcanvas", children }: any) {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === "none") {
        return <View style={styles.sidebarNone}>{children}</View>;
    }

    if (isMobile) {
        return (
            <Sheet open={openMobile} onOpenChange={setOpenMobile}>
                <SheetContent side={side} style={{ width: SIDEBAR_WIDTH_MOBILE }}>
                    <View style={{ flex: 1 }}>{children}</View>
                </SheetContent>
            </Sheet>
        );
    }

    // Desktop implementation
    const width = state === "expanded" ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON;

    return (
        <View style={[styles.sidebarDesktop, { width }]}>
            <View style={styles.sidebarInner}>
                {children}
            </View>
        </View>
    );
}

function SidebarTrigger({ className, onClick, ...props }: any) {
    const { toggleSidebar } = useSidebar();
    return (
        <Button
            variant="ghost"
            size="icon"
            className={className}
            onPress={(event: any) => { // Changed onClick to onPress
                onClick?.(event);
                toggleSidebar();
            }}
            {...props}
        >
            <PanelLeft color="#000" size={24} />
        </Button>
    );
}

// Components
function SidebarContent({ className, children }: any) {
    return <ScrollView style={[styles.content, className]}>{children}</ScrollView>;
}

function SidebarHeader({ className, children }: any) {
    return <View style={[styles.header, className]}>{children}</View>;
}

function SidebarFooter({ className, children }: any) {
    return <View style={[styles.footer, className]}>{children}</View>;
}

function SidebarGroup({ className, children }: any) {
    return <View style={[styles.group, className]}>{children}</View>;
}

function SidebarGroupLabel({ className, children }: any) {
    return <Text style={[styles.groupLabel, className]}>{children}</Text>;
}

function SidebarMenu({ className, children }: any) {
    return <View style={[styles.menu, className]}>{children}</View>;
}

function SidebarMenuItem({ className, children }: any) {
    return <View style={[styles.menuItem, className]}>{children}</View>;
}

function SidebarMenuButton({ asChild, isActive, variant = "default", size = "default", tooltip, children, className, ...props }: any) {
    // Handling variant/size via simple styles or mapping
    return (
        <TouchableOpacity
            style={[
                styles.menuButton,
                isActive && styles.menuButtonActive,
                size === 'sm' && styles.sizeSm,
                props.style
            ]}
            {...props}
        >
            {children}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    provider: { flex: 1, flexDirection: 'row' },
    sidebarNone: { flex: 1, backgroundColor: '#fff' },
    sidebarDesktop: {
        height: '100%',
        backgroundColor: '#fff',
        borderRightWidth: 1,
        borderRightColor: '#E5E7EB',
        overflow: 'hidden',
    },
    sidebarInner: { flex: 1 },
    content: { flex: 1 },
    header: { padding: 16 },
    footer: { padding: 16 },
    group: { padding: 8, paddingBottom: 0 },
    groupLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginBottom: 8, paddingHorizontal: 8 },
    menu: { gap: 4 },
    menuItem: {},
    menuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 8,
    },
    menuButtonActive: { backgroundColor: '#F3F4F6' },
    sizeSm: { paddingVertical: 4, paddingHorizontal: 8 }
});

export {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarHeader,
    SidebarTrigger,
    SidebarProvider,
    useSidebar,
};
