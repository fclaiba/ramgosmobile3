import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Image,
} from "react-native";
import {
    UserPlus,
    Users,
    Megaphone,
    ListChecks,
    ChevronDown,
    ChevronUp,
    X,
    Pause,
} from "lucide-react-native";
import { Radius, colors, Space } from "../../theme/tokens";

export type InviteModalMode = "whitelist" | "invite";

const PRODUCT_PAGE = 6;

function PersonRow({
    title,
    subtitle,
    avatar,
    trailing,
    isDark,
    accentBorder,
}: {
    title: string;
    subtitle: string;
    avatar?: string;
    trailing?: React.ReactNode;
    isDark: boolean;
    accentBorder?: string;
}) {
    const c = colors(isDark);
    return (
        <View
            style={[
                styles.personRow,
                {
                    backgroundColor: c.glass,
                    borderColor: c.glassBorder,
                    borderLeftColor: accentBorder || c.glassBorder,
                    borderLeftWidth: accentBorder ? 3 : 1,
                },
            ]}
        >
            {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: isDark ? "#27272A" : "#E4E4E7" }]}>
                    <Users size={16} color={c.textMuted} />
                </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.personTitle, { color: c.text }]} numberOfLines={1}>
                    {title}
                </Text>
                <Text style={[styles.personSub, { color: c.textMuted }]} numberOfLines={1}>
                    {subtitle}
                </Text>
            </View>
            {trailing}
        </View>
    );
}

