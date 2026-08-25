/**
 * Panel de administración de una comunidad.
 *
 * Concentra las tres palancas que definen quién entra — visibilidad, política
 * de ingreso y cuestionario — más las reglas y los links de invitación. Antes
 * no existía ninguna: la visibilidad sólo se elegía al crear la comunidad y no
 * se podía cambiar nunca más.
 *
 * Visibilidad y política están juntas a propósito y se ajustan entre sí:
 * elegir "Secreta" fuerza `invite`, porque una comunidad que no aparece en
 * ninguna búsqueda pero acepta solicitudes por id no es realmente secreta.
 */
import { ArrowLeft, Check, GripVertical, Link2, Plus, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { CommunityInviteSheet } from '../../components/social/CommunityInviteSheet';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { createThemedStyles } from '../../theme/makeThemedStyles';
import { colors, Radius, Space, Touch, Type } from '../../theme/tokens';
import {
    JOIN_POLICY_LABELS,
    QUESTION_KIND_LABELS,
    VISIBILITY_LABELS,
    resolveJoinPolicy,
    type CommunityJoinPolicy,
    type CommunityQuestion,
    type CommunityQuestionKind,
    type CommunityVisibility,
} from '../../types/community';

const MAX_QUESTIONS = 5;
const VISIBILITIES: CommunityVisibility[] = ['public', 'private', 'secret'];

/** Políticas ofrecidas para cada visibilidad. Ver el comentario de cabecera. */
const POLICIES_FOR: Record<CommunityVisibility, CommunityJoinPolicy[]> = {
    public: ['open', 'approval', 'questionnaire'],
    private: ['approval', 'questionnaire'],
    secret: ['invite'],
};

export default function CommunitySettingsScreen({ route, navigation }: any) {
    const communityId = route?.params?.communityId as string;
    const { sessionToken } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const c = colors(isDark);
    const insets = useSafeAreaInsets();
    const { show } = useToast();

    const community = useQuery(
        api.social.communities.getCommunity,
        sessionToken && communityId ? { sessionToken, communityId: communityId as any } : 'skip',
    );
    const questionnaire = useQuery(
        api.social.communityAccess.getJoinQuestionnaire,
        sessionToken && communityId ? { sessionToken, communityId: communityId as any } : 'skip',
    );

    const updateCommunity = useMutation(api.social.communities.updateCommunity);
    const setCommunityRules = useMutation(api.social.communities.setCommunityRules);
    const setJoinQuestionnaire = useMutation(api.social.communityAccess.setJoinQuestionnaire);

    const [visibility, setVisibility] = useState<CommunityVisibility>('public');
    const [policy, setPolicy] = useState<CommunityJoinPolicy>('open');
    const [topic, setTopic] = useState('');
    const [rules, setRules] = useState<string[]>([]);
    const [questions, setQuestions] = useState<CommunityQuestion[]>([]);
    const [saving, setSaving] = useState(false);
    const [invitesOpen, setInvitesOpen] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    // Una sola hidratación: si se re-sincronizara en cada emisión reactiva de
    // `useQuery`, cualquier edición a medio hacer se pisaría sola.
    useEffect(() => {
        if (hydrated || !community || (community as any).isPreview) return;
        const cm = community as any;
        setVisibility((cm.visibility ?? 'public') as CommunityVisibility);
        setPolicy(resolveJoinPolicy(cm));
        setTopic(cm.topic ?? '');
        setRules(cm.rules ?? []);
        setHydrated(true);
    }, [community, hydrated]);

    useEffect(() => {
        if (!questionnaire) return;
        setQuestions(
            (questionnaire.questions ?? []).map((q: any) => ({
                id: q.id,
                prompt: q.prompt,
                kind: q.kind,
                options: q.options ?? [],
                required: q.required,
                maxLength: q.maxLength,
            })),
        );
    }, [questionnaire]);

    const allowedPolicies = POLICIES_FOR[visibility];
    useEffect(() => {
        if (!allowedPolicies.includes(policy)) setPolicy(allowedPolicies[0]);
    }, [visibility, allowedPolicies, policy]);

    const needsQuestions = policy === 'questionnaire';
    const canSave = useMemo(
        () => !needsQuestions || questions.some((q) => q.prompt.trim()),
        [needsQuestions, questions],
    );

    const addQuestion = () => {
        if (questions.length >= MAX_QUESTIONS) return;
        setQuestions((qs) => [...qs, { prompt: '', kind: 'text', required: true, options: [] }]);
    };

    const patchQuestion = (index: number, patch: Partial<CommunityQuestion>) =>
        setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));

    const removeQuestion = (index: number) =>
        setQuestions((qs) => qs.filter((_, i) => i !== index));

    const moveQuestion = (index: number, delta: number) =>
        setQuestions((qs) => {
            const next = [...qs];
            const target = index + delta;
            if (target < 0 || target >= next.length) return qs;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });

    const handleSave = async () => {
        if (!sessionToken || !canSave) return;
        setSaving(true);
        try {
            await updateCommunity({
                sessionToken,
                communityId: communityId as any,
                visibility,
                joinPolicy: policy,
                topic: topic.trim(),
            });
            await setCommunityRules({
                sessionToken,
                communityId: communityId as any,
                rules: rules.map((r) => r.trim()).filter(Boolean),
            });

            // Sólo se reescribe el cuestionario si la política lo usa: mandar
            // `[]` con otra política subiría la versión sin necesidad y
            // descartaría las preguntas que el admin quizá quiera recuperar.
            if (needsQuestions) {
                await setJoinQuestionnaire({
                    sessionToken,
                    communityId: communityId as any,
                    questions: questions
                        .filter((q) => q.prompt.trim())
                        .map((q) => ({
                            prompt: q.prompt.trim(),
                            kind: q.kind,
                            options:
                                q.kind === 'single' || q.kind === 'multi'
                                    ? (q.options ?? []).filter((o) => o.label.trim())
                                    : undefined,
                            required: q.required ?? false,
                            maxLength: q.maxLength,
                        })),
                });
            }

            show('Cambios guardados', 'success');
            navigation.goBack();
        } catch (e: any) {
            show(e?.data?.message || 'No se pudo guardar', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (community === undefined) {
        return (
            <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
                <ActivityIndicator color={c.primary} />
            </View>
        );
    }

    if (!community || (community as any).isPreview) {
        return (
            <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
                <Text style={styles.emptyText}>No tenés permisos sobre esta comunidad.</Text>
            </View>
        );
    }

    const cm = community as any;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: insets.top + Space[2] }]}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
                    <ArrowLeft size={22} color={c.text} />
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    Ajustes · {cm.name}
                </Text>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Space[12] }]}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.section}>Quién puede ver la comunidad</Text>
                {VISIBILITIES.map((v) => {
                    const meta = VISIBILITY_LABELS[v];
                    const Icon = meta.icon;
                    const selected = visibility === v;
                    return (
                        <Pressable
                            key={v}
                            style={[styles.card, selected && styles.cardSelected]}
                            onPress={() => setVisibility(v)}
                        >
                            <Icon size={18} color={selected ? c.primary : c.textMuted} />
                            <View style={styles.cardText}>
                                <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>
                                    {meta.label}
                                </Text>
                                <Text style={styles.cardDesc}>{meta.description}</Text>
                            </View>
                            {selected ? <Check size={18} color={c.primary} /> : null}
                        </Pressable>
                    );
                })}

                <Text style={styles.section}>Cómo se entra</Text>
                {allowedPolicies.map((p) => {
                    const meta = JOIN_POLICY_LABELS[p];
                    const selected = policy === p;
                    return (
                        <Pressable
                            key={p}
                            style={[styles.card, selected && styles.cardSelected]}
                            onPress={() => setPolicy(p)}
                        >
                            <View style={styles.cardText}>
                                <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>
                                    {meta.label}
                                </Text>
                                <Text style={styles.cardDesc}>{meta.description}</Text>
                            </View>
                            {selected ? <Check size={18} color={c.primary} /> : null}
                        </Pressable>
                    );
                })}
                {visibility === 'secret' ? (
                    <Text style={styles.note}>
                        Una comunidad secreta sólo admite invitaciones: si aceptara solicitudes,
                        alcanzaría con adivinar el id para saber que existe.
                    </Text>
                ) : null}

                <Text style={styles.section}>Tema</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder="Diseño, Running, Gastronomía…"
                    placeholderTextColor={c.textSubtle}
                    maxLength={30}
                />

                <Text style={styles.section}>Reglas</Text>
                {rules.map((rule, i) => (
                    <View key={i} style={styles.ruleRow}>
                        <TextInput
                            style={[styles.input, styles.ruleInput]}
                            value={rule}
                            onChangeText={(t) => setRules((rs) => rs.map((r, j) => (j === i ? t : r)))}
                            placeholder={`Regla ${i + 1}`}
                            placeholderTextColor={c.textSubtle}
                        />
                        <Pressable onPress={() => setRules((rs) => rs.filter((_, j) => j !== i))} hitSlop={8}>
                            <Trash2 size={18} color={c.danger} />
                        </Pressable>
                    </View>
                ))}
                {rules.length < 6 ? (
                    <Pressable style={styles.addBtn} onPress={() => setRules((rs) => [...rs, ''])}>
                        <Plus size={16} color={c.primary} />
                        <Text style={styles.addBtnText}>Agregar regla</Text>
                    </Pressable>
                ) : null}

                {needsQuestions ? (
                    <>
                        <Text style={styles.section}>Cuestionario de ingreso</Text>
                        <Text style={styles.note}>
                            Se responde antes de mandar la solicitud. Hasta {MAX_QUESTIONS} preguntas.
                        </Text>
                        {questions.map((q, i) => (
                            <View key={i} style={styles.question}>
                                <View style={styles.questionHeader}>
                                    <GripVertical size={16} color={c.textSubtle} />
                                    <Text style={styles.questionIndex}>Pregunta {i + 1}</Text>
                                    <Pressable onPress={() => moveQuestion(i, -1)} hitSlop={8}>
                                        <Text style={styles.moveBtn}>↑</Text>
                                    </Pressable>
                                    <Pressable onPress={() => moveQuestion(i, 1)} hitSlop={8}>
                                        <Text style={styles.moveBtn}>↓</Text>
                                    </Pressable>
                                    <Pressable onPress={() => removeQuestion(i)} hitSlop={8}>
                                        <Trash2 size={16} color={c.danger} />
                                    </Pressable>
                                </View>

                                <TextInput
                                    style={styles.input}
                                    value={q.prompt}
                                    onChangeText={(t) => patchQuestion(i, { prompt: t })}
                                    placeholder="¿Qué querés preguntar?"
                                    placeholderTextColor={c.textSubtle}
                                    multiline
                                />

                                <View style={styles.chipRow}>
                                    {(Object.keys(QUESTION_KIND_LABELS) as CommunityQuestionKind[]).map(
                                        (kind) => (
                                            <Pressable
                                                key={kind}
                                                onPress={() => patchQuestion(i, { kind })}
                                                style={[styles.chip, q.kind === kind && styles.chipActive]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.chipText,
                                                        q.kind === kind && styles.chipTextActive,
                                                    ]}
                                                >
                                                    {QUESTION_KIND_LABELS[kind]}
                                                </Text>
                                            </Pressable>
                                        ),
                                    )}
                                </View>

                                {q.kind === 'single' || q.kind === 'multi' ? (
                                    <View style={styles.options}>
                                        {(q.options ?? []).map((opt, oi) => (
                                            <View key={opt.id} style={styles.ruleRow}>
                                                <TextInput
                                                    style={[styles.input, styles.ruleInput]}
                                                    value={opt.label}
                                                    onChangeText={(t) =>
                                                        patchQuestion(i, {
                                                            options: (q.options ?? []).map((o, j) =>
                                                                j === oi ? { ...o, label: t } : o,
                                                            ),
                                                        })
                                                    }
                                                    placeholder={`Opción ${oi + 1}`}
                                                    placeholderTextColor={c.textSubtle}
                                                />
                                                <Pressable
                                                    onPress={() =>
                                                        patchQuestion(i, {
                                                            options: (q.options ?? []).filter(
                                                                (_, j) => j !== oi,
                                                            ),
                                                        })
                                                    }
                                                    hitSlop={8}
                                                >
                                                    <Trash2 size={16} color={c.danger} />
                                                </Pressable>
                                            </View>
                                        ))}
                                        <Pressable
                                            style={styles.addBtn}
                                            onPress={() =>
                                                patchQuestion(i, {
                                                    options: [
                                                        ...(q.options ?? []),
                                                        {
                                                            // Id estable dentro de la versión: las
                                                            // respuestas guardan `optionIds`.
                                                            id: `opt_${i}_${(q.options ?? []).length}_${Date.now()}`,
                                                            label: '',
                                                        },
                                                    ],
                                                })
                                            }
                                        >
                                            <Plus size={16} color={c.primary} />
                                            <Text style={styles.addBtnText}>Agregar opción</Text>
                                        </Pressable>
                                    </View>
                                ) : null}

                                <Pressable
                                    style={styles.toggleRow}
                                    onPress={() => patchQuestion(i, { required: !q.required })}
                                >
                                    <View style={[styles.checkbox, q.required && styles.checkboxOn]}>
                                        {q.required ? <Check size={13} color="#FFF" /> : null}
                                    </View>
                                    <Text style={styles.toggleLabel}>Obligatoria</Text>
                                </Pressable>
                            </View>
                        ))}

                        {questions.length < MAX_QUESTIONS ? (
                            <Pressable style={styles.addBtn} onPress={addQuestion}>
                                <Plus size={16} color={c.primary} />
                                <Text style={styles.addBtnText}>Agregar pregunta</Text>
                            </Pressable>
                        ) : null}
                    </>
                ) : null}

                <Text style={styles.section}>Invitaciones</Text>
                <Pressable style={styles.secondary} onPress={() => setInvitesOpen(true)}>
                    <Link2 size={16} color={c.primary} />
                    <Text style={styles.secondaryText}>Gestionar links de invitación</Text>
                </Pressable>

                <Pressable
                    style={[styles.cta, (!canSave || saving) && styles.ctaDisabled]}
                    onPress={handleSave}
                    disabled={!canSave || saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.ctaText}>Guardar cambios</Text>
                    )}
                </Pressable>
                {!canSave ? (
                    <Text style={styles.note}>Agregá al menos una pregunta al cuestionario.</Text>
                ) : null}
            </ScrollView>

            <CommunityInviteSheet
                open={invitesOpen}
                communityId={communityId}
                communityName={cm.name}
                onClose={() => setInvitesOpen(false)}
            />
        </KeyboardAvoidingView>
    );
}

