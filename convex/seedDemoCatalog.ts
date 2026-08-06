import { mutation } from "./_generated/server";
import { hashPassword } from "./passwordHelpers";

const DEMO_PASSWORD = "RamgosDemo1!";

type ListingType = "product" | "service" | "event" | "bono";

type GeoSpot = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const NY_SPOTS: GeoSpot[] = [
  // Manhattan inland (away from Hudson / East River)
  { name: "Empire State, Midtown", address: "350 5th Ave, New York, NY", lat: 40.7484, lng: -73.9857 },
  { name: "Flatiron District", address: "175 5th Ave, New York, NY", lat: 40.7411, lng: -73.9897 },
  { name: "Union Square", address: "Union Square, New York, NY", lat: 40.7359, lng: -73.9911 },
  { name: "SoHo Broadway", address: "520 Broadway, New York, NY", lat: 40.7223, lng: -73.9987 },
  { name: "Greenwich Village", address: "Washington Square, New York, NY", lat: 40.7308, lng: -73.9973 },
  { name: "Upper West Side", address: "72nd St & Columbus Ave, New York, NY", lat: 40.7769, lng: -73.9818 },
  { name: "Upper East Side", address: "86th St & Lexington Ave, New York, NY", lat: 40.7794, lng: -73.9554 },
  { name: "Harlem 125th", address: "125th St & Lenox Ave, New York, NY", lat: 40.809, lng: -73.948 },
  { name: "Chelsea", address: "23rd St & 8th Ave, New York, NY", lat: 40.7456, lng: -74.0015 },
  { name: "Murray Hill", address: "34th St & 3rd Ave, New York, NY", lat: 40.7463, lng: -73.9776 },
  // Brooklyn / Queens inland
  { name: "Park Slope", address: "7th Ave & Union St, Brooklyn, NY", lat: 40.6681, lng: -73.9806 },
  { name: "Prospect Heights", address: "Flatbush Ave & Park Pl, Brooklyn, NY", lat: 40.6758, lng: -73.9685 },
  { name: "Fort Greene", address: "DeKalb Ave & Fort Greene Pl, Brooklyn, NY", lat: 40.6895, lng: -73.974 },
  { name: "Downtown Brooklyn", address: "Court St & Borough Hall, Brooklyn, NY", lat: 40.692, lng: -73.9902 },
  { name: "Williamsburg Bedford", address: "Bedford Ave & N 7th St, Brooklyn, NY", lat: 40.7178, lng: -73.9575 },
  { name: "Jackson Heights", address: "37th Ave & 82nd St, Queens, NY", lat: 40.7498, lng: -73.8836 },
  { name: "Forest Hills", address: "Austin St, Forest Hills, NY", lat: 40.7208, lng: -73.8465 },
  { name: "Flushing Main St", address: "Main St & Roosevelt Ave, Flushing, NY", lat: 40.759, lng: -73.8302 },
  { name: "Astoria Ditmars", address: "Ditmars Blvd & 31st St, Astoria, NY", lat: 40.7754, lng: -73.9095 },
  { name: "Bronx Fordham", address: "Fordham Rd & Grand Concourse, Bronx, NY", lat: 40.862, lng: -73.8975 },
];

const CARACAS_SPOTS: GeoSpot[] = [
  // Caracas metro inland (not coastline / lagoons)
  { name: "Plaza Venezuela", address: "Plaza Venezuela, Caracas", lat: 10.4963, lng: -66.8983 },
  { name: "Sabana Grande", address: "Blvd Sabana Grande, Caracas", lat: 10.4945, lng: -66.8805 },
  { name: "Chacao CCCT", address: "Centro Comercial Chacaíto, Caracas", lat: 10.4908, lng: -66.8558 },
  { name: "Altamira", address: "Plaza Altamira, Caracas", lat: 10.496, lng: -66.8495 },
  { name: "Los Palos Grandes", address: "Av. Francisco de Miranda, Los Palos Grandes", lat: 10.5005, lng: -66.847 },
  { name: "La Castellana", address: "Av. Principal La Castellana, Caracas", lat: 10.5, lng: -66.855 },
  { name: "Las Mercedes", address: "Calle París, Las Mercedes, Caracas", lat: 10.4905, lng: -66.859 },
  { name: "El Rosal", address: "Av. Francisco de Miranda, El Rosal", lat: 10.4925, lng: -66.8615 },
  { name: "Bello Campo", address: "Bello Campo, Chacao, Caracas", lat: 10.494, lng: -66.8505 },
  { name: "San Bernardino", address: "San Bernardino, Caracas", lat: 10.508, lng: -66.882 },
  { name: "La Florida", address: "Av. Libertador, La Florida, Caracas", lat: 10.502, lng: -66.87 },
  { name: "Los Dos Caminos", address: "Av. Sucre, Los Dos Caminos, Caracas", lat: 10.494, lng: -66.83 },
  { name: "Caurimare", address: "Caurimare, Caracas", lat: 10.468, lng: -66.83 },
  { name: "El Hatillo", address: "Plaza Bolívar, El Hatillo, Caracas", lat: 10.4295, lng: -66.816 },
  { name: "Baruta", address: "Plaza Bolívar, Baruta, Caracas", lat: 10.434, lng: -66.875 },
  { name: "La Candelaria", address: "La Candelaria, Caracas", lat: 10.5055, lng: -66.91 },
  { name: "Parque Central", address: "Parque Central, Caracas", lat: 10.498, lng: -66.9 },
  { name: "Quinta Crespo", address: "Quinta Crespo, Caracas", lat: 10.503, lng: -66.916 },
  { name: "Petare Centro", address: "Petare, Caracas", lat: 10.48, lng: -66.805 },
  { name: "Bello Monte", address: "Bello Monte, Caracas", lat: 10.4865, lng: -66.878 },
];

