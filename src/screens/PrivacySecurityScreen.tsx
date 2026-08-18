import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    Key,
    Shield,
    Fingerprint,
    MapPin,
    History as HistoryIcon,
    MessageSquare,
    FileText,
    Eye,
    ChevronRight,
    Lock,
    Users2,
} from 'lucide-react-native';
import { MobileHeader } from '../components/MobileHeader';
import { Card, CardContent } from '../components/ui/card';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { colors, Radius, Space } from '../theme/tokens';


const STORAGE_KEY = '@ramgos_privacy_security';

type PrivacySecurityState = {
    twoFactor: boolean;
    biometrics: boolean;
    showLocation: boolean;
    showActivity: boolean;
    allowMessages: boolean;
};

const DEFAULTS: PrivacySecurityState = {
    twoFactor: false,
    biometrics: false,
    showLocation: true,
    showActivity: true,
    allowMessages: true,
};

export default function PrivacySecurityScreen({ navigation }: any) {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const c = colors(isDark);
    const styles = getStyles(isDark, c);
    const { show } = useToast();
    const [state, setState] = useState<PrivacySecurityState>(DEFAULTS);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (raw) setState({ ...DEFAULTS, ...JSON.parse(raw) });
            } catch {}
            setReady(true);
        })();
    }, []);

    const persist = useCallback(async (next: PrivacySecurityState) => {
        setState(next);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
    }, []);

    const toggle = (key: keyof PrivacySecurityState) => {
        if (!ready) return;
        const next = { ...state, [key]: !state[key] };
        persist(next);
        const labels: Record<keyof PrivacySecurityState, string> = {
            twoFactor: 'Autenticación 2FA',
            biometrics: 'Biometría',
            showLocation: 'Ubicación visible',
            showActivity: 'Actividad visible',
            allowMessages: 'Mensajes de otros',
        };
        show(`${labels[key]}: ${next[key] ? 'activado' : 'desactivado'}`, 'success');
    };

    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={styles.sectionHeader}>{title}</Text>
    );

    const Row = ({
        icon: Icon,
        label,
        hint,
        type = 'chevron',
        value,
        onPress,
        color,
    }: {
        icon: any;
        label: string;
        hint?: string;
        type?: 'chevron' | 'switch';
        value?: boolean;
        onPress?: () => void;
        color?: string;
    }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={type === 'switch' ? undefined : onPress}
            disabled={type === 'switch'}
            activeOpacity={0.75}
        >
            <View style={styles.iconBox}>
                <Icon size={18} color={color || c.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.label}>{label}</Text>
                {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            </View>
            {type === 'chevron' && <ChevronRight size={18} color={c.textSubtle} />}
            {type === 'switch' && (
                <Switch
                    value={!!value}
                    onValueChange={onPress}
                    trackColor={{ false: '#767577', true: c.primary }}
                    thumbColor="#fff"
                />
            )}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <MobileHeader
                title="Privacidad y Seguridad"
                subtitle="Controlá tu cuenta"
                backButton
                onBack={() => navigation.goBack()}
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Lock size={22} color={c.primary} />
                    <Text style={styles.heroText}>
                        Protegé tu cuenta y decidí qué ven otros usuarios en Ramgos.
                    </Text>
                </View>

                <SectionHeader title="Seguridad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <Row
                            icon={Key}
                            label="Cambiar contraseña"
                            hint="Actualizá tu clave de acceso"
                            onPress={() => navigation.navigate('ChangePassword')}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={Shield}
                            label="Autenticación en 2 factores"
                            hint="Código extra al iniciar sesión"
                            type="switch"
                            value={state.twoFactor}
                            onPress={() => toggle('twoFactor')}
                            color={c.primary}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={Fingerprint}
                            label="Biometría"
                            hint="Face ID / huella en este dispositivo"
                            type="switch"
                            value={state.biometrics}
                            onPress={() => toggle('biometrics')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Privacidad" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <Row
                            icon={MapPin}
                            label="Mostrar ubicación"
                            hint="Visible en tu perfil público"
                            type="switch"
                            value={state.showLocation}
                            onPress={() => toggle('showLocation')}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={HistoryIcon}
                            label="Mostrar actividad"
                            hint="Compras y eventos recientes"
                            type="switch"
                            value={state.showActivity}
                            onPress={() => toggle('showActivity')}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={MessageSquare}
                            label="Permitir mensajes"
                            hint="Otros usuarios pueden escribirte"
                            type="switch"
                            value={state.allowMessages}
                            onPress={() => toggle('allowMessages')}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={Users2}
                            label="Silenciados, ocultos y mejores amigos"
                            hint="Gestioná tu privacidad en la red social"
                            type="chevron"
                            onPress={() => navigation.navigate('SocialPrivacy')}
                        />
                    </CardContent>
                </Card>

                <SectionHeader title="Legal" />
                <Card style={styles.card}>
                    <CardContent style={styles.cardContent}>
                        <Row
                            icon={Eye}
                            label="Política de privacidad"
                            onPress={() => navigation.navigate('Privacy')}
                        />
                        <View style={styles.divider} />
                        <Row
                            icon={FileText}
                            label="Términos de servicio"
                            onPress={() => navigation.navigate('Terms')}
                        />
                    </CardContent>
                </Card>

                <TouchableOpacity
                    style={styles.linkSettings}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Text style={styles.linkSettingsText}>Más opciones en Configuración</Text>
                    <ChevronRight size={16} color={c.primary} />
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const getStyles = (isDark: boolean, c: ReturnType<typeof colors>) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: c.bg },
        content: { padding: Space[4], paddingBottom: 100 },
        hero: {
            flexDirection: 'row',
            gap: 12,
            padding: 14,
            borderRadius: Radius.lg,
            backgroundColor: c.primaryMuted,
            marginBottom: Space[2],
            alignItems: 'center',
        },
        heroText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.textMuted },
        sectionHeader: {
            fontSize: 12,
            fontWeight: '700',
            color: c.textMuted,
            marginTop: Space[4],
            marginBottom: Space[2],
            paddingLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        card: { overflow: 'hidden', borderWidth: 0 },
        cardContent: { padding: 0 },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            backgroundColor: c.glassStrong,
            gap: 12,
        },
        iconBox: {
            width: 36,
            height: 36,
            borderRadius: Radius.md,
            backgroundColor: c.glass,
            alignItems: 'center',
            justifyContent: 'center',
        },
        label: { fontSize: 15, fontWeight: '600', color: c.text },
        hint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider, marginLeft: 64 },
        linkSettings: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: Space[6],
            paddingVertical: 12,
        },
        linkSettingsText: { fontSize: 14, fontWeight: '600', color: c.primary },
    });
