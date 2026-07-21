import { Coupon } from "../contexts/BusinessContext";

export const formatCurrency = (value: number) =>
    `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDateShort = (value: string | number | Date) => {
    const date = new Date(value);
    return date.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
    });
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
