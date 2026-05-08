import { Linking } from 'react-native';

export type SupportTicketPayload = {
    name: string;
    email: string;
    subject: string;
    message: string;
    category: string;
};

export type SupportTicketResult = {
    channel: 'zendesk' | 'email';
    delivered: boolean;
};

const SUPPORT_EMAIL = 'support@ramgos.com';
const ZENDESK_ENABLED = process.env.EXPO_PUBLIC_ZENDESK_ENABLED === 'true';

const getConvexSiteUrl = (): string | null => {
    const convexCloudUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
    if (!convexCloudUrl) return null;
    return convexCloudUrl.replace('.convex.cloud', '.convex.site');
};

const formatBody = (payload: SupportTicketPayload) => (
    `Nombre: ${payload.name || 'N/D'}\n` +
    `Correo: ${payload.email || 'N/D'}\n` +
    `Categoría: ${payload.category}\n\n` +
    `${payload.message?.trim() || 'Sin descripción adicional.'}`
);

const tryZendesk = async (payload: SupportTicketPayload): Promise<boolean> => {
    if (!ZENDESK_ENABLED) {
        return false;
    }

    const convexSiteUrl = getConvexSiteUrl();
    if (!convexSiteUrl) {
        return false;
    }

    const endpoint = `${convexSiteUrl}/support-ticket`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.warn('Zendesk endpoint error', response.status);
            return false;
        }

        const data = await response.json();
        return Boolean(data?.success);
    } catch (error) {
        console.warn('Zendesk endpoint request error', error);
        return false;
    }
};

const fallbackToEmail = async (payload: SupportTicketPayload) => {
    const subjectLine = payload.subject?.trim() || 'Solicitud de soporte';
    const subject = `[${payload.category}] ${subjectLine}`.trim();
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(formatBody(payload))}`;

    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (!canOpen) {
        throw new Error('No se pudo abrir el cliente de correo en este dispositivo.');
    }

    await Linking.openURL(mailtoUrl);
};

export const submitSupportTicket = async (payload: SupportTicketPayload): Promise<SupportTicketResult> => {
    const zendeskDelivered = await tryZendesk(payload);
    if (zendeskDelivered) {
        return { channel: 'zendesk', delivered: true };
    }

    await fallbackToEmail(payload);
    return { channel: 'email', delivered: true };
};

export const getSupportEmail = () => SUPPORT_EMAIL;
export const isZendeskEnabled = () => ZENDESK_ENABLED;

