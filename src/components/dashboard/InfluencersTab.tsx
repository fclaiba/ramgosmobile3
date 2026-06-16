import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UserPlus, Users } from "lucide-react-native";

export function InfluencersTab({
    styles,
    setInviteModalVisible,
    pendingProposalsFromInfluencers,
    pendingMyInvitations,
    whitelist,
    handleRespondToInfluencerProposal,
    handleEndBusinessCampaign,
    handleRemoveFromWhitelist,
    isDark
}: any) {
    return (
        <View style={styles.sectionGap}>
            <TouchableOpacity
                style={styles.bigCreateBtn}
                onPress={() => setInviteModalVisible(true)}
            >
                <LinearGradient
                    colors={["#7C3AED", "#5B21B6"]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                />
                <UserPlus size={24} color="#fff" />
                <Text style={styles.bigCreateText}>Invitar influencer</Text>
            </TouchableOpacity>

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
                                    <Text style={styles.couponTitle}>
                                        {c.influencerName}
                                    </Text>
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
                                        borderRadius: 8,
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
                                        borderRadius: 8,
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
                                    <Text style={styles.couponTitle}>
                                        {c.influencerName}
                                    </Text>
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

            {/* Whitelist campaigns */}
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
                        <Text style={styles.emptyTitle}>
                            Sin influencers en Whitelist
                        </Text>
                        <Text style={styles.emptyDesc}>
                            Añade influencers a tu Whitelist para que puedan promover
                            tus bonos cuando la opción de promoción abierta esté
                            desactivada.
                        </Text>
                    </View>
                ) : (
                    whitelist.map((w: any) => {
                        return (
                            <View key={w.whitelistId} style={styles.couponCard}>
                                <View style={styles.couponHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.couponTitle}>{w.name}</Text>
                                        <Text style={styles.couponCode}>{w.email}</Text>
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
                                            borderRadius: 8,
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
