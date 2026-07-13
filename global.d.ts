/// <reference types="nativewind/types" />

declare module '*.css';

declare module 'react-native-safe-area-context';

declare module 'expo-location' {
  export type LocationObject = {
    coords: {
      latitude: number;
      longitude: number;
      altitude: number | null;
      accuracy: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
    };
    timestamp: number;
  };

  export enum Accuracy {
    Lowest = 1,
    Low = 2,
    Balanced = 3,
    High = 4,
    Highest = 5,
    BestForNavigation = 6,
  }

  export const LocationAccuracy: typeof Accuracy;

  export type LocationGeocodedAddress = {
    city?: string | null;
    country?: string | null;
    district?: string | null;
    isoCountryCode?: string | null;
    name?: string | null;
    postalCode?: string | null;
    region?: string | null;
    street?: string | null;
    streetNumber?: string | null;
    subregion?: string | null;
    timezone?: string | null;
  };

  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function getLastKnownPositionAsync(
    options: Record<string, unknown>
  ): Promise<LocationObject | null>;
  export function getCurrentPositionAsync(
    options: Record<string, unknown>
  ): Promise<LocationObject>;
  export function reverseGeocodeAsync(location: {
    latitude: number;
    longitude: number;
  }): Promise<LocationGeocodedAddress[]>;
}

type Timeout = number;
