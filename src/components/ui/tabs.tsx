import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, Radius, Type, Space, Motion } from '../../theme/tokens';

/* ─── Tabs Root ──────────────────────────────────────────────────── */

export const Tabs = ({ value, onValueChange, children, style }: any) => {
    const childrenWithProps = React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { value, onValueChange } as any);
        }
        return child;
    });
    return <View style={style}>{childrenWithProps}</View>;
};

/* ─── TabsList — Glass container with sliding indicator ──────────── */

export const TabsList = ({ children, value, onValueChange, style }: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const s = getStyles(isDark, c);

    // Sliding indicator
    const tabWidths = React.useRef<number[]>([]);
    const tabOffsets = React.useRef<number[]>([]);
    const indicatorX = useSharedValue(0);
    const indicatorW = useSharedValue(0);
    const [ready, setReady] = React.useState(false);

    const childArray = React.Children.toArray(children).filter(React.isValidElement);

    // Find active index
    const activeIndex = childArray.findIndex(
        (child: any) => child.props?.value === value,
    );

    React.useEffect(() => {
        if (ready && activeIndex >= 0 && tabOffsets.current[activeIndex] != null) {
            indicatorX.value = withSpring(tabOffsets.current[activeIndex], Motion.layoutSpring);
            indicatorW.value = withSpring(tabWidths.current[activeIndex], Motion.layoutSpring);
        }
    }, [activeIndex, ready, indicatorX, indicatorW]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }],
        width: indicatorW.value,
    }));

    const handleLayout = (index: number) => (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        tabWidths.current[index] = width;
        tabOffsets.current[index] = x;
        if (index === childArray.length - 1) {
            setReady(true);
            // Set initial position
            const ai = childArray.findIndex((c: any) => c.props?.value === value);
            if (ai >= 0 && tabOffsets.current[ai] != null) {
                indicatorX.value = tabOffsets.current[ai];
                indicatorW.value = tabWidths.current[ai];
            }
        }
    };

    const childrenWithProps = childArray.map((child: any, i: number) =>
        React.cloneElement(child, {
            selectedValue: value,
            onValueChange,
            onLayout: handleLayout(i),
        }),
    );

    return (
        <View style={[s.list, style]}>
            {/* Sliding glass indicator */}
            {ready && (
                <Animated.View style={[s.indicator, indicatorStyle]} />
            )}
            {childrenWithProps}
        </View>
    );
};

/* ─── TabsTrigger ────────────────────────────────────────────────── */

export const TabsTrigger = ({
    value,
    selectedValue,
    onValueChange,
    onLayout,
    children,
    style,
}: any) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const s = getStyles(isDark, c);
    const isSelected = value === selectedValue;

    return (
        <TouchableOpacity
            onPress={() => onValueChange(value)}
            onLayout={onLayout}
            style={[s.trigger, style]}
            activeOpacity={0.7}
        >
            <Text style={[s.text, isSelected && s.textActive]}>
                {children}
            </Text>
        </TouchableOpacity>
    );
};

/* ─── TabsContent ────────────────────────────────────────────────── */

export const TabsContent = ({ value, selectedValue, children }: any) => {
    if (value !== selectedValue) return null;
    return <View>{children}</View>;
};

/* ─── Styles ─────────────────────────────────────────────────────── */

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        list: {
            flexDirection: 'row',
            backgroundColor: c.surface1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.glassBorder,
            padding: 3,
            borderRadius: Radius.lg,
            marginBottom: Space[4],
            position: 'relative',
            overflow: 'hidden',
            ...(Platform.OS === 'web'
                ? ({
                      backdropFilter: 'blur(10px) saturate(1.2)',
                      WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
                  } as any)
                : {}),
        },
        indicator: {
            position: 'absolute',
            top: 3,
            bottom: 3,
            borderRadius: Radius.md,
            backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)',
            shadowColor: isDark ? '#fff' : '#000',
            shadowOpacity: isDark ? 0.06 : 0.08,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
            zIndex: 0,
        },
        trigger: {
            flex: 1,
            paddingVertical: 9,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.md,
            zIndex: 1,
        },
        text: {
            ...Type.bodySm,
            color: c.textMuted,
            fontWeight: '500',
        },
        textActive: {
            color: c.text,
            fontWeight: '700',
        },
    });
