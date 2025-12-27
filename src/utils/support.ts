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
const ZENDESK_SUBDOMAIN = process.env.EXPO_PUBLIC_ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.EXPO_PUBLIC_ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.EXPO_PUBLIC_ZENDESK_API_TOKEN;

const toBase64 = (input: string): string => {
    if (typeof globalThis.btoa === 'function') {
        return globalThis.btoa(input);
    }

    const BufferRef = (globalThis as any).Buffer;
    if (BufferRef?.from) {
        return BufferRef.from(input, 'utf8').toString('base64');
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xff) {
            throw new Error('toBase64 solo admite caracteres ASCII.');
        }
        block = (block << 8) | charCode;
    }

    return output;
};

const formatBody = (payload: SupportTicketPayload) => (
    `Nombre: ${payload.name || 'N/D'}\n` +
    `Correo: ${payload.email || 'N/D'}\n` +
    `Categoría: ${payload.category}\n\n` +
    `${payload.message?.trim() || 'Sin descripción adicional.'}`
);

const tryZendesk = async (payload: SupportTicketPayload): Promise<boolean> => {
    if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
        return false;
    }

    const endpoint = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/requests.json`;
    const credentials = `${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`;

    try {
        const subjectLine = payload.subject?.trim() || 'Solicitud de soporte';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${toBase64(credentials)}`,
            },
            body: JSON.stringify({
                request: {
                    requester: {
                        name: payload.name,
                        email: payload.email,
                    },
                    subject: `[${payload.category}] ${subjectLine}`,
                    comment: {
                        body: formatBody(payload),
                    },
                },
            }),
        });

        return response.ok;
    } catch (error) {
        console.warn('Zendesk request error', error);
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

