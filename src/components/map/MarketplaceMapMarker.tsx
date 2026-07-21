import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { glassShadow, Radius, colors } from '../../theme/tokens';


export type MarketplaceItemType = 'product' | 'service' | 'event' | 'bono' | 'business';

interface MarketplaceMapMarkerProps {
  /** Item data used to build the marker */
  item: {
    id: string | number;
    name: string;
    image?: string;
    type?: MarketplaceItemType | string;
  };
  /** Whether this marker is currently selected */
  isSelected?: boolean;
  /** Base marker size (default: 40) */
  size?: number;
}

// ─── Color Palette ──────────────────────────────────────
// Thematic colors by commercial unit type. Keep in sync with the
// marketplace filter chips and the web marker implementation.
export const MARKER_COLORS: Record<MarketplaceItemType, string> = {
  product:  '#4FC3F7', // Violet
  service:  '#38BDF8', // Sky/Cyan
  event:    '#F59E0B', // Amber
  bono:     '#10B981', // Emerald
  business: '#EC4899', // Pink
};

const DEFAULT_COLOR = '#6B7280';
const FALLBACK_IMAGE = 'https://placehold.co/300x300.png';

const getMarkerColor = (type?: string) => {
  if (!type) return DEFAULT_COLOR;
  return MARKER_COLORS[type as MarketplaceItemType] ?? DEFAULT_COLOR;
};

/**
 * Marketplace map marker.
 *
 * Shows:
 *   - A circular thumbnail of the item image
 *   - A thick thematic border color based on the listing type
 *   - A tiny tail that points to the map coordinate
 *   - A compact, readable label with the item name (truncated)
 *
 * Selected state scales the marker up slightly and brightens the label.
 */
export const MarketplaceMapMarker: React.FC<MarketplaceMapMarkerProps> = ({
  item,
  isSelected = false,
  size: sizeProp,
}) => {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  const color = getMarkerColor(item.type);
  const size = sizeProp ?? (isSelected ? 48 : 36);
  const borderWidth = isSelected ? 4 : 3;
  const innerSize = size - borderWidth * 2;

  return (
    <View style={styles.container}>
      {/* Pin body */}
      <View
        style={[
          styles.pin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth,
            borderColor: color,
          },
        ]}
      >
        <Image
          source={{ uri: item.image || FALLBACK_IMAGE }}
          style={[
            styles.image,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
            },
          ]}
          resizeMode="cover"
        />
      </View>

      {/* Tail */}
      <View style={[styles.triangle, { borderTopColor: color }]} />

      {/* Label — small, readable, non-saturating */}
      <View style={[styles.labelPill, isSelected && styles.labelPillActive]}>
        <Text
          style={[styles.labelText, isSelected && styles.labelTextActive]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.name}
        </Text>
      </View>
    </View>
  );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pin: {
    backgroundColor: colors(isDark).bg,
    justifyContent: 'center',
    alignItems: 'center',
    ...glassShadow(isDark),
  },
  image: {
    backgroundColor: colors(isDark).glass,
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  labelPill: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.md,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.92)',
    maxWidth: 96,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  labelPillActive: {
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 1)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors(isDark).text,
    textAlign: 'center',
  },
  labelTextActive: {
    fontWeight: '700',
  },
});

export default MarketplaceMapMarker;
