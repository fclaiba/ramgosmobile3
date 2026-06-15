/**
 * Centralized Google Maps custom styling for Ramgos Mobile.
 *
 * Usage with react-native-maps:
 *   <MapView customMapStyle={DARK_MAP_STYLE} />
 *
 * DESIGN PHILOSOPHY:
 *   Ultra-minimal. Only streets, street names, and neighborhood names are visible.
 *   Everything else (water, parks, terrain, POI, transit, buildings) is either
 *   hidden or blended into the dark background so it's invisible.
 */

// ─────────────────────────────────────────────────────────
// DARK MAP STYLE  —  Ultra-minimal, only streets & labels
// ─────────────────────────────────────────────────────────
export const DARK_MAP_STYLE = [
  // ━━━ GLOBAL HIDE RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Hide ALL points of interest (restaurants, shops, parks labels, etc.)
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },

  // Hide ALL transit (bus stops, train stations, metro lines)
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Hide ALL road icons (traffic lights, speed cameras, toll signs)
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Hide land parcel labels
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },

  // ━━━ BASE: DARK BACKGROUND ━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Everything starts pitch black
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },

  // All labels invisible by default (we'll turn on only what we want)
  { elementType: 'labels.text.fill', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // ━━━ STREETS: THE ONLY VISIBLE ELEMENT ━━━━━━━━━━━━━━━━

  // All roads — very subtle dark gray lines
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1a1a1a' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f0f0f' }],
  },

  // Highways — slightly brighter for hierarchy
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#1f1f1f' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // Arterial roads
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#1c1c1c' }],
  },

  // Local roads — thinner, subtler
  {
    featureType: 'road.local',
    elementType: 'geometry',
    stylers: [{ color: '#171717' }],
  },

  // ━━━ STREET NAME LABELS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Highway labels
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4a4a4a' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // Arterial labels
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3d3d3d' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // Local street labels — dimmer, reduced density
  {
    featureType: 'road.local',
    elementType: 'labels',
    stylers: [{ visibility: 'simplified' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#333333' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // ━━━ NEIGHBORHOOD / LOCALITY LABELS ━━━━━━━━━━━━━━━━━━━

  // City names — visible, clean white
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#707070' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // Neighborhood / barrio names — slightly dimmer
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#555555' }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // Sublocality (comunas, partidos)
  {
    featureType: 'administrative.sublocality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#505050' }],
  },
  {
    featureType: 'administrative.sublocality',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0a0a0a' }],
  },

  // ━━━ HIDE EVERYTHING ELSE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Water — blend into background (invisible)
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#080808' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Landscape — same as background (invisible)
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'landscape', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Administrative boundaries — hide the lines
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },

  // Country / province labels — hide (too noisy)
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// ─────────────────────────────────────────────────────────
// LIGHT MAP STYLE  —  Clean minimal (same logic, light tones)
// ─────────────────────────────────────────────────────────
export const LIGHT_MAP_STYLE = [
  // Hide POI, transit, road icons
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },

  // Muted background
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Roads
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  // Street labels
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },

  // Neighborhood labels
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },

  // Water — very subtle
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e8edf0' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Landscape — blend
  { featureType: 'landscape', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Hide country/province labels
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
];

// ─────────────────────────────────────────────────────────
// MAP DEFAULTS  —  Shared constants for all map instances
// ─────────────────────────────────────────────────────────
export const MAP_DEFAULTS = {
  /** Default initial region: Buenos Aires, CABA */
  INITIAL_REGION: {
    latitude: -34.6037,
    longitude: -58.3816,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  },

  /** Default padding so map controls don't overlap UI chrome */
  DEFAULT_MAP_PADDING: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },

  /**
   * Props to pass to every <MapView> to suppress built-in UI chrome.
   * Spread these onto the component:  {...MAP_DEFAULTS.CLEAN_MAP_PROPS}
   */
  CLEAN_MAP_PROPS: {
    showsPointsOfInterest: false,
    showsTraffic: false,
    showsBuildings: false,
    showsIndoors: false,
    showsCompass: false,
    showsMyLocationButton: false,
    toolbarEnabled: false,
    pitchEnabled: false,
    rotateEnabled: false,
  } as const,
} as const;
