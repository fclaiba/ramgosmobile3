import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    Modal,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    Platform,
    ScrollView,
} from "react-native";
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Radius, colors, Space } from "../../theme/tokens";
import type { InviteModalMode } from "./InfluencersTab";

type Hit = {
    _id: string;
    name: string;
    username: string;
    referralAlias?: string | null;
};

type Props = {
    visible: boolean;
    mode: InviteModalMode;
    isDark: boolean;
    sessionToken?: string;
    topInset?: number;
    bottomInset?: number;
    submitting?: boolean;
    onClose: () => void;
    onConfirm: (args: {
        influencerId: string;
        commissionPct?: string;
    }) => void;
};

const MAX_HITS = 5;

export function InfluencerInviteModal({
    visible,
    mode,
    isDark,
    sessionToken,
    topInset = 16,
    bottomInset = 16,
    submitting = false,
    onClose,
    onConfirm,
}: Props) {
    const c = colors(isDark);
    const [term, setTerm] = useState("");
    const [debounced, setDebounced] = useState("");
    const [selected, setSelected] = useState<Hit | null>(null);
    const [ratePct, setRatePct] = useState("5");

    useEffect(() => {
        if (!visible) {
            setTerm("");
            setDebounced("");
            setSelected(null);
            setRatePct("5");
        }
    }, [visible]);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(term.trim()), 280);
        return () => clearTimeout(t);
    }, [term]);

    // Clear selection when the query changes (explicit re-select required).
    useEffect(() => {
        setSelected(null);
    }, [debounced]);

    const searchHits =
        useQuery(
            api.influencers.searchInfluencers,
            visible && sessionToken && debounced.length >= 2
                ? { sessionToken, searchTerm: debounced }
                : "skip",
        ) ?? [];

    const exactHit = useQuery(
        api.campaigns.lookupInfluencer,
        visible && sessionToken && debounced.length >= 2
            ? { sessionToken, handleOrCode: debounced }
            : "skip",
    );

    const results: Hit[] = useMemo(() => {
        const map = new Map<string, Hit>();
        if (exactHit?._id) {
            map.set(String(exactHit._id), {
                _id: String(exactHit._id),
                name: exactHit.name,
                username: exactHit.username,
                referralAlias: exactHit.referralAlias,
            });
        }
        for (const h of searchHits) {
            const id = String(h._id);
            if (!map.has(id)) {
                map.set(id, {
                    _id: id,
                    name: h.name,
                    username: h.username,
                    referralAlias: h.referralAlias,
                });
            }
            if (map.size >= MAX_HITS) break;
        }
        return Array.from(map.values()).slice(0, MAX_HITS);
    }, [exactHit, searchHits]);

    const searching =
        !!sessionToken &&
        debounced.length >= 2 &&
        exactHit === undefined;

    const empty =
        !!sessionToken &&
        debounced.length >= 2 &&
        exactHit === null &&
        Array.isArray(searchHits) &&
        searchHits.length === 0;

    const canConfirm = !!selected && !submitting;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View
                style={[
                    styles.overlay,
                    { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 },
                ]}
            >
                {Platform.OS !== "web" ? (
                    <BlurView
                        intensity={isDark ? 48 : 64}
                        tint={isDark ? "dark" : "light"}
                        style={StyleSheet.absoluteFill}
                    />
                ) : (
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)" },
                        ]}
                    />
                )}
                <View style={styles.dim} />
                <View
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: c.bgElevated,
                            borderColor: c.glassBorder,
                        },
                    ]}
                >
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: c.text }]}>
                            {mode === "whitelist"
                                ? "Añadir a whitelist"
                                : "Invitar a campaña"}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={18} color={c.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.label, { color: c.textMuted }]}>
                        Buscar por @
                    </Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                color: c.text,
                                borderColor: c.glassBorder,
                                backgroundColor: isDark ? "#18181B" : "#FAFAFA",
                            },
                        ]}
                        placeholder="@usuario"
                        placeholderTextColor={c.textSubtle}
                        value={term}
                        onChangeText={setTerm}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                    />

                    {!sessionToken && term.trim().length > 0 && (
                        <Text style={styles.error}>
                            Sesión no válida. Cerrá sesión y volvé a entrar.
                        </Text>
                    )}

                    {searching && (
                        <Text style={[styles.hint, { color: c.textMuted }]}>
                            Buscando…
                        </Text>
                    )}

                    {debounced.length >= 2 && results.length > 0 && (
                        <ScrollView
                            style={styles.results}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                        >
                            {results.map((hit) => {
                                const active = selected?._id === hit._id;
                                return (
                                    <TouchableOpacity
                                        key={hit._id}
                                        onPress={() => setSelected(hit)}
                                        style={[
                                            styles.resultRow,
                                            {
                                                borderColor: active
                                                    ? "#2196F3"
                                                    : c.glassBorder,
                                                backgroundColor: active
                                                    ? isDark
                                                        ? "rgba(33,150,243,0.15)"
                                                        : "rgba(33,150,243,0.08)"
                                                    : isDark
                                                      ? "#18181B"
                                                      : "#FAFAFA",
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.resultHandle,
                                                { color: c.text },
                                            ]}
                                        >
                                            @{hit.username}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.resultName,
                                                { color: c.textMuted },
                                            ]}
                                        >
                                            {hit.name}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    {empty && !selected && (
                        <Text style={styles.error}>
                            No se encontró un influencer con ese @.
                        </Text>
                    )}

                    {selected && (
                        <View
                            style={[
                                styles.selectedChip,
                                {
                                    borderColor: "#16a34a",
                                    backgroundColor: isDark
                                        ? "rgba(22,163,74,0.12)"
                                        : "#F0FDF4",
                                },
                            ]}
                        >
                            <Text style={{ color: isDark ? "#86efac" : "#166534", fontWeight: "700" }}>
                                @{selected.username}
                            </Text>
                            <Text style={{ color: isDark ? "#BBF7D0" : "#166534", fontSize: 12 }}>
                                {selected.name}
                            </Text>
                        </View>
                    )}

                    {mode === "invite" && (
                        <>
                            <Text style={[styles.label, { color: c.textMuted, marginTop: Space[3] }]}>
                                Comisión por venta (%)
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        color: c.text,
                                        borderColor: c.glassBorder,
                                        backgroundColor: isDark ? "#18181B" : "#FAFAFA",
                                    },
                                ]}
                                placeholder="5"
                                placeholderTextColor={c.textSubtle}
                                keyboardType="numeric"
                                value={ratePct}
                                onChangeText={setRatePct}
                            />
                        </>
                    )}

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.footerBtn, { borderColor: c.glassBorder }]}
                            onPress={onClose}
                        >
                            <Text style={{ color: c.textMuted, fontWeight: "600" }}>
                                Cancelar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.footerBtnPrimary,
                                { opacity: canConfirm ? 1 : 0.5 },
                            ]}
                            disabled={!canConfirm}
                            onPress={() => {
                                if (!selected) return;
                                onConfirm({
                                    influencerId: selected._id,
                                    commissionPct:
                                        mode === "invite" ? ratePct : undefined,
                                });
                            }}
                        >
                            {submitting ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={{ color: "#fff", fontWeight: "700" }}>
                                    {mode === "whitelist"
                                        ? "Añadir"
                                        : "Enviar invitación"}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 20,
    },
    dim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
    sheet: {
        borderRadius: Radius.lg,
        borderWidth: 1,
        padding: 16,
        maxHeight: "85%",
        maxWidth: 440,
        width: "100%",
        alignSelf: "center",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "800" },
    closeBtn: { padding: 4 },
    label: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    input: {
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        marginBottom: 10,
    },
    hint: { fontSize: 12, marginBottom: 8 },
    error: { color: "#EF4444", fontSize: 12, marginBottom: 8 },
    results: { maxHeight: 220, marginBottom: 8 },
    resultRow: {
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 6,
    },
    resultHandle: { fontSize: 14, fontWeight: "700" },
    resultName: { fontSize: 12, marginTop: 2 },
    selectedChip: {
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: 10,
        marginBottom: 8,
        gap: 2,
    },
    footer: { flexDirection: "row", gap: 10, marginTop: 8 },
    footerBtn: {
        flex: 1,
        height: 44,
        borderRadius: Radius.md,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    footerBtnPrimary: {
        flex: 1,
        height: 44,
        borderRadius: Radius.md,
        backgroundColor: "#2196F3",
        alignItems: "center",
        justifyContent: "center",
    },
});
