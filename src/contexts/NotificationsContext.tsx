import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { useUserPreferences } from '../hooks/useUserPreferences';

const READ_KEY = '@ramgos_notif_read';
const DELETED_KEY = '@ramgos_notif_deleted';

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
    preferences: {
        email: boolean;
        push: boolean;
        sms: boolean;
        marketingEmails: boolean;
    };
    updatePreferences: (prefs: Partial<{
        email: boolean;
        push: boolean;
        sms: boolean;
        marketingEmails: boolean;
    }>) => Promise<void>;
    loading: boolean;
}

const defaultValue: NotificationsContextValue = {
    notifications: [],
    unreadCount: 0,
    markAsRead: () => {},
    markAllAsRead: () => {},
    deleteNotification: () => {},
    clearAll: () => {},
    preferences: { email: true, push: true, sms: false, marketingEmails: false },
    updatePreferences: async () => {},
    loading: false,
};

const NotificationsContext = createContext<NotificationsContextValue>(defaultValue);

const WELCOME: AppNotification = {
    id: 'local_welcome',
    title: 'Bienvenido a Ramgos',
    body: 'Acá vas a ver avisos de pedidos, pagos, disputas y promociones.',
    type: 'system',
    date: new Date().toISOString(),
    read: false,
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user, sessionToken } = useAuth();
    const {
        notifications: notifPrefs,
        setNotifications: persistNotifPrefs,
    } = useUserPreferences();

    const remote = useQuery(
        api.notifications.listMyNotifications,
        user && sessionToken ? { sessionToken, limit: 60 } : 'skip',
    );

    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [r, d] = await Promise.all([
                    AsyncStorage.getItem(READ_KEY),
                    AsyncStorage.getItem(DELETED_KEY),
                ]);
                if (r) setReadIds(new Set(JSON.parse(r)));
                if (d) setDeletedIds(new Set(JSON.parse(d)));
            } catch {}
            setHydrated(true);
        })();
    }, []);

    const persistRead = useCallback(async (next: Set<string>) => {
        setReadIds(next);
        await AsyncStorage.setItem(READ_KEY, JSON.stringify([...next]));
    }, []);

    const persistDeleted = useCallback(async (next: Set<string>) => {
        setDeletedIds(next);
        await AsyncStorage.setItem(DELETED_KEY, JSON.stringify([...next]));
    }, []);

    const notifications = useMemo(() => {
        if (!hydrated) return [];
        const mapped: AppNotification[] = (remote || []).map((n) => ({
            id: String(n.id),
            title: n.title,
            body: n.body,
            type: n.type || 'system',
            date: n.date,
            read: readIds.has(String(n.id)),
        }));

        const visible = mapped.filter((n) => !deletedIds.has(n.id));
        if (visible.length === 0 && !deletedIds.has(WELCOME.id)) {
            return [{ ...WELCOME, read: readIds.has(WELCOME.id) }];
        }
        return visible;
    }, [remote, readIds, deletedIds, hydrated]);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.read).length,
        [notifications],
    );

    const markAsRead = useCallback(
        (id: string) => {
            if (readIds.has(id)) return;
            const next = new Set(readIds);
            next.add(id);
            persistRead(next);
        },
        [readIds, persistRead],
    );

    const markAllAsRead = useCallback(() => {
        const next = new Set(readIds);
        notifications.forEach((n) => next.add(n.id));
        persistRead(next);
    }, [notifications, readIds, persistRead]);

    const deleteNotification = useCallback(
        (id: string) => {
            const next = new Set(deletedIds);
            next.add(id);
            persistDeleted(next);
        },
        [deletedIds, persistDeleted],
    );

    const clearAll = useCallback(() => {
        const next = new Set(deletedIds);
        notifications.forEach((n) => next.add(n.id));
        persistDeleted(next);
    }, [deletedIds, notifications, persistDeleted]);

    const updatePreferences = useCallback(
        async (prefs: Partial<typeof notifPrefs>) => {
            await persistNotifPrefs({ ...notifPrefs, ...prefs });
        },
        [notifPrefs, persistNotifPrefs],
    );

    const value: NotificationsContextValue = {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        preferences: notifPrefs,
        updatePreferences,
        loading: !!user && sessionToken && remote === undefined,
    };

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications(): NotificationsContextValue {
    return useContext(NotificationsContext) ?? defaultValue;
}
