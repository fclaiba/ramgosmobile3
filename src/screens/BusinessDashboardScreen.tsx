import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Plus as PlusIcon,
  QrCode,
  Tag,
  DollarSign,
  Users,
  Wallet,
  TrendingUp,
  Trophy,
  BarChart3,
  ChevronRight,
  MoreHorizontal,
  ShieldAlert,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  UserPlus,
  X,
} from "lucide-react-native";
import { MobileHeader } from "../components/MobileHeader";
import { Badge } from "../components/ui/badge";
import { Coupon } from "../contexts/BusinessContext";
import { useBusiness } from "../hooks/useBusiness";
import { useFintech } from "../contexts/FintechContext";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { useActionGate } from "../utils/useActionGate";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../contexts/AuthContext";
import { useResponsive } from "../hooks/useResponsive";
import { ResponsiveLayout } from "../components/ResponsiveLayout";
import { DesktopSidebar } from "../components/DesktopSidebar";
import { OverviewTab } from "../components/dashboard/OverviewTab";
import { InventoryManager } from "../components/dashboard/InventoryManager";
import { ReviewsTab } from "../components/dashboard/ReviewsTab";
import { InfluencersTab } from "../components/dashboard/InfluencersTab";

type DashboardTab = "overview" | "bonos" | "reviews" | "influencers";

const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview", label: "Resumen" },
  { id: "bonos", label: "Mis Bonos" },
  { id: "reviews", label: "Reseñas" },
  { id: "influencers", label: "Influencers" },
];

import { formatCurrency, formatDateShort, getCouponStatusStyles } from "../utils/formatters";
import { glassTokens, glassGradient } from "../utils/glass";