const getStyles = createThemedStyles((isDark, c) => ({
    container: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    emptyText: { ...Type.body, color: c.textMuted },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[3],
        paddingHorizontal: Space[4],
        paddingBottom: Space[3],
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
    },
    backBtn: { width: Touch.min - 12, height: Touch.min - 12, justifyContent: 'center' },
    headerTitle: { ...Type.title, color: c.text, flex: 1 },
    scroll: { paddingHorizontal: Space[4] },
    section: {
        ...Type.caption,
        color: c.textSubtle,
        textTransform: 'uppercase',
        marginTop: Space[6],
        marginBottom: Space[2],
    },
    note: { ...Type.caption, fontWeight: '500', color: c.textMuted, marginTop: Space[2] },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[3],
        padding: Space[3],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
        marginBottom: Space[2],
    },
    cardSelected: { backgroundColor: c.primaryMuted, borderColor: c.borderFocus },
    cardText: { flex: 1 },
    cardTitle: { ...Type.bodySm, fontWeight: '700', color: c.text },
    cardTitleSelected: { color: c.primary },
    cardDesc: { ...Type.caption, fontWeight: '500', color: c.textMuted, marginTop: 2 },
    input: {
        ...Type.bodySm,
        color: c.text,
        minHeight: Touch.min,
        paddingHorizontal: Space[3],
        paddingVertical: Space[2],
        borderRadius: Radius.md,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
        marginBottom: Space[2],
    },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: Space[2] },
    ruleInput: { flex: 1 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Space[2] },
    addBtnText: { ...Type.bodySm, fontWeight: '700', color: c.primary },
    question: {
        padding: Space[3],
        borderRadius: Radius.lg,
        backgroundColor: c.surface1,
        borderWidth: 1,
        borderColor: c.border,
        marginBottom: Space[3],
    },
    questionHeader: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginBottom: Space[2] },
    questionIndex: { ...Type.caption, color: c.textSubtle, flex: 1 },
    moveBtn: { ...Type.bodySm, color: c.textMuted, paddingHorizontal: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2], marginBottom: Space[2] },
    chip: {
        paddingHorizontal: Space[3],
        paddingVertical: 6,
        borderRadius: Radius.full,
        backgroundColor: c.surface2,
        borderWidth: 1,
        borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primaryMuted, borderColor: c.borderFocus },
    chipText: { ...Type.caption, color: c.textMuted },
    chipTextActive: { color: c.primary, fontWeight: '800' },
    options: { marginTop: Space[1] },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginTop: Space[2] },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: Radius.xs,
        borderWidth: 1.5,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
    toggleLabel: { ...Type.bodySm, color: c.textSecondary },
    secondary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: Touch.min,
        borderRadius: Radius.full,
        backgroundColor: c.surface2,
        borderWidth: 1,
        borderColor: c.border,
    },
    secondaryText: { ...Type.bodySm, fontWeight: '700', color: c.primary },
    cta: {
        height: 48,
        borderRadius: Radius.full,
        backgroundColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Space[8],
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { ...Type.body, fontWeight: '800', color: '#FFF' },
}));
