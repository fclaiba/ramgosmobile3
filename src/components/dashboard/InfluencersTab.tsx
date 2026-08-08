import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UserPlus, Users, Megaphone, ListChecks } from "lucide-react-native";
import { Radius } from "../../theme/tokens";

export type InviteModalMode = "whitelist" | "invite";

export function InfluencersTab({
    styles,
    openInviteModal,
    pendingProposalsFromInfluencers,
    pendingMyInvitations,
    whitelist,
    listings,
    handleRespondToInfluencerProposal,
    handleEndBusinessCampaign,
    handleRemoveFromWhitelist,
    handleToggleOpenPromotion,
    isDark,
}: any) {
    const [savingListingId, setSavingListingId] = useState<string | null>(null);
    const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

    const onToggle = async (listing: any, nextOpen: boolean) => {
        const id = String(listing._id);
        const draft = rateDrafts[id];
        const pct =
            draft !== undefined
                ? parseFloat(draft)
                : (Number(listing.openCommissionRate) || 0) * 100;
        setSavingListingId(id);
        try {
            await handleToggleOpenPromotion(listing, nextOpen, pct);
        } finally {
            setSavingListingId(null);
        }
    };

    return (
        <View style={styles.sectionGap}>
            <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                    style={[styles.bigCreateBtn, { flex: 1 }]}
                    onPress={() => openInviteModal("whitelist")}
                >
                    <LinearGradient
                        colors={["#16a34a", "#15803d"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    />
                    <ListChecks size={22} color="#fff" />
                    <Text style={styles.bigCreateText}>Añadir a Whitelist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.bigCreateBtn, { flex: 1 }]}
                    onPress={() => openInviteModal("invite")}
                >
                    <LinearGradient
                        colors={["#2196F3", "#5B21B6"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    />
                    <UserPlus size={22} color="#fff" />
                    <Text style={styles.bigCreateText}>Invitar campaña</Text>
                </TouchableOpacity>
            </View>

            {/* Productos abiertos a influencers */}
            <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Megaphone size={18} color={isDark ? "#5DD3F3" : "#2196F3"} />
                    <Text
                        style={{
                            fontWeight: "700",
                            color: isDark ? "#F9FAFB" : "#111827",
                        }}
                    >
                        Productos abiertos a influencers
                    </Text>
                </View>
                <Text
                    style={{
                        fontSize: 12,
                        color: isDark ? "#9CA3AF" : "#6B7280",
                        marginTop: -4,
                    }}
                >
                    Activá un producto para que cualquier influencer pueda promocionarlo.
                    Si está apagado, solo whitelist o campaña pueden promoverlo.
                </Text>
                {!listings || listings.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>Sin productos</Text>
                        <Text style={styles.emptyDesc}>
                            Creá un bono o listing primero para configurar promoción abierta.
                        </Text>
                    </View>
                ) : (
                    listings.map((listing: any) => {
                        const id = String(listing._id);
                        const isOpen = listing.openPromotion === true;
                        const ratePct =
                            rateDrafts[id] ??
                            String(
                                Math.round(
                                    (Number(listing.openCommissionRate) || 0.05) * 100,
                                ),
                            );
                        const saving = savingListingId === id;
                        return (
                            <View key={id} style={styles.couponCard}>
                                <View style={styles.couponHeader}>
                                    <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={styles.couponTitle} numberOfLines={2}>
                                            {listing.title || "Sin título"}
                                        </Text>
                                        <Text style={styles.couponCode}>
                                            {isOpen
                                                ? "Público: cualquier influencer"
                                                : "Solo whitelist / campaña"}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        disabled={saving}
                                        onPress={() => onToggle(listing, !isOpen)}
                                        style={{
                                            width: 50,
                                            height: 28,
                                            borderRadius: Radius.md,
                                            backgroundColor: isOpen
                                                ? "#2196F3"
                                                : isDark
                                                  ? "#374151"
                                                  : "#E5E7EB",
                                            justifyContent: "center",
                                            paddingHorizontal: 3,
                                            opacity: saving ? 0.6 : 1,
                                        }}
                                    >
                                        {saving ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <View
                                                style={{
                                                    width: 22,
                                                    height: 22,
                                                    borderRadius: Radius.md,
                                                    backgroundColor: "rgba(255,255,255,0.62)",
                                                    alignSelf: isOpen ? "flex-end" : "flex-start",
                                                }}
                                            />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                {isOpen && (
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 8,
                                            marginTop: 10,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontSize: 12,
                                                color: isDark ? "#CBD5E1" : "#64748b",
                                                fontWeight: "600",
                                            }}
                                        >
                                            Comisión %
                                        </Text>
                                        <TextInput
                                            value={ratePct}
                                            onChangeText={(v) =>
                                                setRateDrafts((prev) => ({ ...prev, [id]: v }))
                                            }
                                            onBlur={() => {
                                                if (isOpen) onToggle(listing, true);
                                            }}
                                            keyboardType="numeric"
                                            style={{
                                                borderWidth: 1,
                                                borderColor: isDark ? "#374151" : "#E5E7EB",
                                                borderRadius: Radius.sm,
                                                paddingHorizontal: 10,
                                                paddingVertical: 6,
                                                minWidth: 56,
                                                color: isDark ? "#F9FAFB" : "#111827",
                                                backgroundColor: isDark
                                                    ? "rgba(255,255,255,0.05)"
                                                    : "#fff",
                                            }}
                                        />
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </View>

            {/* Pending proposals from influencers */}
            {pendingProposalsFromInfluencers.length > 0 && (
                <View style={{ gap: 12 }}>
                    <Text
                        style={{
                            fontWeight: "700",
                            color: isDark ? "#F9FAFB" : "#111827",
                        }}
                    >
                        Propuestas recibidas
                    </Text>
                    {pendingProposalsFromInfluencers.map((c: any) => (
                        <View
                            key={c._id}
                            style={[
                                styles.couponCard,
                                { borderLeftWidth: 3, borderLeftColor: "#F59E0B" },
                            ]}
                        >
                            <View style={styles.couponHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.couponTitle}>{c.influencerName}</Text>
                                    <Text style={styles.couponCode}>
                                        {(c.commissionRate * 100).toFixed(1)}% por venta
                                        {c.influencerReferralCode
                                            ? ` • código ${c.influencerReferralCode}`
                                            : ""}
                                    </Text>
                                </View>
                            </View>
                            <View
                                style={{ flexDirection: "row", gap: 8, marginTop: 12 }}
                            >
                                <TouchableOpacity
                                    style={{
                                        flex: 1,
                                        backgroundColor: "#16a34a",
                                        paddingVertical: 10,
                                        borderRadius: Radius.sm,
                                        alignItems: "center",
                                    }}
                                    onPress={() =>
                                        handleRespondToInfluencerProposal(c._id, "accept")
                                    }
                                >
                                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                                        Aceptar
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{
                                        flex: 1,
                                        borderWidth: 1,
                                        borderColor: "#ef4444",
                                        paddingVertical: 10,
                                        borderRadius: Radius.sm,
                                        alignItems: "center",
                                    }}
                                    onPress={() =>
                                        handleRespondToInfluencerProposal(c._id, "reject")
                                    }
                                >
                                    <Text style={{ color: "#ef4444", fontWeight: "700" }}>
                                        Rechazar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* My pending invitations */}
            {pendingMyInvitations.length > 0 && (
                <View style={{ gap: 12 }}>
                    <Text
                        style={{
                            fontWeight: "700",
                            color: isDark ? "#F9FAFB" : "#111827",
                        }}
                    >
                        Invitaciones enviadas
                    </Text>
                    {pendingMyInvitations.map((c: any) => (
                        <View key={c._id} style={styles.couponCard}>
                            <View style={styles.couponHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.couponTitle}>{c.influencerName}</Text>
                                    <Text style={styles.couponCode}>
                                        {(c.commissionRate * 100).toFixed(1)}% propuesto
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.statusTag,
                                        {
                                            backgroundColor: isDark
                                                ? "rgba(245, 158, 11, 0.2)"
                                                : "#FEF3C7",
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.statusText,
                                            { color: isDark ? "#FBBF24" : "#B45309" },
                                        ]}
                                    >
                                        Pendiente
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => handleEndBusinessCampaign(c._id)}
                                style={{ marginTop: 8, alignSelf: "flex-start" }}
                            >
                                <Text
                                    style={{
                                        fontSize: 12,
                                        fontWeight: "700",
                                        color: "#ef4444",
                                    }}
                                >
                                    Cancelar invitación
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            {/* Whitelist */}
            <View style={{ gap: 12 }}>
                <Text
                    style={{
                        fontWeight: "700",
                        color: isDark ? "#F9FAFB" : "#111827",
                    }}
                >
                    Tu Whitelist
                </Text>
                {whitelist.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Users size={48} color={isDark ? "#4B5563" : "#E5E7EB"} />
                        <Text style={styles.emptyTitle}>Sin influencers en Whitelist</Text>
                        <Text style={styles.emptyDesc}>
                            Añadí influencers por @ para que puedan crear y promover tus bonos
                            cuando la promoción abierta esté desactivada.
                        </Text>
                    </View>
                ) : (
                    whitelist.map((w: any) => {
                        return (
                            <View key={w.whitelistId} style={styles.couponCard}>
                                <View style={styles.couponHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.couponTitle}>{w.name}</Text>
                                        <Text style={styles.couponCode}>
                                            {w.username ? `@${w.username}` : "Sin @"}
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.statusTag,
                                            {
                                                backgroundColor: isDark
                                                    ? "rgba(22, 101, 52, 0.2)"
                                                    : "#DCFCE7",
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.statusText,
                                                { color: isDark ? "#4ADE80" : "#166534" },
                                            ]}
                                        >
                                            Autorizado
                                        </Text>
                                    </View>
                                </View>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        gap: 8,
                                        marginTop: 12,
                                    }}
                                >
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            borderWidth: 1,
                                            borderColor: "#ef4444",
                                            paddingVertical: 10,
                                            borderRadius: Radius.sm,
                                            alignItems: "center",
                                        }}
                                        onPress={() =>
                                            handleRemoveFromWhitelist(w.influencerId)
                                        }
                                    >
                                        <Text
                                            style={{ color: "#ef4444", fontWeight: "700" }}
                                        >
                                            Remover de Whitelist
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })
                )}
            </View>
        </View>
    );
}