/** Thematic Unsplash photos per listing type (stable hotlink-friendly). */
const IMAGES: Record<ListingType, string[]> = {
  product: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80", // watch
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80", // headphones
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80", // sneakers
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80", // camera
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80", // coffee
  ],
  service: [
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80", // salon
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80", // fitness
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80", // cleaning
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80", // consulting
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80", // cooking class
  ],
  event: [
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80", // concert
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80", // festival
    "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&q=80", // nightlife
    "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80", // crowd event
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80", // outdoor festival
  ],
  bono: [
    "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80", // shopping sale
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80", // checkout
    "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800&q=80", // gift
    "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=800&q=80", // retail
    "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=800&q=80", // gift boxes
  ],
};

const PRODUCT_TITLES = [
  "Reloj Smart Premium",
  "Auriculares Noise Cancel",
  "Zapatillas Runner Pro",
  "Cámara Mirrorless Kit",
  "Kit Café Specialty",
];
const SERVICE_TITLES = [
  "Corte + Styling",
  "Sesión Personal Training",
  "Limpieza Deep Clean",
  "Consultoría Digital 1h",
  "Clase de Cocina",
];
const EVENT_TITLES = [
  "Noche de Live Music",
  "Festival Gastronómico",
  "After Office Rooftop",
  "Meetup Emprendedores",
  "Open Air Cinema",
];
const BONO_TITLES = [
  "Bono 20% Off",
  "Bono 2x1 Consumo",
  "Bono $50 Crédito",
  "Bono VIP Experience",
  "Bono Happy Hour",
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Demo catalog: verified @test.com users + 40 map-ready listings
 * (5 product / 5 service / 5 event / 5 bono) × (NYC + Caracas).
 */
export const seedVerifiedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const password = hashPassword(DEMO_PASSWORD);

    const userDefs = [
      {
        email: "consumer@test.com",
        name: "Demo Consumer",
        role: "consumer" as const,
        username: "consumer_test",
        tier: "Silver",
        avatar: "https://i.pravatar.cc/150?u=consumer_test",
      },
      {
        email: "influencer@test.com",
        name: "Demo Influencer",
        role: "influencer" as const,
        username: "influencer_test",
        tier: "Gold",
        avatar: "https://i.pravatar.cc/150?u=influencer_test",
      },
      {
        email: "business@test.com",
        name: "Demo Business",
        role: "business" as const,
        username: "business_test",
        tier: "Gold",
        nickname: "Ramgos Demo Store",
        businessCategory: "Restaurante / Gastronomía",
        avatar: "https://i.pravatar.cc/150?u=business_test",
      },
      {
        email: "admin@test.com",
        name: "Demo Admin",
        role: "admin" as const,
        username: "admin_test",
        tier: "Platinum",
        avatar: "https://i.pravatar.cc/150?u=admin_test",
      },
    ];

    const userIds: Record<string, string> = {};

    for (const u of userDefs) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", u.email))
        .first();

      const patch = {
        name: u.name,
        role: u.role as any,
        password,
        username: u.username,
        referralCode: u.username.toUpperCase(),
        avatar: u.avatar,
        tier: u.tier,
        kycStatus: "approved",
        emailVerified: true,
        isTest: true,
        subscriptionStatus: "active" as const,
        subscriptionTier: "pro" as const,
        nickname: (u as any).nickname,
        businessCategory: (u as any).businessCategory,
        influencerStatus:
          u.role === "influencer" ? ("approved" as const) : undefined,
        instagramUrl:
          u.role === "influencer"
            ? "https://instagram.com/ramgos_demo"
            : undefined,
        phoneNumber: u.role === "business" ? "+12125550100" : undefined,
        bio:
          u.role === "business"
            ? "Demo store in Midtown Manhattan — listings in NYC & Caracas"
            : undefined,
        storeLocation:
          u.role === "business"
            ? {
                lat: 40.7484,
                lng: -73.9857,
                name: "Ramgos Demo Store · Midtown Manhattan",
                address: "350 5th Ave, New York, NY 10118",
                city: "Manhattan, NY",
              }
            : undefined,
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        userIds[u.email] = String(existing._id);
      } else {
        const id = await ctx.db.insert("users", {
          uid: `demo_${u.role}_${Math.random().toString(36).slice(2, 8)}`,
          email: u.email,
          joinedAt: now,
          ...patch,
        });
        userIds[u.email] = String(id);
      }
    }

    const sellerId = userIds["business@test.com"];
    if (!sellerId) throw new Error("business@test.com no se pudo crear");

    // Wipe all listings so orphaned/old seeds don't pollute the map
    const previous = await ctx.db.query("listings").collect();
    for (const listing of previous) {
      await ctx.db.delete(listing._id);
    }

    const cities: Array<{
      region: "NY" | "CCS";
      label: string;
      spots: GeoSpot[];
      currencyNote: string;
    }> = [
      {
        region: "NY",
        label: "Nueva York",
        spots: NY_SPOTS,
        currencyNote: "USD",
      },
      {
        region: "CCS",
        label: "Caracas",
        spots: CARACAS_SPOTS,
        currencyNote: "USD",
      },
    ];

    const types: ListingType[] = ["product", "service", "event", "bono"];
    const titlesByType: Record<ListingType, string[]> = {
      product: PRODUCT_TITLES,
      service: SERVICE_TITLES,
      event: EVENT_TITLES,
      bono: BONO_TITLES,
    };
    const categoriesByType: Record<ListingType, string> = {
      product: "Retail",
      service: "Servicios",
      event: "Eventos",
      bono: "Bonos",
    };

    let created = 0;
    const summary: Record<string, number> = {};

    for (const city of cities) {
      let spotIndex = 0;
      for (const type of types) {
        for (let i = 0; i < 5; i++) {
          // Unique inland spot per listing — no jitter (jitter pushed pins into rivers)
          const spot = city.spots[spotIndex % city.spots.length];
          spotIndex += 1;
          const titleBase = titlesByType[type][i];
          const title = `${titleBase} · ${city.label}`;
          const image = IMAGES[type][i];
          const key = `${city.region}_${type}`;
          summary[key] = (summary[key] ?? 0) + 1;

          const eventDate = new Date();
          eventDate.setDate(eventDate.getDate() + 14 + i * 3);

          await ctx.db.insert("listings", {
            title,
            description: `${titleBase} publicado por Ramgos Demo Store en ${spot.name}. Ideal para probar el mapa y el marketplace.`,
            price:
              type === "bono"
                ? 15 + i * 5
                : type === "event"
                  ? 25 + i * 10
                  : type === "service"
                    ? 30 + i * 8
                    : 40 + i * 15,
            currency: "USD",
            type,
            category: categoriesByType[type],
            tags: [city.region, type, "demo", city.label.toLowerCase()],
            sellerId,
            stock: type === "event" ? 40 : 25,
            status: "active",
            slug: `${slugify(title)}-${Date.now().toString(36)}-${i}`,
            image,
            gallery: [image],
            images: [
              {
                id: `img-${city.region}-${type}-${i}`,
                url: image,
                isPrimary: true,
                alt: title,
                uploadedAt: now,
              },
            ],
            location: {
              lat: spot.lat,
              lng: spot.lng,
              name: spot.name,
              address: spot.address,
              distanceKm: 0,
            },
            shippingProfile: {
              weightKg: type === "product" ? 1.2 : 0.1,
              allowPickup: true,
              shipsFromCity: spot.name,
              shipsFrom: {
                city: city.label,
                country: city.region === "NY" ? "US" : "VE",
                postalCode: city.region === "NY" ? "10001" : "1060",
              },
            },
            condition: "new",
            openPromotion: true,
            openCommissionRate: 0.15,
            eventDate: type === "event" ? eventDate.toISOString().slice(0, 10) : undefined,
            eventTime: type === "event" ? "20:00" : undefined,
            eventCapacity: type === "event" ? 80 : undefined,
            eventSoldCount: type === "event" ? 0 : undefined,
            validUntil:
              type === "bono"
                ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
                : undefined,
            validityDays: type === "bono" ? 14 : undefined,
            discountValue: type === "bono" ? 20 + i * 5 : undefined,
            discountType: type === "bono" ? "percentage" : undefined,
            discountPercent: type === "bono" ? 20 + i * 5 : undefined,
            views: 10 + i,
            favoriteCount: i,
            orderCount: 0,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }
    }

    return {
      ok: true,
      password: DEMO_PASSWORD,
      users: Object.keys(userIds),
      listingsCreated: created,
      previousDeleted: previous.length,
      breakdown: summary,
      note: "Abrí el mapa y desplazate a Nueva York o Caracas para ver los pines.",
    };
  },
});
