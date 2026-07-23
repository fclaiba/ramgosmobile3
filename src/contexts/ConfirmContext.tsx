import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Animated } from 'react-native';
import { AlertTriangle, CheckCircle2, Info, AlertCircle, HelpCircle } from 'lucide-react-native';
import { useTheme } from './ThemeContext';
import { glassTokens } from '../utils/glass';
import { ConfirmOpts, ConfirmKind, setConfirmHandler } from '../utils/confirm';
import { Radius, colors } from '../theme/tokens';

interface ConfirmContextType {
    confirm: (options: ConfirmOpts) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
    return ctx.confirm;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const styles = getStyles(isDark);

    const [options, setOptions] = useState<ConfirmOpts | null>(null);
    const resolverRef = useRef<((v: boolean) => void) | null>(null);
    const scaleAnim = useRef(new Animated.Value(0.95)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const confirm = useCallback((opts: ConfirmOpts): Promise<boolean> => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setOptions(opts);
            
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true })
            ]).start();

            if (Platform.OS === 'web') {
                (document.activeElement as HTMLElement | null)?.blur?.();
            }
        });
    }, [fadeAnim, scaleAnim]);

    const close = (result: boolean) => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true })
        ]).start(() => {
            resolverRef.current?.(result);
            resolverRef.current = null;
            setOptions(null);
        });
    };

    // Expose the styled dialog to non-hook call sites (confirmAction util).
    React.useEffect(() => {
        setConfirmHandler((opts) => confirm(opts));
        return () => setConfirmHandler(null);
    }, [confirm]);

    const renderIcon = () => {
        const kind = options?.kind ?? 'danger';
        switch (kind) {
            case 'success': return <CheckCircle2 size={24} color="#10B981" />;
            case 'warning': return <AlertCircle size={24} color="#F59E0B" />;
            case 'info': return <Info size={24} color="#3B82F6" />;
            case 'danger': default: return <AlertTriangle size={24} color="#EF4444" />;
        }
    };

    const getIconBg = () => {
        const kind = options?.kind ?? 'danger';
        switch (kind) {
            case 'success': return '#10B98122';
            case 'warning': return '#F59E0B22';
            case 'info': return '#3B82F622';
            case 'danger': default: return '#EF444422';
        }
    };

    const getBtnColor = () => {
        const kind = options?.kind ?? 'danger';
        switch (kind) {
            case 'success': return '#10B981';
            case 'warning': return '#F59E0B';
            case 'info': return '#3B82F6';
            case 'danger': default: return '#EF4444';
        }
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <Modal
                transparent
                visible={!!options}
                onRequestClose={() => close(false)}
                accessibilityViewIsModal
            >
                <View style={styles.backdrop}>
                    {options && (
                        <Animated.View style={[
                            styles.dialog,
                            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
                        ]}>
                            <View style={[styles.iconWrap, { backgroundColor: getIconBg() }]}>
                                {renderIcon()}
                            </View>
                            <Text style={styles.title}>{options.title}</Text>
                            <Text style={styles.message}>{options.message}</Text>
                            <View style={styles.actions}>
                                <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => close(false)}>
                                    <Text style={styles.btnCancelText}>{options.cancelLabel ?? 'Cancelar'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.btn, { backgroundColor: getBtnColor() }]}
                                    onPress={() => close(true)}
                                >
                                    <Text style={styles.btnConfirmText}>{options.confirmLabel ?? 'Confirmar'}</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    )}
                </View>
            </Modal>
        </ConfirmContext.Provider>
    );
};

const getStyles = (isDark: boolean) => {
    const glass = glassTokens(isDark);
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
        },
        dialog: {
            width: '100%',
            maxWidth: 400,
            borderRadius: Radius.xl,
            padding: 24,
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.85)',
            borderWidth: 1,
            borderColor: glass.border,
            ...glass.shadow,
            ...glass.backdrop,
        },
        iconWrap: {
            width: 52, height: 52, borderRadius: Radius.full,
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        },
        title: {
            fontSize: 19, fontWeight: '700', textAlign: 'center',
            color: colors(isDark).text,
            marginBottom: 8,
        },
        message: {
            fontSize: 14.5, textAlign: 'center', lineHeight: 22,
            color: colors(isDark).textMuted,
        },
        actions: { flexDirection: 'row', gap: 12, marginTop: 24, alignSelf: 'stretch' },
        btn: {
            flex: 1, paddingVertical: 14, borderRadius: Radius.lg,
            alignItems: 'center', justifyContent: 'center',
        },
        btnCancel: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            borderWidth: 1,
            borderColor: glass.border,
        },
        btnCancelText: { fontWeight: '600', fontSize: 14.5, color: colors(isDark).text },
        btnConfirmText: { fontWeight: '600', fontSize: 14.5, color: '#FFFFFF' },
    });
};
