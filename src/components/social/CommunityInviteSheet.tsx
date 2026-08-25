/**
 * Gestión de links de invitación de una comunidad.
 *
 * Un link es la única puerta a una comunidad secreta, así que las tres
 * palancas que importan están a la vista y no escondidas en un menú: cuántas
 * veces se puede usar, cuándo vence y si saltea la aprobación. Un link
 * eterno, ilimitado y con bypass repartido en un grupo de WhatsApp es
 * exactamente cómo se filtra una comunidad privada.
 *
 * Por eso el default es el conservador: usos ilimitados pero CON aprobación y
 * vencimiento a 7 días.
 */
import { Check, Copy, Link2, Share2, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Radius, Space, Touch, Type } from '../../theme/tokens';
import {
    INVITE_CODE_ERRORS,
    MAX_INVITE_CODE,
    normalizeInviteCode,
    validateInviteCode,
} from '../../../convex/social/_communityPolicy';
import { INVITE_STATE_LABELS, type InviteState } from '../../types/community';
import { buildShortInviteLink } from '../../utils/communityDeepLink';
import { Sheet, SheetContent } from '../ui/sheet';

const EXPIRY_OPTIONS = [
    { label: '24 h', hours: 24 },
    { label: '7 días', hours: 24 * 7 },
    { label: '30 días', hours: 24 * 30 },
    { label: 'Sin vencimiento', hours: null },
] as const;

const USES_OPTIONS = [
    { label: '1 uso', max: 1 },
    { label: '10 usos', max: 10 },
    { label: 'Ilimitado', max: null },
] as const;

