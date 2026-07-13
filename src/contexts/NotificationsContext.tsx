import React, { createContext, useContext } from 'react';

export type AppNotification = {
    id: string;
    title: string;
    body: string;
    type: string;
    date: string;
    read: boolean;
};

export interface NotificationsContextValue {
    notifications: AppNotification[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    deleteNotification: (id: string) => void;
    clearAll: () => void;
    preferences: Record<string, unknown>;
    updatePreferences: (prefs: Record<string, unknown>) => void;
}

const defaultValue: NotificationsContextValue = {
    notifications: [],
    unreadCount: 0,
    markAsRead: () => {},
    markAllAsRead: () => {},
    deleteNotification: () => {},
    clearAll: () => {},
    preferences: {},
    updatePreferences: () => {},
};

const NotificationsContext = createContext<NotificationsContextValue>(defaultValue);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    return (
        <NotificationsContext.Provider value={defaultValue}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications(): NotificationsContextValue {
    return useContext(NotificationsContext) ?? defaultValue;
}
