import * as React from "react"
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Animated, PanResponder, Dimensions, LayoutChangeEvent } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../contexts/ThemeContext"
import { colors, Radius, Type, Space, Elevation } from "../../theme/tokens"
import { glassSheet } from "../../utils/glass"

/* ─── Drag to dismiss ────────────────────────────────────────────────
 * Los bottom sheets se cierran arrastrando la barra hacia abajo. Va con
 * `PanResponder` (RN core) y no con `react-native-gesture-handler`: la
 * app no monta `GestureHandlerRootView`, así que RNGH no tendría dónde
 * engancharse, y `PanResponder` además funciona igual en web.
 */

/** Fracción del alto del sheet que hay que arrastrar para que se cierre. */
const DISMISS_RATIO = 0.25;
/** Velocidad de flick que cierra aunque no se haya llegado al umbral. */
const DISMISS_VELOCITY = 0.7;
/** Recorrido de referencia para desvanecer el fondo mientras se arrastra. */
const BACKDROP_FADE_DISTANCE = 320;

// `useNativeDriver` no está soportado por react-native-web.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type SheetCtx = {
    onOpenChange: (v: boolean) => void;
    dragY: Animated.Value;
};

const SheetContext = React.createContext<SheetCtx | null>(null);

/**
 * Handlers de arrastre del bottom sheet, para que el contenido pueda sumar
 * su propia zona de agarre (típicamente su encabezado) además de la barra.
 * Devuelve `{}` fuera de un bottom sheet, así el spread es siempre seguro.
 */
const SheetDragContext = React.createContext<any>(null);
export const useSheetDragHandlers = () => React.useContext(SheetDragContext) ?? {};

const Sheet = ({ open, onOpenChange, children, animationType = 'slide' }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const dragY = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (!open || Platform.OS !== 'web') return;
        // Avoid "aria-hidden on focused descendant" when a sheet opens over the page.
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
    }, [open]);

    // Cada apertura arranca sin desplazamiento: si el sheet anterior se
    // cerró arrastrando, `dragY` quedó en el alto del sheet.
    React.useEffect(() => {
        if (open) dragY.setValue(0);
    }, [open, dragY]);

    const ctx = React.useMemo(() => ({ onOpenChange, dragY }), [onOpenChange, dragY]);

    if (!open) return null;

    const backdropOpacity = dragY.interpolate({
        inputRange: [0, BACKDROP_FADE_DISTANCE],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    return (
        <Modal
            transparent
            visible={open}
            onRequestClose={() => onOpenChange(false)}
            animationType={animationType}
            accessibilityViewIsModal
        >
            <SheetContext.Provider value={ctx}>
                <View style={styles.overlay}>
                    <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            onPress={() => onOpenChange(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Cerrar"
                        />
                    </Animated.View>
                    {children}
                </View>
            </SheetContext.Provider>
        </Modal>
    )
}

const SheetContent = ({ children, side = "right", className, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const gs = glassSheet(isDark);
    const s = getStyles(isDark, c, gs);
    const ctx = React.useContext(SheetContext);

    const isBottom = side === "bottom";
    const dragY = ctx?.dragY;
    // El alto real se mide al montar; hasta entonces, una estimación
    // razonable para no dividir por cero en el umbral de cierre.
    const heightRef = React.useRef(Dimensions.get('window').height * 0.85);

    const onLayout = (e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) heightRef.current = h;
    };

    const panResponder = React.useMemo(() => {
        if (!isBottom || !dragY || !ctx) return null;
        return PanResponder.create({
            // `false` a propósito: un toque simple sigue llegando a los hijos
            // (`SheetDragArea` puede envolver contenido con botones), y el
            // gesto se reclama recién cuando hay arrastre real.
            onStartShouldSetPanResponder: () => false,
            // Sólo hacia abajo: hacia arriba el sheet no se estira.
            onMoveShouldSetPanResponder: (_, g) => g.dy > 2 && Math.abs(g.dy) > Math.abs(g.dx),
            // Que un scroll padre no nos robe el gesto una vez empezado.
            onPanResponderTerminationRequest: () => false,
            onPanResponderMove: (_, g) => {
                dragY.setValue(Math.max(0, g.dy));
            },
            onPanResponderRelease: (_, g) => {
                const height = heightRef.current;
                const shouldClose = g.dy > height * DISMISS_RATIO || g.vy > DISMISS_VELOCITY;
                if (shouldClose) {
                    Animated.timing(dragY, {
                        toValue: height,
                        duration: 160,
                        useNativeDriver: USE_NATIVE_DRIVER,
                    }).start(() => {
                        ctx.onOpenChange(false);
                        // Dejarlo en cero acá y no sólo al abrir: si no, la
                        // próxima apertura pinta un frame con el sheet
                        // todavía desplazado fuera de pantalla.
                        dragY.setValue(0);
                    });
                } else {
                    Animated.spring(dragY, {
                        toValue: 0,
                        bounciness: 4,
                        speed: 16,
                        useNativeDriver: USE_NATIVE_DRIVER,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(dragY, {
                    toValue: 0,
                    bounciness: 4,
                    speed: 16,
                    useNativeDriver: USE_NATIVE_DRIVER,
                }).start();
            },
        });
    }, [isBottom, dragY, ctx]);

    const contentStyle = [
        s.content,
        side === "left" && s.left,
        side === "right" && s.right,
        side === "top" && s.top,
        isBottom && s.bottom,
        style,
        isBottom && dragY ? { transform: [{ translateY: dragY }] } : null,
    ];

    const Container: any = isBottom && dragY ? Animated.View : View;

    return (
        <SheetDragContext.Provider value={panResponder?.panHandlers ?? null}>
            <Container style={contentStyle} onLayout={isBottom ? onLayout : undefined}>
                {/* Handle bar for bottom sheets — es la zona de arrastre.
                    El `zIndex` no es decorativo: varios sheets montan un
                    `BlurView` con `absoluteFill` como primer hijo, que al ir
                    después en el orden de pintado tapaba la barra y se comía
                    el gesto. */}
                {isBottom && (
                    <View
                        style={s.handleWrap}
                        {...(panResponder ? panResponder.panHandlers : {})}
                        accessibilityRole="adjustable"
                        accessibilityLabel="Deslizá hacia abajo para cerrar"
                    >
                        {/* Área táctil generosa: la barra visible mide 4px de
                            alto, agarrarla sin este colchón es una lotería. */}
                        <View style={[s.handle, { backgroundColor: gs.handleColor }]} />
                    </View>
                )}
                {/* Specular rim */}
                {(isBottom || side === "top") && (
                    <LinearGradient
                        colors={[gs.specular, 'transparent']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={s.specular}
                    />
                )}
                {children}
            </Container>
        </SheetDragContext.Provider>
    )
}

/**
 * Zona extra de arrastre dentro de un bottom sheet. Se usa para que el
 * encabezado del contenido también cierre el sheet al deslizarlo, no sólo
 * la barra. Tiene que renderizarse DENTRO de `SheetContent` para ver el
 * contexto; fuera de un bottom sheet es un `View` común.
 */
const SheetDragArea = ({ children, style }: any) => {
    const dragHandlers = useSheetDragHandlers();
    return (
        <View style={style} {...dragHandlers}>
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
            justifyContent: 'center',
            // Zona de agarre alta aunque la barra visible sea fina.
            paddingTop: 10,
            paddingBottom: 10,
            minHeight: 34,
            zIndex: 2,
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
    SheetDragArea,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
}