export function CommunityInviteSheet({
    open,
    communityId,
    communityName,
    onClose,
}: {
    open: boolean;
    communityId: string;
    communityName: string;
    onClose: () => void;
}) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);
    const { show } = useToast();

    const [expiryIdx, setExpiryIdx] = useState(1); // 7 días
    const [usesIdx, setUsesIdx] = useState(2); // ilimitado
    const [bypass, setBypass] = useState(false);
    const [customCode, setCustomCode] = useState('');
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const invites = useQuery(
        api.social.communityAccess.listInvites,
        open && sessionToken ? { sessionToken, communityId: communityId as any } : 'skip',
    );
    const createInvite = useMutation(api.social.communityAccess.createInvite);
    const revokeInvite = useMutation(api.social.communityAccess.revokeInvite);

    // Forma CORTA: `ramgos.app/i/{código}`. La larga (`/c/{id}?invite=…`) sigue
    // funcionando para los links ya repartidos, pero ocupa el doble y no se
    // puede dictar por teléfono.
    const linkFor = (token: string) => buildShortInviteLink(token);

    const codeProblem = customCode.trim()
        ? validateInviteCode(normalizeInviteCode(customCode))
        : null;

    const handleCreate = async () => {
        if (!sessionToken || codeProblem) return;
        setCreating(true);
        try {
            const hours = EXPIRY_OPTIONS[expiryIdx].hours;
            const maxUses = USES_OPTIONS[usesIdx].max;
            await createInvite({
                sessionToken,
                communityId: communityId as any,
                kind: 'link',
                bypassApproval: bypass,
                ...(customCode.trim() ? { customCode: normalizeInviteCode(customCode) } : {}),
                ...(maxUses !== null ? { maxUses } : {}),
                ...(hours !== null
                    ? { expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString() }
                    : {}),
            });
            setCustomCode('');
            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            show('Link creado', 'success');
        } catch (e: any) {
            show(e?.data?.message || 'No se pudo crear el link', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async (invite: any) => {
        await Clipboard.setStringAsync(linkFor(invite.token));
        setCopiedId(String(invite._id));
        if (Platform.OS !== 'web') Haptics.selectionAsync();
        setTimeout(() => setCopiedId(null), 1600);
    };

    const handleShare = async (invite: any) => {
        try {
            await Share.share({
                message: `Te invito a ${communityName}: ${linkFor(invite.token)}`,
            });
        } catch {
            // El usuario canceló el diálogo del sistema.
        }
    };

    const handleRevoke = async (invite: any) => {
        if (!sessionToken) return;
        try {
            await revokeInvite({ sessionToken, inviteId: invite._id });
            show('Link dado de baja', 'success');
        } catch {
            show('No se pudo dar de baja', 'error');
        }
    };

    const renderChips = <T,>(
        options: readonly T[],
        selectedIdx: number,
        onSelect: (i: number) => void,
        labelOf: (o: T) => string,
    ) => (
        <View style={styles.chipRow}>
            {options.map((opt, i) => (
                <Pressable
                    key={labelOf(opt)}
                    onPress={() => onSelect(i)}
                    style={[styles.chip, i === selectedIdx && styles.chipActive]}
                >
                    <Text style={[styles.chipText, i === selectedIdx && styles.chipTextActive]}>
                        {labelOf(opt)}
                    </Text>
                </Pressable>
            ))}
        </View>
    );

    return (
        <Sheet open={open} onOpenChange={(v: boolean) => !v && onClose()}>
            <SheetContent side="bottom" style={{ height: 'auto', maxHeight: '88%' }}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.title}>Invitar a {communityName}</Text>

                    <Text style={styles.label}>Vencimiento</Text>
                    {renderChips(EXPIRY_OPTIONS, expiryIdx, setExpiryIdx, (o) => o.label)}

                    <Text style={styles.label}>Usos</Text>
                    {renderChips(USES_OPTIONS, usesIdx, setUsesIdx, (o) => o.label)}

                    <Text style={styles.label}>Código personalizado (opcional)</Text>
                    <View style={styles.codeRow}>
                        <Text style={styles.codePrefix}>ramgos.app/i/</Text>
                        <TextInput
                            style={styles.codeInput}
                            value={customCode}
                            onChangeText={setCustomCode}
                            placeholder="verano2026"
                            placeholderTextColor={c.textSubtle}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={MAX_INVITE_CODE}
                        />
                    </View>
                    <Text style={[styles.toggleHint, codeProblem ? styles.errorHint : null]}>
                        {codeProblem
                            ? INVITE_CODE_ERRORS[codeProblem]
                            : 'Vacío = se genera uno al azar. Un código a medida es más fácil de dictar, pero también más fácil de adivinar.'}
                    </Text>

                    <Pressable style={styles.toggleRow} onPress={() => setBypass((b) => !b)}>
                        <View style={[styles.checkbox, bypass && styles.checkboxOn]}>
                            {bypass ? <Check size={14} color="#FFF" /> : null}
                        </View>
                        <View style={styles.toggleText}>
                            <Text style={styles.toggleLabel}>Entrada directa</Text>
                            <Text style={styles.toggleHint}>
                                Saltea el cuestionario y la aprobación. Usalo sólo para links privados.
                            </Text>
                        </View>
                    </Pressable>

                    <Pressable
                        style={[styles.cta, creating && styles.ctaDisabled]}
                        onPress={handleCreate}
                        disabled={creating}
                        accessibilityRole="button"
                    >
                        {creating ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Link2 size={16} color="#FFF" />
                                <Text style={styles.ctaText}>Crear link</Text>
                            </>
                        )}
                    </Pressable>

                    <Text style={[styles.label, { marginTop: Space[6] }]}>Links activos</Text>
                    {invites === undefined ? (
                        <ActivityIndicator color={c.primary} style={{ marginTop: Space[4] }} />
                    ) : invites.length === 0 ? (
                        <Text style={styles.empty}>Todavía no creaste ningún link.</Text>
                    ) : (
                        invites.map((invite: any) => {
                            const state = invite.state as InviteState;
                            const dead = state !== 'valid';
                            return (
                                <View key={String(invite._id)} style={[styles.invite, dead && styles.inviteDead]}>
                                    <View style={styles.inviteInfo}>
                                        <Text style={styles.inviteToken} numberOfLines={1}>
                                            {linkFor(invite.token)}
                                        </Text>
                                        <Text style={styles.inviteMeta}>
                                            {INVITE_STATE_LABELS[state]} ·{' '}
                                            {invite.maxUses
                                                ? `${invite.useCount}/${invite.maxUses} usos`
                                                : `${invite.useCount} usos`}
                                            {invite.bypassApproval ? ' · entrada directa' : ''}
                                        </Text>
                                    </View>

                                    {!dead ? (
                                        <>
                                            <Pressable onPress={() => handleCopy(invite)} hitSlop={8} style={styles.iconBtn}>
                                                {copiedId === String(invite._id) ? (
                                                    <Check size={16} color={c.success} />
                                                ) : (
                                                    <Copy size={16} color={c.textMuted} />
                                                )}
                                            </Pressable>
                                            <Pressable onPress={() => handleShare(invite)} hitSlop={8} style={styles.iconBtn}>
                                                <Share2 size={16} color={c.textMuted} />
                                            </Pressable>
                                        </>
                                    ) : null}

                                    {!invite.revokedAt ? (
                                        <Pressable onPress={() => handleRevoke(invite)} hitSlop={8} style={styles.iconBtn}>
                                            <Trash2 size={16} color={c.danger} />
                                        </Pressable>
                                    ) : null}
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </SheetContent>
        </Sheet>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    scroll: {
        paddingHorizontal: Space[5],
        paddingBottom: Space[8],
    },
    title: {
        ...Type.heading,
        color: c.text,
        marginBottom: Space[5],
    },
    label: {
        ...Type.caption,
        color: c.textSubtle,
        textTransform: 'uppercase',
        marginBottom: Space[2],
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Space[2],
        marginBottom: Space[4],
    },
    chip: {
        paddingHorizontal: Space[3],
        paddingVertical: 8,
        borderRadius: Radius.full,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
    },
    chipActive: {
        backgroundColor: c.primaryMuted,
        borderColor: c.borderFocus,
    },
    chipText: {
        ...Type.caption,
        color: c.textMuted,
    },
    chipTextActive: {
        color: c.primary,
        fontWeight: '800',
    },
    toggleRow: {
        flexDirection: 'row',
        gap: Space[3],
        alignItems: 'flex-start',
        marginTop: Space[2],
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: Radius.xs,
        borderWidth: 1.5,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    checkboxOn: {
        backgroundColor: c.primary,
        borderColor: c.primary,
    },
    toggleText: {
        flex: 1,
    },
    toggleLabel: {
        ...Type.bodySm,
        fontWeight: '700',
        color: c.text,
    },
    toggleHint: {
        ...Type.caption,
        fontWeight: '500',
        color: c.textMuted,
        marginTop: 2,
    },
    errorHint: {
        color: c.danger,
    },
    codeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Touch.min,
        paddingHorizontal: Space[3],
        borderRadius: Radius.md,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
    },
    codePrefix: {
        ...Type.caption,
        fontWeight: '600',
        color: c.textSubtle,
    },
    codeInput: {
        ...Type.bodySm,
        flex: 1,
        color: c.text,
        padding: 0,
    },
    cta: {
        flexDirection: 'row',
        gap: 8,
        height: 48,
        borderRadius: Radius.full,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Space[5],
    },
    ctaDisabled: {
        opacity: 0.5,
    },
    ctaText: {
        ...Type.body,
        fontWeight: '800',
        color: '#FFF',
    },
    empty: {
        ...Type.bodySm,
        color: c.textMuted,
        marginTop: Space[2],
    },
    invite: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[2],
        padding: Space[3],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
        marginBottom: Space[2],
    },
    inviteDead: {
        opacity: 0.55,
    },
    inviteInfo: {
        flex: 1,
        minWidth: 0,
    },
    inviteToken: {
        ...Type.caption,
        fontWeight: '600',
        color: c.textSecondary,
    },
    inviteMeta: {
        ...Type.caption,
        fontWeight: '500',
        color: c.textSubtle,
        marginTop: 2,
    },
    iconBtn: {
        width: Touch.min - 12,
        height: Touch.min - 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));
