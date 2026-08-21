import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, Radius } from '../../theme/tokens';

export default function CreateCommunityScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
    const { sessionToken, user } = useAuth();
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);
    const { show } = useToast();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [kind, setKind] = useState<'business' | 'user'>(user?.role === 'business' ? 'business' : 'user');
    const [visibility, setVisibility] = useState<'public' | 'private'>('public');
    // B4: reglas estilo Twitter Communities — una por línea, sin gate de
    // aceptación obligatoria (fricción mínima).
    const [rulesText, setRulesText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const createCommunity = useMutation(api.social.communities.createCommunity);
    const setCommunityRules = useMutation(api.social.communities.setCommunityRules);

    const handleCreate = async () => {
        if (!sessionToken || name.trim().length < 3) {
            show('El nombre debe tener al menos 3 caracteres', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const communityId = await createCommunity({
                sessionToken,
                name: name.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                kind,
                visibility,
            });
            const rules = rulesText.split('\n').map((r) => r.trim()).filter(Boolean);
            if (rules.length) {
                await setCommunityRules({ sessionToken, communityId, rules }).catch(() => {});
            }
            navigation.replace('CommunityDetail', { communityId });
        } catch (e: any) {
            show(e?.data?.message ?? 'No se pudo crear la comunidad', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ padding: 16 }}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <ArrowLeft size={22} color={isDark ? '#fff' : '#111827'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Nueva comunidad</Text>
                <View style={{ width: 22 }} />
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej: Vendedores de Palermo" placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'} maxLength={60} />

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="¿De qué se trata esta comunidad?"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                multiline
                maxLength={280}
            />

            <Text style={styles.label}>Ubicación (opcional)</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Ej: Palermo, Buenos Aires" placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'} />

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.rowOptions}>
                {(['business', 'user'] as const).map((k) => (
                    <TouchableOpacity key={k} style={[styles.option, kind === k && styles.optionActive]} onPress={() => setKind(k)}>
                        <Text style={[styles.optionText, kind === k && styles.optionTextActive]}>
                            {k === 'business' ? 'Negocio / Pasillo comercial' : 'Grupo de amigos'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Visibilidad</Text>
            <View style={styles.rowOptions}>
                {(['public', 'private'] as const).map((v) => (
                    <TouchableOpacity key={v} style={[styles.option, visibility === v && styles.optionActive]} onPress={() => setVisibility(v)}>
                        <Text style={[styles.optionText, visibility === v && styles.optionTextActive]}>
                            {v === 'public' ? 'Pública' : 'Privada (aprobación manual)'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>Reglas (opcional, una por línea)</Text>
            <TextInput
                style={[styles.input, styles.multiline]}
                value={rulesText}
                onChangeText={setRulesText}
                placeholder={'Ej: Sólo productos del rubro\nNada de spam'}
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                multiline
            />

            <TouchableOpacity
                style={[styles.submitBtn, (submitting || name.trim().length < 3) && styles.submitBtnDisabled]}
                disabled={submitting || name.trim().length < 3}
                onPress={handleCreate}
            >
                <Text style={styles.submitBtnText}>{submitting ? 'Creando…' : 'Crear comunidad'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? '#000' : '#fff' },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
        iconBtn: { padding: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111827' },
        label: { fontSize: 13, fontWeight: '600', color: isDark ? '#D1D5DB' : '#374151', marginBottom: 6, marginTop: 16 },
        input: {
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#E5E7EB',
            padding: 12,
            color: isDark ? '#fff' : '#111827',
            fontSize: 14,
        },
        multiline: { minHeight: 80, textAlignVertical: 'top' },
        rowOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        option: {
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: isDark ? '#374151' : '#E5E7EB',
        },
        optionActive: { backgroundColor: colors(isDark).primary, borderColor: colors(isDark).primary },
        optionText: { fontSize: 13, color: isDark ? '#D1D5DB' : '#374151', fontWeight: '500' },
        optionTextActive: { color: '#fff' },
        submitBtn: {
            marginTop: 32,
            backgroundColor: colors(isDark).primary,
            borderRadius: Radius.md,
            paddingVertical: 14,
            alignItems: 'center',
        },
        submitBtnDisabled: { opacity: 0.5 },
        submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    });
