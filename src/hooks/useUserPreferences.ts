import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../contexts/AuthContext';

export const useUserPreferences = () => {
    const { user, sessionToken } = useAuth();

    const preferences = useQuery(
        api.userProfile.getPreferences,
        user ? { sessionToken, userId: user.id } : "skip"
    );

    const updatePrefsMutation = useMutation(api.userProfile.updatePreferences);

    const setLanguage = async (language: string) => {
        if (!user) return;
        await updatePrefsMutation({
            sessionToken, userId: user.id,
            preferences: { language }
        });
    };

    const setCurrency = async (currency: string) => {
        if (!user) return;
        await updatePrefsMutation({
            sessionToken, userId: user.id,
            preferences: { currency }
        });
    };

    const setNotifications = async (notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
        marketingEmails: boolean;
    }) => {
        if (!user) return;
        await updatePrefsMutation({
            sessionToken, userId: user.id,
            preferences: { notifications }
        });
    };

    const setSearchRadius = async (searchRadius: number) => {
        if (!user) return;
        await updatePrefsMutation({
            sessionToken, userId: user.id,
            preferences: { searchRadius }
        });
    };

    const setPreferredCategories = async (preferredCategories: string[]) => {
        if (!user) return;
        await updatePrefsMutation({
            sessionToken, userId: user.id,
            preferences: { preferredCategories }
        });
    };

    return {
        language: preferences?.language || 'es',
        currency: preferences?.currency || 'USD',
        notifications: preferences?.notifications || {
            email: true,
            push: true,
            sms: false,
            marketingEmails: false,
        },
        searchRadius: preferences?.searchRadius || 50,
        preferredCategories: preferences?.preferredCategories || [],
        setLanguage,
        setCurrency,
        setNotifications,
        setSearchRadius,
        setPreferredCategories,
    };
};
