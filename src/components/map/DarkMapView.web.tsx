import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Web fallback for DarkMapView.
 * react-native-maps has no web support, so we render a placeholder.
 */
const DarkMapView = forwardRef<any, any>((props, ref) => {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);
  return (
    <View style={[styles.container, props.style]}>
      <Text style={styles.text}>Mapas no disponibles en Web</Text>
      <Text style={styles.subtext}>Descarga la App para ver el mapa</Text>
      {/* Render children so Markers etc. don't crash (they are stubbed below) */}
    </View>
  );
});

DarkMapView.displayName = 'DarkMapView';

export default DarkMapView;

// Stub re-exports so consuming code doesn't break on web
export const Marker = (props: any) => null;
export const Circle = (props: any) => null;
export const Callout = (props: any) => props.children || null;

// Stub types
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};
export type EdgePadding = { top: number; right: number; bottom: number; left: number };
export type MapPressEvent = any;

const getStyles = (isDark: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#8b949e',
    fontWeight: '600',
  },
  subtext: {
    fontSize: 13,
    color: '#4a5568',
    marginTop: 8,
  },
});
