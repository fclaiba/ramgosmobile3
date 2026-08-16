import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../contexts/AuthContext";

export type BusinessInfo = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  website: string;
  instagram: string;
  payout: { available: number; pending: number; total: number };
  overallRating: number;
};

export type BusinessMetrics = {
  summary: {
    availableBalance: number;
    pendingBalance: number;
    withheldBalance: number;
    revenueToday: number;
    redeemedToday: number;
    activeCoupons: number;
    uniqueCustomers: number;
  };
  revenueSeries: Array<{ date: string; revenue: number }>;
  couponLeaders: Array<{ name: string; redemptions: number }>;
};

const defaultMetrics: BusinessMetrics = {
  summary: {
    availableBalance: 0,
    pendingBalance: 0,
    withheldBalance: 0,
    revenueToday: 0,
    redeemedToday: 0,
    activeCoupons: 0,
    uniqueCustomers: 0,
  },
  revenueSeries: [],
  couponLeaders: [],
};

export function useBusiness(userId?: string) {
  const { sessionToken } = useAuth();

  const businessUser = useQuery(
    api.users.getUser,
    userId ? ({ id: userId } as { id: Id<"users"> }) : "skip",
  );

  const metrics = useQuery(
    api.dashboard.getBusinessMetrics,
    userId && sessionToken ? ({ businessId: userId, sessionToken } as { businessId: Id<"users">; sessionToken: string }) : "skip",
  );

  const listings = useQuery(
    api.listings.getMyListings,
    userId && sessionToken ? { sellerId: userId, sessionToken } : "skip",
  ) || [];

  const reviews = useQuery(
    api.reviews.getBySeller,
    userId ? { sellerId: userId } : "skip",
  ) || [];

  const businessInfo: BusinessInfo = {
    id: userId || "unknown",
    name: businessUser?.name || "Cargando...",
    tagline: businessUser?.bio || "",
    description: businessUser?.bio || "",
    category: "",
    contactEmail: businessUser?.email || "",
    phone: "",
    whatsapp: "",
    website: "",
    instagram: "",
    payout: {
      available: businessUser?.balance || 0,
      pending: 0,
      total: businessUser?.balance || 0,
    },
    overallRating: businessUser?.sellerRating || 0,
  };

  const normalizedMetrics: BusinessMetrics = metrics
    ? {
        summary: {
          availableBalance: metrics.summary.availableBalance ?? 0,
          pendingBalance: metrics.summary.pendingBalance ?? 0,
          withheldBalance: 0,
          revenueToday: metrics.summary.revenueToday ?? 0,
          redeemedToday: metrics.summary.redeemedToday ?? 0,
          activeCoupons: metrics.summary.activeCoupons ?? 0,
          uniqueCustomers: metrics.summary.uniqueCustomers ?? 0,
        },
        revenueSeries: metrics.revenueSeries || [],
        couponLeaders: metrics.couponLeaders || [],
      }
    : defaultMetrics;

  const coupons = listings.filter((l: any) => l.type === "bono");

  return {
    businessInfo,
    metrics: normalizedMetrics,
    coupons,
    reviews,
    isLoading: businessUser === undefined || metrics === undefined,
  };
}
