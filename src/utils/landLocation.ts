/**
 * Land-only location helpers for map pins / listing geolocation.
 * Uses Nominatim reverse geocode to reject water (rivers, sea, lakes).
 */

export type LandResolveResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      address: string;
      snapped: boolean;
    }
  | {
      ok: false;
      reason: "water" | "network";
      message: string;
    };

const WATER_CLASSES = new Set(["waterway", "natural"]);
const WATER_TYPES = new Set([
  "water",
  "bay",
  "strait",
  "coastline",
  "river",
  "stream",
  "canal",
  "drain",
  "ditch",
  "dock",
  "boatyard",
  "harbour",
  "harbor",
  "marina",
  "reservoir",
  "wetland",
  "beach",
  "ocean",
  "sea",
]);

const WATER_NAME_RE =
  /\b(océano|oceano|mar\b|río|rio\b|lago|laguna|bahía|bahia|canal|harbor|harbour|east river|hudson|atlantic|caribbean|caribe|gulf|estuary|marina)\b/i;

type NominatimPayload = {
  display_name?: string;
  class?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  error?: string;
  address?: Record<string, string>;
  lat?: string;
  lon?: string;
};

export function isWaterNominatimResult(data: NominatimPayload | null | undefined): boolean {
  if (!data || data.error) return false;
  const cls = (data.class || data.category || "").toLowerCase();
  const typ = (data.type || data.addresstype || "").toLowerCase();
  if (WATER_CLASSES.has(cls) && (WATER_TYPES.has(typ) || typ.includes("water"))) return true;
  if (WATER_TYPES.has(typ)) return true;
  if (data.display_name && WATER_NAME_RE.test(data.display_name)) {
    // Only treat as water if there's no street / road signal
    const addr = data.address || {};
    const hasStreet = !!(addr.road || addr.pedestrian || addr.footway || addr.house_number);
    if (!hasStreet) return true;
  }
  return false;
}

export function hasUsableLandAddress(data: NominatimPayload | null | undefined): boolean {
  if (!data || data.error) return false;
  if (isWaterNominatimResult(data)) return false;
  const addr = data.address || {};
  return !!(
    addr.road ||
    addr.pedestrian ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    data.display_name
  );
}

async function nominatimReverse(lat: number, lng: number): Promise<NominatimPayload | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
      `&format=jsonv2&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "es",
        // Nominatim usage policy: identify the app
        "User-Agent": "RamgosMobile/1.0 (demo; land-check)",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as NominatimPayload;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Spiral offsets (~80–250 m) to escape rivers / coastline. Keep short (Nominatim ≤1 req/s). */
const LAND_SNAP_OFFSETS: Array<[number, number]> = [
  [0.0015, 0],
  [-0.0015, 0],
  [0, 0.0015],
  [0, -0.0015],
];

/**
 * Resolve a map tap to a land location. If the point is water, try nearby land snaps.
 */
export async function resolveLandLocation(
  lat: number,
  lng: number,
): Promise<LandResolveResult> {
  const primary = await nominatimReverse(lat, lng);
  if (!primary) {
    return {
      ok: false,
      reason: "network",
      message: "No pudimos validar la ubicación. Probá de nuevo.",
    };
  }

  if (!isWaterNominatimResult(primary) && hasUsableLandAddress(primary)) {
    return {
      ok: true,
      lat,
      lng,
      address: primary.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      snapped: false,
    };
  }

  // Point is water (or unusable) — try land snaps
  for (const [dLat, dLng] of LAND_SNAP_OFFSETS) {
    await sleep(1100); // Nominatim: ≤1 req/s
    const candidateLat = lat + dLat;
    const candidateLng = lng + dLng;
    const data = await nominatimReverse(candidateLat, candidateLng);
    if (data && !isWaterNominatimResult(data) && hasUsableLandAddress(data)) {
      return {
        ok: true,
        lat: candidateLat,
        lng: candidateLng,
        address: data.display_name || `${candidateLat.toFixed(5)}, ${candidateLng.toFixed(5)}`,
        snapped: true,
      };
    }
  }

  return {
    ok: false,
    reason: "water",
    message: "Ese punto está sobre agua. Elegí un lugar en tierra firme.",
  };
}
