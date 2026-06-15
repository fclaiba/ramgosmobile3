import React, { forwardRef } from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';
import MapView, {
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  MapPressEvent,
  Region,
  EdgePadding,
  MapViewProps,
} from 'react-native-maps';
import { useTheme } from '../../contexts/ThemeContext';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE, MAP_DEFAULTS } from '../../constants/darkMapStyle';

export interface DarkMapViewProps extends Omit<MapViewProps, 'customMapStyle' | 'provider'> {
  /** Override the automatic theme detection. If omitted, reads from ThemeContext. */
  forceDark?: boolean;
  /** Extra map padding on top of defaults */
  mapPadding?: EdgePadding;
  /** Style for the MapView container */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Reusable map component that automatically applies:
 *  - Dark or Light custom map style based on the app theme
 *  - Correct provider per platform (Google on Android, Apple on iOS)
 *  - All "clean" map props (no POIs, traffic, buildings, compass, etc.)
 *  - Sensible initial region (Buenos Aires, CABA)
 *
 * Usage:
 * ```tsx
 * <DarkMapView
 *   ref={mapRef}
 *   initialRegion={myRegion}
 *   showsUserLocation
 *   onPress={handlePress}
 * >
 *   <Marker coordinate={...} />
 * </DarkMapView>
 * ```
 *
 * All standard react-native-maps <MapView> props are forwarded.
 */
const DarkMapView = forwardRef<MapView, DarkMapViewProps>(
  (
    {
      forceDark,
      mapPadding,
      style,
      children,
      initialRegion,
      ...rest
    },
    ref
  ) => {
    const { colorScheme } = useTheme();
    const isDark = forceDark !== undefined ? forceDark : colorScheme === 'dark';

    return (
      <MapView
        ref={ref}
        style={[{ flex: 1 }, style]}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        initialRegion={initialRegion ?? MAP_DEFAULTS.INITIAL_REGION}
        mapPadding={mapPadding ?? MAP_DEFAULTS.DEFAULT_MAP_PADDING}
        {...MAP_DEFAULTS.CLEAN_MAP_PROPS}
        {...rest}
      >
        {children}
      </MapView>
    );
  }
);

DarkMapView.displayName = 'DarkMapView';

export default DarkMapView;

// Re-export commonly used types/components for convenience
export { Marker, Circle, Callout } from 'react-native-maps';
export type { Region, EdgePadding, MapPressEvent };
