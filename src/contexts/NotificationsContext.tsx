import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// Configure notification handler behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
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
    permissionStatus: Notifications.PermissionStatus | 'undetermined';
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
    const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | 'undetermined'>('undetermined');
    const notificationListener = useRef<Notifications.Subscription>();
    const responseListener = useRef<Notifications.Subscription>();
    const { user } = useAuth(); // Tie storage to user potentially, or just global for now

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
        registerForPushNotificationsAsync().then(({ token, status }) => {
            setExpoPushToken(token);
            setPermissionStatus(status);
        });

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
    }, []);

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
    };

    const requestPermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        setPermissionStatus(status);
        if (status === 'granted') {
            const token = (await Notifications.getExpoPushTokenAsync({
                projectId: 'your-project-id', // Optional, will infer from app.json
            })).data;
            setExpoPushToken(token);
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationsContext.Provider value={{
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
        }}>
            {children}
        </NotificationsContext.Provider>
    );
};

async function registerForPushNotificationsAsync() {
    let token;
    let status: Notifications.PermissionStatus = Notifications.PermissionStatus.UNDETERMINED;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    status = existingStatus;

    // Only ask if permissions have not already been determined, because
    // iOS won't necessarily prompt the user a second time.
    if (existingStatus !== 'granted') {
        // Can't ask immediately on mount without user action in some guidelines, 
        // but for now we check or let the user call requestPermissions
    }

    // Attempt to get token if granted
    if (existingStatus === 'granted') {
        try {
            token = (await Notifications.getExpoPushTokenAsync()).data;
        } catch (e) {
            console.log('Error getting push token', e);
        }
    }

    return { token, status };
}
