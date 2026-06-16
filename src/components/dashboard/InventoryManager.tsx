import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { QrCode, Tag, Users, MoreHorizontal } from "lucide-react-native";
import { formatCurrency } from "../../utils/formatters";

export function InventoryManager({
    styles,
    convexListings,
    navigation,
    isDark
}: any) {
    return (
        <View style={styles.sectionGap}>
            <TouchableOpacity
                style={styles.bigCreateBtn}
                onPress={() => navigation.navigate("BusinessScanner")}
            >
                <LinearGradient
                    colors={["#3B82F6", "#2563EB"]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                />
                <QrCode size={24} color="#fff" />
                <Text style={styles.bigCreateText}>
                    Escanear y Validar Bono
                </Text>
            </TouchableOpacity>

            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Tus publicaciones de Bonos</Text>
            </View>

            {convexListings.length === 0 ? (
                <View style={styles.emptyState}>
                    <Tag size={48} color={isDark ? "#4B5563" : "#E5E7EB"} />
                    <Text style={styles.emptyTitle}>Aún no tienes bonos</Text>
                    <Text style={styles.emptyDesc}>
                        Crea tu primer bono para atraer clientes.
                    </Text>
                </View>
            ) : (
                convexListings.map((listing: any) => {
                    const isActive = listing.status === "active";
                    const percent =
                        listing.stock > 0
                            ? ((listing.orderCount || 0) /
                                (listing.stock + (listing.orderCount || 0))) *
                            100
                            : 0;
                    const bgStyle = isActive
                        ? isDark
                            ? "rgba(22, 101, 52, 0.2)"
                            : "#DCFCE7"
                        : isDark
                            ? "rgba(107, 114, 128, 0.2)"
                            : "#F3F4F6";
                    const colorStyle = isActive
                        ? isDark
                            ? "#4ADE80"
                            : "#166534"
                        : isDark
                            ? "#9CA3AF"
                            : "#6B7280";
                    const label = isActive ? "Activo" : "Inactivo";

                    return (
                        <View key={listing._id} style={styles.couponCard}>
                            <View style={styles.couponHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.couponTitle}>
                                        {listing.title}
                                    </Text>
                                    <Text style={styles.couponCode}>
                                        {listing.type === "bono"
                                            ? "BONO"
                                            : listing.type.toUpperCase()}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.statusTag,
                                        { backgroundColor: bgStyle },
                                    ]}
                                >
                                    <Text
                                        style={[styles.statusText, { color: colorStyle }]}
                                    >
                                        {label}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.progressSection}>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        justifyContent: "space-between",
                                        marginBottom: 6,
                                    }}
                                >
                                    <Text style={styles.progressLabel}>
                                        Stock vendido
                                    </Text>
                                    <Text style={styles.progressValue}>
                                        {listing.orderCount || 0} /{" "}
                                        {listing.stock + (listing.orderCount || 0)}
                                    </Text>
                                </View>
                                <View style={styles.progressBarBg}>
                                    <View
                                        style={[
                                            styles.progressBarFill,
                                            {
                                                width: `${percent}%`,
                                                backgroundColor: colorStyle,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>

                            <View style={styles.couponFooter}>
                                <View style={{ flexDirection: "row", gap: 12 }}>
                                    <View style={styles.metaItem}>
                                        <Tag
                                            size={14}
                                            color={isDark ? "#9CA3AF" : "#6B7280"}
                                        />
                                        <Text style={styles.metaText}>
                                            {formatCurrency(listing.price)}
                                        </Text>
                                    </View>
                                    {listing.openPromotion && (
                                        <View style={styles.metaItem}>
                                            <Users
                                                size={14}
                                                color={isDark ? "#9CA3AF" : "#6B7280"}
                                            />
                                            <Text style={styles.metaText}>
                                                Promo{" "}
                                                {(
                                                    (listing.openCommissionRate || 0) * 100
                                                ).toFixed(0)}
                                                %
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        /* Edit Action */
                                    }}
                                >
                                    <MoreHorizontal
                                        size={20}
                                        color={isDark ? "#9CA3AF" : "#9CA3AF"}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })
            )}
        </View>
    );
}
