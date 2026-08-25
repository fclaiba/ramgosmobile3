/**
 * Modal de ingreso a una comunidad.
 *
 * Es lo que ve alguien que tocó un link de invitación: la ficha de la
 * comunidad y, si hace falta, el cuestionario paso a paso antes de mandar la
 * solicitud.
 *
 * Va sobre `ui/sheet.tsx` (RN `<Modal>` + drag-to-dismiss por PanResponder) y
 * no sobre `@gorhom/bottom-sheet`, que no está instalado y no hace falta:
 * `SheetContent` compone `[s.content, …, s.bottom, style]`, así que `style`
 * pisa el `height: '85%'` del preset y el alto puede seguir al contenido —
 * un paso de cuestionario no ocupa lo mismo que la ficha completa.
 *
 * Una pregunta por pantalla, no un formulario largo: el cuestionario es
 * fricción deliberada, pero fricción legible.
 */
import { Check, ChevronLeft, Globe, Lock, EyeOff } from 'lucide-react-native';
import React, { useEffect, useMemo, useReducer } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { atmosphere, colors, Motion, Radius, Space, Touch, Type } from '../../theme/tokens';
import { Sheet, SheetContent } from '../ui/sheet';

interface Question {
    id: string;
    prompt: string;
    kind: 'text' | 'single' | 'multi' | 'boolean';
    options?: Array<{ id: string; label: string }>;
    required?: boolean;
    maxLength?: number;
}

type Answers = Record<string, { value?: string; optionIds?: string[] }>;

type State = { step: number; answers: Answers; submitting: boolean };
type Action =
    | { type: 'next' }
    | { type: 'back' }
    | { type: 'answer'; questionId: string; value?: string; optionIds?: string[] }
    | { type: 'submitting'; value: boolean }
    | { type: 'reset' };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'next':
            return { ...state, step: state.step + 1 };
        case 'back':
            return { ...state, step: Math.max(0, state.step - 1) };
        case 'answer':
            return {
                ...state,
                answers: {
                    ...state.answers,
                    [action.questionId]: { value: action.value, optionIds: action.optionIds },
                },
            };
        case 'submitting':
            return { ...state, submitting: action.value };
        case 'reset':
            return { step: 0, answers: {}, submitting: false };
        default:
            return state;
    }
}