export function InfluencersTab({
    openInviteModal,
    pendingProposalsFromInfluencers,
    pendingMyInvitations,
    activeBusinessCampaigns = [],
    whitelist,
    listings,
    handleRespondToInfluencerProposal,
    handleEndBusinessCampaign,
    handleRemoveFromWhitelist,
    handleToggleOpenPromotion,
    isDark,
}: any) {
    const c = colors(isDark);
    const [savingListingId, setSavingListingId] = useState<string | null>(null);
    const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
    const [productsOpen, setProductsOpen] = useState(false);
    const [showAllProducts, setShowAllProducts] = useState(false);
    const [productFilter, setProductFilter] = useState("");

    const filteredListings = useMemo(() => {
        const list = Array.isArray(listings) ? listings : [];
        const q = productFilter.trim().toLowerCase();
        if (!q) return list;
        return list.filter((l: any) =>
            String(l.title || "").toLowerCase().includes(q),
        );
    }, [listings, productFilter]);

    const visibleListings = showAllProducts
        ? filteredListings
        : filteredListings.slice(0, PRODUCT_PAGE);

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
        <View style={styles.root}>
            {/* Header */}
            <View style={styles.headerBlock}>
                <Text style={[styles.pageTitle, { color: c.text }]}>Influencers</Text>
                <Text style={[styles.pageSub, { color: c.textMuted }]}>
                    Gestioná quién puede promover tus productos y con qué comisión.
                </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#15803d" }]}
                    onPress={() => openInviteModal("whitelist")}
                    activeOpacity={0.85}
                >
                    <ListChecks size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Añadir a whitelist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#2196F3" }]}
                    onPress={() => openInviteModal("invite")}
                    activeOpacity={0.85}
                >
                    <UserPlus size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Invitar a campaña</Text>
                </TouchableOpacity>
            </View>

            {/* Whitelist — first */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>
                    Whitelist · {whitelist?.length ?? 0}
                </Text>
                {!whitelist || whitelist.length === 0 ? (
                    <View style={[styles.emptyBox, { borderColor: c.glassBorder }]}>
                        <Text style={[styles.emptyTitle, { color: c.text }]}>
                            Sin influencers
                        </Text>
                        <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
                            Añadí por @ para autorizarlos cuando la promoción abierta esté off.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.stack}>
                        {whitelist.map((w: any) => (
                            <PersonRow
                                key={w.whitelistId}
                                isDark={isDark}
                                avatar={w.avatar}
                                title={w.username ? `@${w.username}` : w.name}
                                subtitle={w.username ? w.name : "Autorizado"}
                                trailing={
                                    <TouchableOpacity
                                        onPress={() =>
                                            handleRemoveFromWhitelist(w.influencerId)
                                        }
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={styles.iconBtn}
                                    >
                                        <X size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                }
                            />
                        ))}
                    </View>
                )}
            </View>

            {/* Campaigns */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Campañas</Text>

                {pendingProposalsFromInfluencers.length > 0 && (
                    <View style={styles.stack}>
                        <Text style={[styles.subLabel, { color: c.textMuted }]}>
                            Propuestas recibidas
                        </Text>
                        {pendingProposalsFromInfluencers.map((camp: any) => (
                            <View key={camp._id} style={styles.stack}>
                                <PersonRow
                                    isDark={isDark}
                                    accentBorder="#F59E0B"
                                    avatar={camp.influencerAvatar}
                                    title={camp.influencerName || "Influencer"}
                                    subtitle={`${(camp.commissionRate * 100).toFixed(0)}% por venta`}
                                />
                                <View style={styles.inlineActions}>
                                    <TouchableOpacity
                                        style={[styles.smallBtn, { backgroundColor: "#16a34a" }]}
                                        onPress={() =>
                                            handleRespondToInfluencerProposal(camp._id, "accept")
                                        }
                                    >
                                        <Text style={styles.smallBtnText}>Aceptar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.smallBtnOutline, { borderColor: "#ef4444" }]}
                                        onPress={() =>
                                            handleRespondToInfluencerProposal(camp._id, "reject")
                                        }
                                    >
                                        <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 13 }}>
                                            Rechazar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {pendingMyInvitations.length > 0 && (
                    <View style={[styles.stack, { marginTop: Space[3] }]}>
                        <Text style={[styles.subLabel, { color: c.textMuted }]}>
                            Invitaciones enviadas
                        </Text>
                        {pendingMyInvitations.map((camp: any) => (
                            <PersonRow
                                key={camp._id}
                                isDark={isDark}
                                avatar={camp.influencerAvatar}
                                title={camp.influencerName || "Influencer"}
                                subtitle={`${(camp.commissionRate * 100).toFixed(0)}% · pendiente`}
                                trailing={
                                    <TouchableOpacity
                                        onPress={() => handleEndBusinessCampaign(camp._id)}
                                    >
                                        <Text style={styles.linkDanger}>Cancelar</Text>
                                    </TouchableOpacity>
                                }
                            />
                        ))}
                    </View>
                )}

                {activeBusinessCampaigns.length > 0 && (
                    <View style={[styles.stack, { marginTop: Space[3] }]}>
                        <Text style={[styles.subLabel, { color: c.textMuted }]}>
                            Activas
                        </Text>
                        {activeBusinessCampaigns.map((camp: any) => (
                            <PersonRow
                                key={camp._id}
                                isDark={isDark}
                                accentBorder="#2196F3"
                                avatar={camp.influencerAvatar}
                                title={camp.influencerName || "Influencer"}
                                subtitle={`${(camp.commissionRate * 100).toFixed(0)}% · ${camp.status === "paused" ? "pausada" : "activa"}`}
                                trailing={
                                    <TouchableOpacity
                                        onPress={() => handleEndBusinessCampaign(camp._id)}
                                        style={styles.iconBtn}
                                    >
                                        <Pause size={16} color={c.textMuted} />
                                    </TouchableOpacity>
                                }
                            />
                        ))}
                    </View>
                )}

                {pendingProposalsFromInfluencers.length === 0 &&
                    pendingMyInvitations.length === 0 &&
                    activeBusinessCampaigns.length === 0 && (
                        <View style={[styles.emptyBox, { borderColor: c.glassBorder }]}>
                            <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
                                Todavía no hay campañas. Invitá a un influencer para empezar.
                            </Text>
                        </View>
                    )}
            </View>

            {/* Products — collapsed by default */}
            <View style={styles.section}>
                <TouchableOpacity
                    style={[
                        styles.collapseHeader,
                        { backgroundColor: c.glass, borderColor: c.glassBorder },
                    ]}
                    onPress={() => setProductsOpen((v) => !v)}
                    activeOpacity={0.8}
                >
                    <Megaphone size={18} color="#2196F3" />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: c.text, marginBottom: 0 }]}>
                            Promoción abierta
                        </Text>
                        <Text style={[styles.personSub, { color: c.textMuted }]}>
                            {(listings?.length ?? 0)} productos · tocá para configurar
                        </Text>
                    </View>
                    {productsOpen ? (
                        <ChevronUp size={18} color={c.textMuted} />
                    ) : (
                        <ChevronDown size={18} color={c.textMuted} />
                    )}
                </TouchableOpacity>

                {productsOpen && (
                    <View style={[styles.stack, { marginTop: Space[3] }]}>
                        <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
                            On = cualquier influencer. Off = solo whitelist o campaña.
                        </Text>
                        {(listings?.length ?? 0) > PRODUCT_PAGE && (
                            <TextInput
                                value={productFilter}
                                onChangeText={setProductFilter}
                                placeholder="Filtrar por título…"
                                placeholderTextColor={c.textSubtle}
                                style={[
                                    styles.filterInput,
                                    {
                                        color: c.text,
                                        borderColor: c.glassBorder,
                                        backgroundColor: c.bgElevated,
                                    },
                                ]}
                            />
                        )}
                        {!listings || listings.length === 0 ? (
                            <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
                                Creá un bono o listing primero.
                            </Text>
                        ) : (
                            visibleListings.map((listing: any) => {
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
                                    <View
                                        key={id}
                                        style={[
                                            styles.productRow,
                                            {
                                                backgroundColor: c.glass,
                                                borderColor: c.glassBorder,
                                            },
                                        ]}
                                    >
                                        <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                                            <Text
                                                style={[styles.personTitle, { color: c.text }]}
                                                numberOfLines={1}
                                            >
                                                {listing.title || "Sin título"}
                                            </Text>
                                            <Text
                                                style={[styles.personSub, { color: c.textMuted }]}
                                            >
                                                {isOpen ? "Público" : "Restringido"}
                                            </Text>
                                        </View>
                                        {isOpen && (
                                            <TextInput
                                                value={ratePct}
                                                onChangeText={(v) =>
                                                    setRateDrafts((prev) => ({
                                                        ...prev,
                                                        [id]: v,
                                                    }))
                                                }
                                                onBlur={() => {
                                                    if (isOpen) onToggle(listing, true);
                                                }}
                                                keyboardType="numeric"
                                                style={[
                                                    styles.rateInput,
                                                    {
                                                        color: c.text,
                                                        borderColor: c.glassBorder,
                                                        backgroundColor: c.bgElevated,
                                                    },
                                                ]}
                                            />
                                        )}
                                        <TouchableOpacity
                                            disabled={saving}
                                            onPress={() => onToggle(listing, !isOpen)}
                                            style={[
                                                styles.switchTrack,
                                                {
                                                    backgroundColor: isOpen
                                                        ? "#2196F3"
                                                        : isDark
                                                          ? "#374151"
                                                          : "#E5E7EB",
                                                    opacity: saving ? 0.6 : 1,
                                                },
                                            ]}
                                        >
                                            {saving ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <View
                                                    style={[
                                                        styles.switchThumb,
                                                        {
                                                            alignSelf: isOpen
                                                                ? "flex-end"
                                                                : "flex-start",
                                                        },
                                                    ]}
                                                />
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                );
                            })
                        )}
                        {filteredListings.length > PRODUCT_PAGE && (
                            <TouchableOpacity
                                onPress={() => setShowAllProducts((v) => !v)}
                                style={{ alignSelf: "flex-start", paddingVertical: 4 }}
                            >
                                <Text style={{ color: "#2196F3", fontWeight: "700", fontSize: 13 }}>
                                    {showAllProducts
                                        ? "Ver menos"
                                        : `Ver más (${filteredListings.length - PRODUCT_PAGE})`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: Space[5] },
    headerBlock: { gap: 4 },
    pageTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
    pageSub: { fontSize: 13, lineHeight: 18 },
    actionsRow: { flexDirection: "row", gap: 8 },
    actionBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 40,
        borderRadius: Radius.md,
        paddingHorizontal: 10,
    },
    actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    section: { gap: Space[3] },
    sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    subLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
    stack: { gap: 8 },
    personRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    avatar: { width: 36, height: 36, borderRadius: Radius.full },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    personTitle: { fontSize: 14, fontWeight: "700" },
    personSub: { fontSize: 12, marginTop: 1 },
    iconBtn: { padding: 4 },
    linkDanger: { color: "#EF4444", fontWeight: "700", fontSize: 12 },
    inlineActions: { flexDirection: "row", gap: 8 },
    smallBtn: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: Radius.sm,
        alignItems: "center",
    },
    smallBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    smallBtnOutline: {
        flex: 1,
        paddingVertical: 9,
        borderRadius: Radius.sm,
        alignItems: "center",
        borderWidth: 1,
    },
    emptyBox: {
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: 14,
        gap: 4,
    },
    emptyTitle: { fontSize: 14, fontWeight: "700" },
    emptyDesc: { fontSize: 12, lineHeight: 17 },
    collapseHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    filterInput: {
        borderWidth: 1,
        borderRadius: Radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
    },
    productRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    rateInput: {
        borderWidth: 1,
        borderRadius: Radius.sm,
        paddingHorizontal: 8,
        paddingVertical: 6,
        minWidth: 44,
        textAlign: "center",
        fontSize: 13,
        fontWeight: "600",
    },
    switchTrack: {
        width: 46,
        height: 26,
        borderRadius: Radius.md,
        justifyContent: "center",
        paddingHorizontal: 3,
    },
    switchThumb: {
        width: 20,
        height: 20,
        borderRadius: Radius.md,
        backgroundColor: "rgba(255,255,255,0.9)",
    },
});
