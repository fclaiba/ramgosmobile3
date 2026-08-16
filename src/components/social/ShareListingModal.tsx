import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { toUserMessage } from '../../utils/errors';
import { colors, Radius } from '../../theme/tokens';

interface ShareListingModalProps {
    listingId: string;
    visible: boolean;
    onClose: () => void;
}

/**
 * "Recomendar por mensaje". El card se arma en el servidor
 * (`social.dm.shareListingInChat`) con el precio real y el id de quien
 * recomienda, así la atribución de la venta no depende del cliente.
 */
export const ShareListingModal = ({ listingId, visible, onClose }: ShareListingModalProps) => {
    const { user, sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const { show } = useToast();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [sentTo, setSentTo] = useState<string[]>([]);
    const [sending, setSending] = useState<string | null>(null);

    const shareListing = useMutation(api.social.dm.shareListingInChat);
    const chats = useQuery(
        api.social.dm.listChats,
        user && sessionToken && visible
            ? { sessionToken, folder: 'inbox' as const, limit: 40 }
            : 'skip',
    );

    const handleSend = async (chatId: string) => {
        if (!sessionToken || sending) return;
        setSending(chatId);
        try {
            await shareListing({
                sessionToken,
                chatId: chatId as any,
                listingId,
                clientId: `share-listing-${listingId}-${chatId}`,
            });
            setSentTo((prev) => [...prev, chatId]);
        } catch (e) {
            show(toUserMessage(e), 'error');
        } finally {
            setSending(null);
        }
    };

    return (
        <Sheet open={visible} onOpenChange={(open: boolean) => !open && onClose()}>
            <SheetContent side="bottom" style={styles.sheet}>
                <SheetHeader>
                    <SheetTitle>Recomendar por mensaje</SheetTitle>
                </SheetHeader>

                <FlatList
                    data={chats?.items ?? []}
                    keyExtractor={(item: any) => item.chatId}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    ListEmptyComponent={
                        chats === undefined ? (
                            <ActivityIndicator style={{ marginTop: 24 }} />
                        ) : (
                            <Text style={styles.empty}>
                                Todavía no tenés conversaciones para compartir.
                            </Text>
                        )
                    }
                    renderItem={({ item }: any) => {
                        const isSent = sentTo.includes(item.chatId);
                        return (
                            <View style={styles.row}>
                                <Avatar size="md">
                                    <AvatarImage src={item.avatar ?? undefined} />
                                    <AvatarFallback>{(item.title ?? '?').charAt(0)}</AvatarFallback>
                                </Avatar>
                                <Text style={styles.name} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.btn, isSent && styles.btnSent]}
                                    disabled={isSent || sending === item.chatId}
                                    onPress={() => handleSend(item.chatId)}
                                >
                                    {sending === item.chatId ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.btnText}>
                                            {isSent ? 'Enviado' : 'Enviar'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                />
            </SheetContent>
        </Sheet>
    );
};

const getStyles = (isDark: boolean) => {
    const c = colors(isDark);
    return StyleSheet.create({
        sheet: { height: '70%' },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
        },
        name: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
        btn: {
            minWidth: 84,
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: Radius.md,
            backgroundColor: c.primary,
        },
        btnSent: { backgroundColor: c.surface3 },
        btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
        empty: { textAlign: 'center', marginTop: 32, color: c.textMuted, paddingHorizontal: 32 },
    });
};