const haptic = {
    step: () => Platform.OS !== 'web' && Haptics.selectionAsync(),
    ok: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    fail: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export function CommunityJoinSheet({
    open,
    communityIdOrSlug,
    inviteToken,
    onClose,
    onJoined,
}: {
    open: boolean;
    /** Ausente con la forma corta `/i/{código}`: ahí sólo hay token y la
     *  comunidad la resuelve `previewInvite` del lado del servidor. */
    communityIdOrSlug?: string;
    inviteToken?: string;
    onClose: () => void;
    onJoined?: (communityId: string) => void;
}) {
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);
    const { show } = useToast();

    const [state, dispatch] = useReducer(reducer, { step: 0, answers: {}, submitting: false });
    useEffect(() => {
        if (!open) dispatch({ type: 'reset' });
    }, [open]);

    // Con token, `previewInvite` es la única puerta que revela una comunidad
    // secreta. Sin token se cae a `getCommunity`, que para una privada
    // devuelve la ficha reducida (`isPreview`).
    const preview = useQuery(
        api.social.communityAccess.previewInvite,
        open && inviteToken ? { sessionToken, token: inviteToken } : 'skip',
    );
    const direct = useQuery(
        api.social.communities.getCommunity,
        open && !inviteToken && sessionToken && communityIdOrSlug
            ? { sessionToken, communityId: communityIdOrSlug as any }
            : 'skip',
    );
    const questionnaire = useQuery(
        api.social.communityAccess.getJoinQuestionnaire,
        open && !inviteToken && sessionToken && communityIdOrSlug
            ? { sessionToken, communityId: communityIdOrSlug as any }
            : 'skip',
    );

    const acceptInvite = useMutation(api.social.communityAccess.acceptInvite);
    const submitJoinRequest = useMutation(api.social.communityAccess.submitJoinRequest);
    const joinCommunity = useMutation(api.social.communities.joinCommunity);

    const community: any = inviteToken ? preview?.community : direct;
    const inviteState = inviteToken ? preview?.state : 'valid';
    const questions: Question[] = useMemo(
        () => (inviteToken ? (preview?.questions ?? []) : (questionnaire?.questions ?? [])) as Question[],
        [inviteToken, preview, questionnaire],
    );
    const loading = inviteToken ? preview === undefined : direct === undefined;

    const alreadyMember = inviteToken
        ? Boolean(preview?.alreadyMember)
        : community?.myMembership?.status === 'active';
    const pending = inviteToken
        ? Boolean(preview?.pending)
        : community?.myMembership?.status === 'pending';

    const policy = community?.joinPolicy ?? 'approval';
    const bypass = Boolean(inviteToken && preview?.bypassApproval);
    const needsQuestions = !bypass && policy === 'questionnaire' && questions.length > 0;

    const PrivacyIcon =
        community?.visibility === 'secret' ? EyeOff : community?.visibility === 'private' ? Lock : Globe;
    const privacyLabel =
        community?.visibility === 'secret'
            ? 'Secreta'
            : community?.visibility === 'private'
              ? 'Privada'
              : 'Abierta';

    const currentQuestion = needsQuestions ? questions[state.step] : undefined;
    const currentAnswer = currentQuestion ? state.answers[currentQuestion.id] : undefined;
    const canAdvance =
        !currentQuestion ||
        !currentQuestion.required ||
        Boolean(currentAnswer?.value?.trim()) ||
        Boolean(currentAnswer?.optionIds?.length);

    const submit = async () => {
        if (!sessionToken) {
            show('Iniciá sesión para unirte', 'warning');
            return;
        }
        dispatch({ type: 'submitting', value: true });
        const answers = Object.entries(state.answers).map(([questionId, a]) => ({
            questionId,
            value: a.value,
            optionIds: a.optionIds,
        }));

        try {
            let status: string | undefined;
            if (inviteToken) {
                const res = await acceptInvite({ sessionToken, token: inviteToken, answers });
                status = res?.status;
            } else if (policy === 'open') {
                const res = await joinCommunity({
                    sessionToken,
                    communityId: communityIdOrSlug as any,
                });
                status = res?.status;
            } else {
                const res = await submitJoinRequest({
                    sessionToken,
                    communityId: communityIdOrSlug as any,
                    answers,
                });
                status = res?.status;
            }

            haptic.ok();
            show(
                status === 'active' ? '¡Ya sos parte de la comunidad!' : 'Solicitud enviada',
                'success',
            );
            if (status === 'active' && community?._id) onJoined?.(String(community._id));
            onClose();
        } catch (e: any) {
            haptic.fail();
            show(e?.data?.message || e?.message || 'No se pudo completar', 'error');
        } finally {
            dispatch({ type: 'submitting', value: false });
        }
    };

    const advance = () => {
        if (!canAdvance) return;
        haptic.step();
        if (state.step < questions.length - 1) dispatch({ type: 'next' });
        else submit();
    };

    const renderBody = () => {
        if (loading) {
            return (
                <View style={styles.centered}>
                    <ActivityIndicator color={c.primary} />
                </View>
            );
        }

        if (inviteToken && inviteState && inviteState !== 'valid') {
            const messages: Record<string, string> = {
                expired: 'Esta invitación venció.',
                revoked: 'Esta invitación fue dada de baja.',
                exhausted: 'Esta invitación ya alcanzó su límite de usos.',
                notfound: 'No encontramos esta invitación.',
            };
            return (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>{messages[inviteState] ?? 'Invitación inválida.'}</Text>
                    <Text style={styles.emptyBody}>Pedile al administrador un link nuevo.</Text>
                </View>
            );
        }

        if (!community) {
            return (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>No encontramos esta comunidad.</Text>
                    <Text style={styles.emptyBody}>Puede que sea privada o que ya no exista.</Text>
                </View>
            );
        }

        if (alreadyMember) {
            return (
                <View style={styles.centered}>
                    <View style={styles.successIcon}>
                        <Check size={22} color={c.success} />
                    </View>
                    <Text style={styles.emptyTitle}>Ya sos parte de {community.name}</Text>
                    {/* "Entrar" tiene que ENTRAR: antes sólo cerraba el modal y
                        dejaba al usuario donde estaba, así que un link de
                        invitación abierto por alguien que ya era miembro no
                        llevaba a ningún lado. */}
                    <Pressable
                        style={styles.cta}
                        onPress={() => {
                            if (community?._id) onJoined?.(String(community._id));
                            else onClose();
                        }}
                    >
                        <Text style={styles.ctaText}>Entrar</Text>
                    </Pressable>
                </View>
            );
        }

        if (pending) {
            return (
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>Tu solicitud está en revisión</Text>
                    <Text style={styles.emptyBody}>
                        Un administrador de {community.name} va a responderte.
                    </Text>
                </View>
            );
        }

        if (currentQuestion) return renderQuestion(currentQuestion);
        return renderPreview();
    };

    const renderPreview = () => (
        <Animated.View entering={FadeIn.duration(Motion.colorTransition)}>
            <LinearGradient colors={atmosphere(isDark)} style={styles.cover}>
                <Text style={styles.coverInitial}>{community.name.charAt(0).toUpperCase()}</Text>
            </LinearGradient>

            <Text style={styles.name}>{community.name}</Text>
            <View style={styles.metaRow}>
                <View style={styles.chip}>
                    <PrivacyIcon size={12} color={c.textSecondary} />
                    <Text style={styles.chipText}>{privacyLabel}</Text>
                </View>
                <View style={styles.chip}>
                    <Text style={styles.chipText}>{community.memberCount ?? 0} miembros</Text>
                </View>
                {community.topic ? (
                    <View style={styles.chip}>
                        <Text style={styles.chipText}>{community.topic}</Text>
                    </View>
                ) : null}
            </View>

            {community.description ? (
                <Text style={styles.description}>{community.description}</Text>
            ) : null}

            {(community.rules ?? []).length > 0 ? (
                <View style={styles.rules}>
                    <Text style={styles.rulesTitle}>Reglas</Text>
                    {(community.rules ?? []).slice(0, 4).map((rule: string, i: number) => (
                        <Text key={i} style={styles.rule} numberOfLines={2}>
                            {i + 1}. {rule}
                        </Text>
                    ))}
                </View>
            ) : null}

            {needsQuestions ? (
                <Text style={styles.hint}>
                    Esta comunidad pide responder {questions.length}{' '}
                    {questions.length === 1 ? 'pregunta' : 'preguntas'} antes de entrar.
                </Text>
            ) : policy !== 'open' && !bypass ? (
                <Text style={styles.hint}>Tu solicitud la revisa un administrador.</Text>
            ) : null}

            <Pressable
                style={[styles.cta, state.submitting && styles.ctaDisabled]}
                onPress={needsQuestions ? advance : submit}
                disabled={state.submitting}
                accessibilityRole="button"
            >
                {state.submitting ? (
                    <ActivityIndicator color="#FFF" />
                ) : (
                    <Text style={styles.ctaText}>
                        {needsQuestions ? 'Empezar' : policy === 'open' || bypass ? 'Unirme' : 'Solicitar unirme'}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    );

    const renderQuestion = (question: Question) => {
        const answer = state.answers[question.id];
        const setValue = (value?: string, optionIds?: string[]) =>
            dispatch({ type: 'answer', questionId: question.id, value, optionIds });

        return (
            <Animated.View
                key={question.id}
                entering={SlideInRight.duration(220)}
                exiting={SlideOutLeft.duration(180)}
            >
                <View style={styles.progressRow}>
                    <Pressable onPress={() => dispatch({ type: 'back' })} hitSlop={10}>
                        <ChevronLeft size={20} color={c.textMuted} />
                    </Pressable>
                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${((state.step + 1) / questions.length) * 100}%` },
                            ]}
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {state.step + 1}/{questions.length}
                    </Text>
                </View>

                <Text style={styles.question}>{question.prompt}</Text>
                {question.required ? <Text style={styles.requiredTag}>Obligatoria</Text> : null}

                {question.kind === 'text' ? (
                    <TextInput
                        style={styles.input}
                        value={answer?.value ?? ''}
                        onChangeText={(t) => setValue(t)}
                        placeholder="Escribí tu respuesta"
                        placeholderTextColor={c.textSubtle}
                        multiline
                        maxLength={question.maxLength ?? 280}
                    />
                ) : question.kind === 'boolean' ? (
                    <View style={styles.options}>
                        {['Sí', 'No'].map((label) => {
                            const selected = answer?.value === label;
                            return (
                                <Pressable
                                    key={label}
                                    style={[styles.option, selected && styles.optionSelected]}
                                    onPress={() => setValue(label)}
                                >
                                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                ) : (
                    <View style={styles.options}>
                        {(question.options ?? []).map((opt) => {
                            const chosen = answer?.optionIds ?? [];
                            const selected = chosen.includes(opt.id);
                            const toggle = () => {
                                if (question.kind === 'single') {
                                    setValue(opt.label, [opt.id]);
                                    return;
                                }
                                const next = selected
                                    ? chosen.filter((id) => id !== opt.id)
                                    : [...chosen, opt.id];
                                setValue(undefined, next);
                            };
                            return (
                                <Pressable
                                    key={opt.id}
                                    style={[styles.option, selected && styles.optionSelected]}
                                    onPress={toggle}
                                >
                                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                        {opt.label}
                                    </Text>
                                    {selected ? <Check size={16} color={c.primary} /> : null}
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                <Pressable
                    style={[styles.cta, (!canAdvance || state.submitting) && styles.ctaDisabled]}
                    onPress={advance}
                    disabled={!canAdvance || state.submitting}
                    accessibilityRole="button"
                >
                    {state.submitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.ctaText}>
                            {state.step < questions.length - 1 ? 'Siguiente' : 'Enviar solicitud'}
                        </Text>
                    )}
                </Pressable>
            </Animated.View>
        );
    };

    return (
        <Sheet open={open} onOpenChange={(v: boolean) => !v && onClose()}>
            {/* `height: auto` pisa el 85% del preset: la ficha y un paso del
                cuestionario no ocupan lo mismo. */}
            <SheetContent side="bottom" style={{ height: 'auto', maxHeight: '88%' }}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {renderBody()}
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
    centered: {
        alignItems: 'center',
        paddingVertical: Space[10],
        gap: Space[2],
    },
    successIcon: {
        width: 48,
        height: 48,
        borderRadius: Radius.full,
        backgroundColor: c.successMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Space[2],
    },
    emptyTitle: {
        ...Type.title,
        color: c.text,
        textAlign: 'center',
    },
    emptyBody: {
        ...Type.bodySm,
        color: c.textMuted,
        textAlign: 'center',
        marginBottom: Space[4],
    },
    cover: {
        height: 96,
        borderRadius: Radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Space[4],
    },
    coverInitial: {
        ...Type.hero,
        color: c.textMuted,
    },
    name: {
        ...Type.heading,
        color: c.text,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Space[2],
        marginTop: Space[2],
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: Space[3],
        paddingVertical: 5,
        borderRadius: Radius.full,
        backgroundColor: c.surface2,
        borderWidth: 1,
        borderColor: c.border,
    },
    chipText: {
        ...Type.caption,
        color: c.textSecondary,
    },
    description: {
        ...Type.body,
        color: c.textSecondary,
        marginTop: Space[4],
    },
    rules: {
        marginTop: Space[4],
        padding: Space[3],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        gap: 4,
    },
    rulesTitle: {
        ...Type.caption,
        color: c.textSubtle,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    rule: {
        ...Type.bodySm,
        color: c.textSecondary,
    },
    hint: {
        ...Type.bodySm,
        color: c.textMuted,
        marginTop: Space[4],
        textAlign: 'center',
    },
    cta: {
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
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[3],
        marginBottom: Space[5],
    },
    progressTrack: {
        flex: 1,
        height: 4,
        borderRadius: Radius.full,
        backgroundColor: c.surface2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: Radius.full,
        backgroundColor: c.primary,
    },
    progressText: {
        ...Type.caption,
        color: c.textMuted,
    },
    question: {
        ...Type.heading,
        color: c.text,
    },
    requiredTag: {
        ...Type.caption,
        color: c.textSubtle,
        marginTop: 4,
    },
    input: {
        ...Type.body,
        color: c.text,
        minHeight: 96,
        marginTop: Space[4],
        padding: Space[3],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
        textAlignVertical: 'top',
    },
    options: {
        marginTop: Space[4],
        gap: Space[2],
    },
    option: {
        minHeight: Touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Space[4],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
    },
    optionSelected: {
        backgroundColor: c.primaryMuted,
        borderColor: c.borderFocus,
    },
    optionText: {
        ...Type.bodySm,
        color: c.textSecondary,
    },
    optionTextSelected: {
        color: c.text,
        fontWeight: '700',
    },
}));
