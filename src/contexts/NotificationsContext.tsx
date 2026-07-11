import React, { createContext, useContext } from 'react';
const NotificationsContext = createContext<any>(null);
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    return <NotificationsContext.Provider value={{}}>{children}</NotificationsContext.Provider>;
}
export function useNotifications() {
    return {
        notifications: [],
        unreadCount: 0,
        markAsRead: () => {},
        markAllAsRead: () => {},
        deleteNotification: () => {},
        preferences: {},
        updatePreferences: () => {},
    };
}
export type AppNotification = any;