export default function BusinessDashboardScreen({
  isTabMode,
  onMenuPress,
  route,
}: any) {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const { user, sessionToken } = useAuth();
  const { businessInfo, metrics, coupons, reviews } = useBusiness(user?.id);
  const {
    ensureWalletAccount,
    getWalletByOwner,
    requestWithdrawal,
    getKycStatus,
  } = useFintech();
  const { gateWithdraw } = useActionGate();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";
  const styles = getStyles(isDark);
  const { show } = useToast();
  const { isDesktop } = useResponsive();

  // Stripe Connect V2 — onboarding to receive marketplace payouts.
  // Flow:
  //   1) ensureConnectAccount — creates a V2 account if user has none, else returns existing id.
  //   2) createOnboardingLink — returns a Stripe-hosted KYC URL we open in browser.
  //   3) On return, poll getAccountStatus to refresh the banner state.
  const _api = api as any;
  const ensureConnectAccountAction = useAction(
    _api.connect?.ensureConnectAccount as any,
  );
  const createOnboardingLinkAction = useAction(
    _api.connect?.createOnboardingLink as any,
  );
  const getAccountStatusAction = useAction(
    _api.connect?.getAccountStatus as any,
  );
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectStatus, setConnectStatus] = useState<{
    readyToReceivePayments: boolean;
    onboardingComplete: boolean;
  } | null>(null);
  const stripeConnectAccountId: string | undefined = (user as any)
    ?.stripeConnectAccountId;

  // ─── Influencer campaigns (server-backed) ──────────────────────────
  // List the campaigns where this business is the counterparty plus
  // mutations to invite a new influencer / accept-or-reject pending
  // proposals from influencers / pause or end live campaigns. Backed
  // by `convex/campaigns.ts` and the `influencerCampaigns` table.
  const businessCampaigns =
    useQuery(
      api.campaigns.getBusinessCampaigns,
      user?.id ? { businessId: user.id as any } : "skip",
    ) ?? [];
  const inviteInfluencerMutation = useMutation(api.campaigns.inviteInfluencer);
  const respondToCampaignMutation = useMutation(
    api.campaigns.respondToCampaign,
  );
  const endCampaignMutation = useMutation(api.campaigns.endCampaign);
  const pauseCampaignMutation = useMutation(api.campaigns.pauseCampaign);

  // Whitelist Mutations and Queries
  const whitelist =
    useQuery(api.influencers.getWhitelist, user?.id ? {} : "skip") ?? [];
  const addToWhitelistMutation = useMutation(api.influencers.addToWhitelist);
  const removeFromWhitelistMutation = useMutation(
    api.influencers.removeFromWhitelist,
  );

  // Lookup by @username or referralCode — never by email.
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteLookupTerm, setInviteLookupTerm] = useState("");
  const [invitedInfluencerId, setInvitedInfluencerId] = useState<string | null>(
    null,
  );
  const [inviteRatePct, setInviteRatePct] = useState("5");
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const lookupResult = useQuery(
    api.campaigns.lookupInfluencer,
    user?.id && inviteLookupTerm.trim().length > 0
      ? { handleOrCode: inviteLookupTerm }
      : "skip",
  );

  useEffect(() => {
    if (lookupResult?._id) {
      setInvitedInfluencerId(String(lookupResult._id));
    }
  }, [lookupResult]);

  const pendingProposalsFromInfluencers = useMemo(
    () =>
      businessCampaigns.filter(
        (c: any) => c.status === "pending" && c.initiatedBy === "influencer",
      ),
    [businessCampaigns],
  );
  const pendingMyInvitations = useMemo(
    () =>
      businessCampaigns.filter(
        (c: any) => c.status === "pending" && c.initiatedBy === "business",
      ),
    [businessCampaigns],
  );
  const activeBusinessCampaigns = useMemo(
    () =>
      businessCampaigns.filter(
        (c: any) => c.status === "active" || c.status === "paused",
      ),
    [businessCampaigns],
  );

  const convexListings =
    useQuery(
      api.listings.getMyListings,
      user?.id && sessionToken ? { sellerId: user.id, sessionToken } : "skip",
    ) || [];

  const handleInviteInfluencer = async () => {
    if (!user?.id) return;
    if (!invitedInfluencerId) {
      show("Por favor, selecciona un influencer válido primero", "error");
      return;
    }
    setSubmittingInvite(true);
    try {
      await inviteInfluencerMutation({
        businessId: user.id as Id<"users">,
        influencerId: invitedInfluencerId as Id<"users">,
        commissionRate: parseFloat(inviteRatePct) / 100,
      });
      show("Invitación enviada", "success");
      setInviteModalVisible(false);
      setInviteLookupTerm("");
      setInvitedInfluencerId(null);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleAddToWhitelist = async () => {
    if (!invitedInfluencerId) {
      show("Por favor, selecciona un influencer válido primero", "error");
      return;
    }
    setSubmittingInvite(true);
    try {
      await addToWhitelistMutation({
        influencerId: invitedInfluencerId as Id<"users">,
      });
      show("Influencer añadido a la Whitelist", "success");
      setInviteModalVisible(false);
      setInviteLookupTerm("");
      setInvitedInfluencerId(null);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRemoveFromWhitelist = async (influencerId: string) => {
    try {
      await removeFromWhitelistMutation({ influencerId: influencerId as Id<"users"> });
      show("Influencer removido de la Whitelist", "success");
    } catch (e: any) {
      show(e.message, "error");
    }
  };

  const handleRespondToInfluencerProposal = async (
    campaignId: string,
    decision: "accept" | "reject",
  ) => {
    if (!user?.id) return;
    try {
      await respondToCampaignMutation({
        campaignId: campaignId as any,
        decision,
      });
      show(
        decision === "accept" ? "Propuesta aceptada." : "Propuesta rechazada.",
        "success",
      );
    } catch (e: any) {
      show(e?.message ?? "No se pudo responder.", "error");
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    if (!user?.id) return;
    try {
      await pauseCampaignMutation({
        campaignId: campaignId as any,
      });
      show("Campaña pausada.", "success");
    } catch (e: any) {
      show(e?.message ?? "No se pudo pausar.", "error");
    }
  };

  const handleEndBusinessCampaign = async (campaignId: string) => {
    if (!user?.id) return;
    try {
      await endCampaignMutation({
        campaignId: campaignId as any,
      });
      show("Campaña finalizada.", "success");
    } catch (e: any) {
      show(e?.message ?? "No se pudo finalizar.", "error");
    }
  };

  // Refresh status whenever we have an account id (cheap; reads live from Stripe).
  useEffect(() => {
    let cancelled = false;
    if (!stripeConnectAccountId) {
      setConnectStatus(null);
      return;
    }
    (async () => {
      try {
        const status = await getAccountStatusAction({
          accountId: stripeConnectAccountId,
        });
        if (!cancelled && status) {
          setConnectStatus({
            readyToReceivePayments: !!(status as any).readyToReceivePayments,
            onboardingComplete: !!(status as any).onboardingComplete,
          });
        }
      } catch (err) {
        console.warn("[Connect V2] status fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripeConnectAccountId, getAccountStatusAction, user?.id]);

  const handleStripeConnectOnboarding = async () => {
    if (!user) {
      show("Inicia sesión primero", "error");
      return;
    }
    setConnectLoading(true);
    try {
      // Step 1: ensure account exists (idempotent — creates only if missing).
      const ensured = await ensureConnectAccountAction({
        displayName: businessInfo?.name || user.name || "Ramgos seller",
        contactEmail: user.email,
      });
      const accountId = (ensured as any)?.accountId;
      if (!accountId) throw new Error("No se obtuvo accountId de Stripe.");

      // Step 2: open Stripe-hosted onboarding URL.
      const link = await createOnboardingLinkAction({
        accountId,
      });
      const url = (link as any)?.url;
      if (url) await Linking.openURL(url);
    } catch (e: any) {
      show(e.message || "Error al iniciar onboarding de Stripe", "error");
    } finally {
      setConnectLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id || !ensureWalletAccount || !businessInfo?.name || businessInfo.name === 'Cargando...') return;
    ensureWalletAccount(user.id, "business", businessInfo.name);
  }, [user?.id, businessInfo?.name, ensureWalletAccount]);

  const wallet = getWalletByOwner
    ? getWalletByOwner(user?.id ?? "business_demo")
    : null;
  const kycStatus = getKycStatus
    ? getKycStatus(user?.id ?? "business_demo")
    : null;
  const verificationPending =
    route?.params?.verificationPending || kycStatus === "pending";
  const isVerified = kycStatus === "approved";

  const availableBalance = wallet
    ? wallet.balances.available
    : metrics.summary.availableBalance;
  const pendingBalance = wallet
    ? wallet.balances.pending
    : metrics.summary.pendingBalance;
  const withheldBalance = wallet
    ? wallet.balances.reserved
    : metrics.summary.withheldBalance;

  const kycCardTitle = verificationPending
    ? "Verificación en revisión"
    : kycStatus === "rejected"
      ? "Verificación rechazada"
      : "Completa tu verificación KYC";

  const kycCardDescription = verificationPending
    ? "Tus documentos están siendo revisados. Te notificaremos pronto."
    : kycStatus === "rejected"
      ? "Requerimos documentación adicional. Revisa tu correo."
      : "Habilita retiros confirmando tu identidad.";

  const handleWithdrawal = () => {
    if (!wallet) {
      show("Error: Billetera no encontrada.", "error");
      return;
    }

    const ok = gateWithdraw({
      onAllowed: () =>
        navigation.navigate("Withdrawal", { ownerId: wallet.ownerId }),
    });

    if (!ok && kycStatus === "rejected") {
      show("KYC Rechazado: Corrige tus datos para retirar.", "error");
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        id: "revenueToday",
        label: "Ingresos Hoy",
        value: formatCurrency(metrics.summary.revenueToday),
        icon: DollarSign,
        colors: ["#7C3AED", "#C026D3"] as const,
      },
      {
        id: "redeemedToday",
        label: "Canjes Hoy",
        value: metrics.summary.redeemedToday.toString(),
        icon: QrCode,
        colors: ["#059669", "#34D399"] as const,
      },
      {
        id: "activeCoupons",
        label: "Bonos Activos",
        value: metrics.summary.activeCoupons.toString(),
        icon: Tag,
        colors: ["#2563EB", "#60A5FA"] as const,
      },
      {
        id: "customers",
        label: "Clientes",
        value: metrics.summary.uniqueCustomers.toString(),
        icon: Users,
        colors: ["#EA580C", "#FDBA74"] as const,
      },
    ],
    [metrics.summary],
  );

  const chartData = useMemo(() => {
    const maxRevenue = Math.max(
      ...metrics.revenueSeries.map((point) => point.revenue),
      1,
    );
    return metrics.revenueSeries.map((point) => ({
      ...point,
      heightPercent: Math.max(15, (point.revenue / maxRevenue) * 100),
    }));
  }, [metrics.revenueSeries]);

  const layout = useMemo(() => {
    const pagePadding = 16;
    const maxWidth = 980;
    const containerWidth = Math.min(
      Math.max(width - pagePadding * 2, 280),
      maxWidth,
    );
    const gap = 16;
    const summaryCols = containerWidth < 360 ? 1 : containerWidth < 920 ? 2 : 4;
    const summaryCardWidth = Math.floor(
      (containerWidth - gap * (summaryCols - 1)) / summaryCols,
    );
    const contentPaddingBottom =
      Math.max(16, insets.bottom) + (isTabMode ? 96 : 24);
    return {
      containerWidth,
      gap,
      summaryCols,
      summaryCardWidth,
      contentPaddingBottom,
    };
  }, [width, insets.bottom, isTabMode]);

  return (
    <ResponsiveLayout
      style={styles.container}
      sidebar={
        !isTabMode ? (
          <DesktopSidebar
            activeSection="dashboard"
            onSectionChange={(section) => {
              if (section === "home") navigation.navigate("Home");
              else if (section === "marketplace")
                navigation.navigate("Marketplace");
              else if (section === "social") navigation.navigate("Social");
            }}
          />
        ) : undefined
      }
    >
      <LinearGradient
        colors={glassGradient(isDark)}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <MobileHeader
        title="Panel de Negocio"
        subtitle="Gestión y métricas"
        backButton={!isTabMode}
        onBack={!isTabMode ? () => navigation.goBack() : undefined}
        onMenuPress={isTabMode ? onMenuPress : undefined}
        actions={
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate("BusinessScanner")}
              style={styles.scanBtn}
            >
              <QrCode size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate("BusinessCreate")}
              style={styles.createBtn}
            >
              <PlusIcon size={20} color="#fff" />
              <Text style={styles.createBtnText}>Nuevo</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.contentPaddingBottom },
        ]}
      >
        <View style={[styles.page, { maxWidth: layout.containerWidth }]}>
          {/* KYC Warning */}
          {!isVerified && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                !verificationPending && navigation.navigate("VerifyBusiness")
              }
              style={[
                styles.kycBanner,
                {
                  borderColor:
                    kycStatus === "rejected"
                      ? isDark
                        ? "#7F1D1D"
                        : "#FECACA"
                      : isDark
                        ? "#78350F"
                        : "#FEF3C7",
                  backgroundColor:
                    kycStatus === "rejected"
                      ? isDark
                        ? "rgba(127, 29, 29, 0.2)"
                        : "#FEF2F2"
                      : isDark
                        ? "rgba(120, 53, 15, 0.2)"
                        : "#FFFBEB",
                },
              ]}
            >
              <View
                style={[
                  styles.kycIcon,
                  {
                    backgroundColor:
                      kycStatus === "rejected"
                        ? isDark
                          ? "#991B1B"
                          : "#FEE2E2"
                        : isDark
                          ? "#92400E"
                          : "#FDE68A",
                  },
                ]}
              >
                {verificationPending ? (
                  <ShieldAlert
                    size={18}
                    color={isDark ? "#FEF3C7" : "#B45309"}
                  />
                ) : (
                  <AlertTriangle
                    size={18}
                    color={isDark ? "#FECACA" : "#B91C1C"}
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[
                    styles.kycTitle,
                    {
                      color:
                        kycStatus === "rejected"
                          ? isDark
                            ? "#F87171"
                            : "#991B1B"
                          : isDark
                            ? "#FCD34D"
                            : "#92400E",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {kycCardTitle}
                </Text>
                <Text
                  style={[
                    styles.kycDesc,
                    {
                      color:
                        kycStatus === "rejected"
                          ? isDark
                            ? "#FECACA"
                            : "#B91C1C"
                          : isDark
                            ? "#FDE68A"
                            : "#B45309",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {kycCardDescription}
                </Text>
              </View>
              {!verificationPending && (
                <ChevronRight
                  size={18}
                  color={isDark ? "#9CA3AF" : "#9CA3AF"}
                />
              )}
            </TouchableOpacity>
          )}

          {/* Stripe Connect — seller bank onboarding (V2) */}
          {(() => {
            // Banner state has 3 modes:
            //  - no account: prompt onboarding (creates V2 account on click)
            //  - account but onboarding incomplete: prompt to finish KYC
            //  - account with payouts active: show "Cuenta lista para recibir pagos"
            const hasAccount = !!stripeConnectAccountId;
            const ready = !!connectStatus?.readyToReceivePayments;
            const onboardingDone = !!connectStatus?.onboardingComplete;
            const isReadyState = hasAccount && ready;
            const isPendingState = hasAccount && !ready;

            const palette = isReadyState
              ? {
                  border: isDark ? "#064E3B" : "#A7F3D0",
                  bg: isDark ? "rgba(5,150,105,0.15)" : "#ECFDF5",
                  icoBg: isDark ? "#065F46" : "#D1FAE5",
                  text: isDark ? "#6EE7B7" : "#065F46",
                  desc: isDark ? "#A7F3D0" : "#047857",
                }
              : isPendingState
                ? {
                    border: isDark ? "#78350F" : "#FEF3C7",
                    bg: isDark ? "rgba(120,53,15,0.15)" : "#FFFBEB",
                    icoBg: isDark ? "#92400E" : "#FDE68A",
                    text: isDark ? "#FCD34D" : "#92400E",
                    desc: isDark ? "#FDE68A" : "#B45309",
                  }
                : {
                    border: isDark ? "#1E3A5F" : "#BFDBFE",
                    bg: isDark ? "rgba(37,99,235,0.15)" : "#EFF6FF",
                    icoBg: isDark ? "#1E40AF" : "#DBEAFE",
                    text: isDark ? "#93C5FD" : "#1D4ED8",
                    desc: isDark ? "#BFDBFE" : "#1E40AF",
                  };

            const title = isReadyState
              ? "Cuenta de pagos lista"
              : isPendingState
                ? "Completa tu onboarding de Stripe"
                : "Conectar cuenta de pagos";

            const desc = isReadyState
              ? `Stripe Connect activo · ${stripeConnectAccountId!.slice(0, 16)}...`
              : isPendingState
                ? onboardingDone
                  ? "Stripe está revisando tu cuenta. Te avisamos cuando esté lista."
                  : "Faltan datos para activar tus pagos. Continúa el onboarding."
                : "Vincula tu cuenta bancaria para recibir tus pagos vía Stripe Connect.";

            const Icon = isReadyState ? CheckCircle2 : CreditCard;

            return (
              <TouchableOpacity
                activeOpacity={isReadyState ? 1 : 0.85}
                onPress={
                  isReadyState ? undefined : handleStripeConnectOnboarding
                }
                style={[
                  styles.kycBanner,
                  { borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              >
                <View
                  style={[styles.kycIcon, { backgroundColor: palette.icoBg }]}
                >
                  <Icon size={18} color={palette.text} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.kycTitle, { color: palette.text }]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text
                    style={[styles.kycDesc, { color: palette.desc }]}
                    numberOfLines={2}
                  >
                    {desc}
                  </Text>
                </View>
                {connectLoading ? (
                  <ActivityIndicator size="small" color={palette.text} />
                ) : (
                  !isReadyState && (
                    <ExternalLink size={18} color={palette.text} />
                  )
                )}
              </TouchableOpacity>
            );
          })()}

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.id && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* --- OVERVIEW TAB --- */}
          {activeTab === "overview" && (
            <OverviewTab
              styles={styles}
              layout={layout}
              summaryCards={summaryCards}
              availableBalance={availableBalance}
              pendingBalance={pendingBalance}
              withheldBalance={withheldBalance}
              isVerified={isVerified}
              wallet={wallet}
              handleWithdrawal={handleWithdrawal}
              metrics={metrics}
              chartData={chartData}
              isDark={isDark}
            />
          )}

          {/* --- COUPONS TAB --- */}
          {activeTab === "bonos" && (
            <InventoryManager
              styles={styles}
              convexListings={convexListings}
              navigation={navigation}
              isDark={isDark}
            />
          )}

          {/* --- REVIEWS TAB --- */}
          {activeTab === "reviews" && (
            <ReviewsTab
              styles={styles}
              businessInfo={businessInfo}
              reviews={reviews}
              isDark={isDark}
            />
          )}

          {/* --- INFLUENCERS TAB --- */}
          {activeTab === "influencers" && (
            <InfluencersTab
              styles={styles}
              setInviteModalVisible={setInviteModalVisible}
              pendingProposalsFromInfluencers={pendingProposalsFromInfluencers}
              pendingMyInvitations={pendingMyInvitations}
              whitelist={whitelist}
              handleRespondToInfluencerProposal={handleRespondToInfluencerProposal}
              handleEndBusinessCampaign={handleEndBusinessCampaign}
              handleRemoveFromWhitelist={handleRemoveFromWhitelist}
              isDark={isDark}
            />
          )}
        </View>
      </ScrollView>

      {/* --- Invite Influencer Modal --- */}
      <Modal
        visible={inviteModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          ]}
        >
          {Platform.OS !== "web" ? (
            <BlurView
              intensity={isDark ? 48 : 64}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.modalBlurWeb]} />
          )}
          <View style={styles.modalDim} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invitar influencer</Text>
              <TouchableOpacity
                onPress={() => setInviteModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={18} color={isDark ? "#CBD5E1" : "#64748b"} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>@ del influencer</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="@usuario o código JORGE10"
              placeholderTextColor="#9CA3AF"
              value={inviteLookupTerm}
              onChangeText={(v) => {
                setInviteLookupTerm(v);
                setInvitedInfluencerId(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {inviteLookupTerm.trim().length > 0 && lookupResult && (
              <View
                style={{
                  backgroundColor: isDark ? "#0f172a" : "#f0fdf4",
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: "#16a34a",
                }}
              >
                <Text
                  style={{
                    color: isDark ? "#86efac" : "#166534",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  @{(lookupResult as any).username}
                </Text>
                <Text
                  style={{
                    color: isDark ? "#86efac" : "#166534",
                    fontSize: 12,
                  }}
                >
                  {(lookupResult as any).name}
                  {(lookupResult as any).referralCode
                    ? ` • ${(lookupResult as any).referralCode}`
                    : ""}
                </Text>
              </View>
            )}
            {inviteLookupTerm.trim().length > 0 && !lookupResult && (
              <Text
                style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}
              >
                No se encontró un influencer con ese @ o código.
              </Text>
            )}

            <Text style={styles.modalLabel}>Comisión por venta (%)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="5"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={inviteRatePct}
              onChangeText={setInviteRatePct}
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.modalCancelBtn]}
                onPress={() => setInviteModalVisible(false)}
              >
                <Text style={{ color: isDark ? '#D1D5DB' : '#64748b', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, submittingInvite && { opacity: 0.7 }]}
                onPress={handleAddToWhitelist}
                disabled={submittingInvite}
              >
                {submittingInvite ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    Añadir a Whitelist
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ResponsiveLayout>
  );
}

const getStyles = (isDark: boolean) => {
  const glass = glassTokens(isDark);
  const glassCard = {
    backgroundColor: glass.bg,
    borderWidth: 1,
    borderColor: glass.border,
    ...glass.shadow,
    ...glass.backdrop,
  } as const;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#09090B' : '#FAFAFA' },
    content: { padding: 16, paddingBottom: 100 },
    page: { width: "100%", alignSelf: "center", maxWidth: 980 },

    headerActions: { flexDirection: "row", gap: 8 },
    scanBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? "#1F2937" : "#111827",
      alignItems: "center",
      justifyContent: "center",
    },
    createBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#2563EB",
      paddingHorizontal: 12,
      height: 36,
      borderRadius: 18,
      gap: 4,
    },
    createBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

    /* KYC Banner */
    kycBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 12,
      marginBottom: 20,
      borderWidth: 1,
    },
    kycIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    kycTitle: { fontWeight: "700", fontSize: 14 },
    kycDesc: { fontSize: 12 },

    /* Tabs */
    tabsContainer: {
      flexDirection: "row",
      borderRadius: 14,
      padding: 4,
      marginBottom: 20,
      ...glassCard,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 8,
    },
    tabActive: { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.95)" },
    tabText: {
      fontSize: 13,
      fontWeight: "600",
      color: isDark ? "#9CA3AF" : "#6B7280",
    },
    tabTextActive: { color: isDark ? "#F9FAFB" : "#111827" },

    sectionGap: { gap: 16 },

    /* Grid */
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    summaryCard: {
      borderRadius: 20,
      overflow: "hidden",
      height: 110,
      shadowColor: "#2563EB",
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 4,
    },
    summaryContent: { flex: 1, padding: 16, justifyContent: "space-between" },
    summaryIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(255,255,255,0.2)" : "#fff",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
    },
    summaryValue: {
      fontSize: 22,
      fontWeight: "800",
      color: "#fff",
      marginTop: 8,
    },
    summaryLabel: {
      fontSize: 12,
      color: "rgba(255,255,255,0.9)",
      fontWeight: "600",
    },

    /* Balance Card */
    balanceCard: {
      borderRadius: 24,
      overflow: "hidden",
      ...glassCard,
    },
    balanceHeader: { padding: 20 },
    balanceLabelLight: {
      color: "#9CA3AF",
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    balanceValueMain: {
      color: "#fff",
      fontSize: 32,
      fontWeight: "700",
      marginVertical: 4,
    },
    walletIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.1)",
      alignItems: "center",
      justifyContent: "center",
    },

    balanceStatsRow: {
      flexDirection: "row",
      marginTop: 16,
      alignItems: "center",
    },
    dividerVertical: {
      width: 1,
      height: 24,
      backgroundColor: "rgba(255,255,255,0.2)",
      marginHorizontal: 16,
    },
    balanceStatLabel: { color: "#9CA3AF", fontSize: 11 },
    balanceStatValue: { color: "#fff", fontSize: 16, fontWeight: "600" },

    balanceActions: {
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    withdrawBtn: {
      backgroundColor: isDark ? "#111827" : "#111827",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    withdrawBtnDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
    withdrawBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    withdrawBtnTextDisabled: { color: "#9CA3AF" },
    payoutDate: { fontSize: 11, color: "#6B7280" },

    /* Chart Card */
    chartCard: {
      borderRadius: 20,
      padding: 20,
      ...glassCard,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    chartArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      height: 140,
    },
    barGroup: { alignItems: "center", gap: 6, flex: 1 },
    barTrack: {
      width: 8,
      height: "100%",
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      borderRadius: 4,
      justifyContent: "flex-end",
    },
    barFill: { width: "100%", borderRadius: 4 },
    barLabel: { fontSize: 10, color: "#6B7280" },

    /* List Card */
    listCard: {
      borderRadius: 20,
      ...glassCard,
    },
    listItem: {
      flexDirection: "row",
      padding: 16,
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(217, 119, 6, 0.2)" : "#FEF3C7",
      alignItems: "center",
      justifyContent: "center",
    },
    rankText: {
      fontSize: 12,
      fontWeight: "700",
      color: isDark ? "#FCD34D" : "#D97706",
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    itemSub: { fontSize: 12, color: "#6B7280" },
    itemValue: { fontSize: 14, fontWeight: "700", color: "#059669" },

    /* Coupons Tab */
    bigCreateBtn: {
      height: 56,
      borderRadius: 16,
      overflow: "hidden",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: "#2563EB",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 5,
    },
    bigCreateText: { color: "#fff", fontSize: 16, fontWeight: "700" },

    emptyState: { alignItems: "center", padding: 40, gap: 12 },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: isDark ? "#F9FAFB" : "#374151",
    },
    emptyDesc: { fontSize: 14, color: "#9CA3AF" },

    couponCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    couponHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    couponTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: isDark ? "#F9FAFB" : "#111827",
      marginBottom: 2,
    },
    couponCode: {
      fontSize: 12,
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      color: "#6B7280",
    },
    statusTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    progressSection: { marginBottom: 16 },
    progressLabel: { fontSize: 12, color: "#6B7280" },
    progressValue: {
      fontSize: 12,
      fontWeight: "600",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    progressBarBg: {
      height: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      borderRadius: 3,
      marginTop: 4,
    },
    progressBarFill: { height: "100%", borderRadius: 3 },
    couponFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? "#374151" : "#F9FAFB",
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: {
      fontSize: 12,
      color: isDark ? "#9CA3AF" : "#4B5563",
      fontWeight: "500",
    },

    /* Reviews Tab */
    ratingCard: {
      flexDirection: "row",
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    ratingLeft: {
      alignItems: "center",
      paddingRight: 20,
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    ratingBig: {
      fontSize: 36,
      fontWeight: "800",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    ratingCount: { fontSize: 12, color: "#6B7280", marginTop: 4 },
    ratingRight: { flex: 1, paddingLeft: 20, justifyContent: "center" },
    ratingMsg: {
      fontSize: 13,
      color: isDark ? "#9CA3AF" : "#4B5563",
      fontStyle: "italic",
    },

    reviewItem: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    reviewHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    reviewerName: {
      fontSize: 14,
      fontWeight: "700",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    reviewDate: { fontSize: 11, color: "#9CA3AF" },
    starsRow: { flexDirection: "row", gap: 2, marginBottom: 8 },
    starDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    },
    starDotActive: { backgroundColor: "#F59E0B" },
    reviewText: {
      fontSize: 13,
      color: isDark ? "#D1D5DB" : "#4B5563",
      lineHeight: 20,
    },

    /* Influencer Invite Modal */
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      padding: 20,
      overflow: "hidden",
    },
    modalBlurWeb: {
      backgroundColor: isDark ? "rgba(9,9,11,0.55)" : "rgba(250,250,250,0.45)",
      // @ts-expect-error web backdrop
      backdropFilter: "blur(18px)",
      // @ts-expect-error web webkit backdrop
      WebkitBackdropFilter: "blur(18px)",
    },
    modalDim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(15,23,42,0.28)",
      // @ts-expect-error web backdrop
      backdropFilter: "blur(4px)",
      // @ts-expect-error web webkit backdrop
      WebkitBackdropFilter: "blur(4px)",
    },
    modalContent: {
      backgroundColor: isDark ? "rgba(24,24,27,0.92)" : "rgba(255,255,255,0.94)",
      borderRadius: 20,
      padding: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
      zIndex: 2,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        },
        android: { elevation: 12 },
        default: {},
      }),
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: isDark ? "#F9FAFB" : "#111827",
    },
    modalCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
    },
    modalLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: isDark ? "#D1D5DB" : "#374151",
      marginBottom: 6,
    },
    modalInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      borderRadius: 8,
      padding: 12,
      color: isDark ? "#F9FAFB" : "#111827",
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.14)',
    },
    modalCancelBtn: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      alignItems: "center",
    },
    modalConfirmBtn: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: "#7C3AED",
      alignItems: "center",
    },
  });
};
