import { Coupon } from "../contexts/BusinessContext";
import i18n from "../i18n";

const getLocale = () => (i18n.language.startsWith("en") ? "en-US" : "es-419");

export const formatCurrency = (value: number) =>
    new Intl.NumberFormat(getLocale(), {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);

export const formatDateShort = (value: string | number | Date) => {
    const date = new Date(value);
    return date.toLocaleDateString(getLocale(), {
        day: "numeric",
        month: "short",
    });
};

/**
 * Hora relativa compacta para listas de chat ("ahora", "5 min", "3 h",
 * "2 d", "12 mar"). La bandeja mostraba sólo HH:MM, así que un mensaje de
 * la semana pasada se veía igual que uno de hoy.
 */
export const formatRelativeTime = (value: string | number | Date): string => {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    if (Number.isNaN(diffMs)) return "";

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "ahora";
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} d`;

    return formatDateShort(date);
};

/** "Activo ahora" / "Activo hace 5 min", a partir de un heartbeat epoch ms. */
export const formatLastSeen = (
    lastSeenAt: number | null | undefined,
    onlineWindowMs = 60_000,
): string | null => {
    if (!lastSeenAt) return null;
    const diff = Date.now() - lastSeenAt;
    if (diff < onlineWindowMs) return "Activo ahora";

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `Activo hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Activo hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Activo hace ${days} d`;
    return null;
};

export const getCouponStatusStyles = (status: Coupon["status"], isDark: boolean) => {
    const styles: Record<
        Coupon["status"],
        { background: string; color: string; label: string }
    > = {
        active: {
            background: isDark ? "rgba(22, 101, 52, 0.2)" : "#DCFCE7",
            color: isDark ? "#4ADE80" : "#166534",
            label: "Activo",
        },
        scheduled: {
            background: isDark ? "rgba(29, 78, 216, 0.2)" : "#E0F2FE",
            color: isDark ? "#60A5FA" : "#1D4ED8",
            label: "Programado",
        },
        expired: {
            background: isDark ? "rgba(185, 28, 28, 0.2)" : "#FEE2E2",
            color: isDark ? "#F87171" : "#B91C1C",
            label: "Vencido",
        },
        paused: {
            background: isDark ? "rgba(107, 114, 128, 0.2)" : "#F3F4F6",
            color: isDark ? "#9CA3AF" : "#6B7280",
            label: "Pausado",
        },
        draft: {
            background: isDark ? "rgba(33, 150, 243, 0.2)" : "#F5F3FF",
            color: isDark ? "#5DD3F3" : "#2196F3",
            label: "Borrador",
        },
    };
    return styles[status];
};
