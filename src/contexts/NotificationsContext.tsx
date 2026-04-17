import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';

// Mock types locally to avoid import
type PermissionStatus = 'granted' | 'denied' | 'undetermined';



// ... (previous imports and setup)

// Configure notification handler behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    } as Notifications.NotificationBehavior),
});

export type NotificationType = 'system' | 'order' | 'money' | 'promo' | 'referral';

export interface AppNotification {
    id: string;
    title: string;
    body: string;
    date: string; // ISO string
    read: boolean;
    type: NotificationType;
    data?: Record<string, unknown>;
}

interface NotificationsContextType {
    notifications: AppNotification[];
    unreadCount: number;
    expoPushToken?: string;
    permissionStatus: PermissionStatus | 'undetermined';
    requestPermissions: () => Promise<void>;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    deleteNotification: (id: string) => void;
    clearAll: () => void;
    simulateNotification: (title: string, body: string, type?: NotificationType) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const NOTIFICATIONS_STORAGE_KEY = '@ramgos/notifications/history';

export const useNotifications = () => {
    const context = useContext(NotificationsContext);
    if (!context) throw new Error('useNotifications must be used within NotificationsProvider');
    return context;
};

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
    const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | 'undetermined'>('undetermined');
    const notificationListener = useRef<any | undefined>(undefined);
    const responseListener = useRef<any | undefined>(undefined);
    const { user } = useAuth(); // Tie storage to user potentially, or just global for now
    const { show } = useToast();
    const registerPushToken = useMutation((api as any).notifications?.registerPushToken || api.users.syncUser);

    // Load history on mount
    useEffect(() => {
        loadNotifications();
    }, []);

    // Save history on change
    useEffect(() => {
        AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications))
            .catch(err => console.error('Failed to save notifications', err));
    }, [notifications]);

    // Register for push notifications
    useEffect(() => {
        if (user && user.id) {
            registerForPushNotificationsAsync()
                .then((token) => {
                    if (token) {
                        setExpoPushToken(token);
                        setPermissionStatus('granted');
                        // Persist token in Convex
                        registerPushToken({ actorId: user.id as any, token }).catch(err => {
                            console.warn("Could not register token on server", err);
                        });
                    }
                })
                .catch(error => {
                    console.warn('Failed to register for push notifications:', error);
                });
        }

        // This listener is fired whenever a notification is received while the app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            const content = notification.request.content;
            const newNotif: AppNotification = {
                id: notification.request.identifier,
                title: content.title || 'Nueva notificación',
                body: content.body || '',
                date: new Date().toISOString(),
                read: false,
                type: (content.data?.type as NotificationType) || 'system',
                data: content.data,
            };
            addNotification(newNotif);
        });

        // This listener is fired whenever a user taps on or interacts with a notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const notif = response.notification.request.content;
            // Here we could handle navigation based on data
            console.log('Notification tapped:', notif.data);
        });

        return () => {
            if (notificationListener.current) notificationListener.current.remove();
            if (responseListener.current) responseListener.current.remove();
        };
    }, [user]);

    const loadNotifications = async () => {
        try {
            const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
            if (stored) {
                setNotifications(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load notifications', error);
        }
    };

    const addNotification = (notif: AppNotification) => {
        setNotifications(prev => [notif, ...prev]);
    };

    const markAsRead = (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const deleteNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const clearAll = () => {
        setNotifications([]);
    };

    const simulateNotification = async (title: string, body: string, type: NotificationType = 'system') => {
        // Schedule a local notification
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: { type },
            },
            trigger: null, // Send immediately
        });

        // Mocking behavior for now since notifications are disabled
        const newNotif: AppNotification = {
            id: Date.now().toString(),
            title,
            body,
            date: new Date().toISOString(),
            read: false,
            type: type || 'system',
            data: { type },
        };
        addNotification(newNotif);
        show(`${title}: ${body}`, 'info');
    };

    const requestPermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        setPermissionStatus(status);
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        expoPushToken,
        permissionStatus,
        requestPermissions,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        simulateNotification
    }), [notifications, unreadCount, expoPushToken, permissionStatus]); // Dependencies

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
};

