import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle as SvgCircle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ShoppingCart,
  Wrench,
  Ticket,
  Gift,
  MapPin,
  Store,
  type LucideIcon,
} from 'lucide-react-native';

// ─── Types ──────────────────────────────────────────────
export type ListingType = 'product' | 'service' | 'event' | 'bono' | 'business';

interface CustomMapMarkerProps {
  /** The listing type determines the icon and color */
  type?: ListingType;
  /** Whether this marker is currently selected */
  isSelected?: boolean;
  /** Override the default pin size (default: 40) */
  size?: number;
  /** Override the default color */
  color?: string;
}

// ─── Color Palette ──────────────────────────────────────
const MARKER_COLORS: Record<ListingType, { primary: string; light: string }> = {
  product:  { primary: '#8B5CF6', light: '#C4B5FD' },  // Violet
  service:  { primary: '#06B6D4', light: '#67E8F9' },  // Cyan
  event:    { primary: '#F59E0B', light: '#FCD34D' },  // Amber
  bono:     { primary: '#10B981', light: '#6EE7B7' },  // Emerald
  business: { primary: '#EC4899', light: '#F9A8D4' },  // Pink
};

const DEFAULT_COLOR = { primary: '#6B7280', light: '#D1D5DB' };

// ─── Icon Map ───────────────────────────────────────────
const ICON_MAP: Record<ListingType, LucideIcon> = {
  product:  ShoppingCart,
  service:  Wrench,
  event:    Ticket,
  bono:     Gift,
  business: Store,
};

/**
 * Custom SVG map marker with a teardrop/pin shape.
 *
 * Renders a pin body with a gradient fill and an inner circle
 * containing a lucide icon. Supports a "selected" state with
 * a larger size and brighter colors.
 *
 * Usage inside a react-native-maps <Marker>:
 * ```tsx
 * <Marker coordinate={coord} onPress={handlePress}>
 *   <CustomMapMarker type="product" isSelected={selected} />
 * </Marker>
 * ```
 */
export const CustomMapMarker: React.FC<CustomMapMarkerProps> = ({
  type = 'product',
  isSelected = false,
  size: sizeProp,
  color: colorOverride,
}) => {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  const palette = MARKER_COLORS[type] ?? DEFAULT_COLOR;
  const primaryColor = colorOverride ?? palette.primary;
  const lightColor = palette.light;
  const Icon = ICON_MAP[type] ?? MapPin;

  // Selected markers are ~30% larger
  const size = sizeProp ?? (isSelected ? 52 : 40);
  const iconSize = Math.round(size * 0.38);

  // SVG viewBox is 40×52 — the pin shape is drawn in this coordinate space
  const viewBoxWidth = 40;
  const viewBoxHeight = 52;

  // Unique gradient ID per type to avoid SVG conflicts when multiple markers render
  const gradientId = useMemo(() => `grad_${type}_${Math.random().toString(36).slice(2, 6)}`, [type]);

  return (
    <View style={[
      styles.container,
      { width: size, height: size * (viewBoxHeight / viewBoxWidth) },
      isSelected && styles.selectedContainer,
    ]}>
      <Svg
        width={size}
        height={size * (viewBoxHeight / viewBoxWidth)}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lightColor} stopOpacity="1" />
            <Stop offset="1" stopColor={primaryColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Pin body — teardrop shape */}
        <Path
          d="M20 0 C8.954 0 0 8.954 0 20 C0 32 20 52 20 52 C20 52 40 32 40 20 C40 8.954 31.046 0 20 0 Z"
          fill={`url(#${gradientId})`}
        />

        {/* Inner white circle (icon background) */}
        <SvgCircle
          cx="20"
          cy="19"
          r="12"
          fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.92)'}
        />
      </Svg>

      {/* Lucide icon positioned over the SVG circle */}
      <View style={[
        styles.iconWrapper,
        {
          width: size,
          // Position the icon at the center of the circle (roughly 36.5% from top of pin)
          top: size * (viewBoxHeight / viewBoxWidth) * 0.365 - iconSize / 2,
        },
      ]}>
        <Icon
          size={iconSize}
          color={primaryColor}
          strokeWidth={isSelected ? 2.5 : 2}
        />
      </View>

      {/* Subtle shadow under the pin tip */}
      {isSelected && (
        <View style={[styles.shadowDot, { backgroundColor: primaryColor }]} />
      )}
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────
const getStyles = (isDark: any) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  selectedContainer: {
    // Slight lift effect — the scale is handled by the size prop
  },
  iconWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.4,
    marginTop: -2,
  },
});

export default CustomMapMarker;
