import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from './ThemeContext';
import { glassTokens } from '../utils/glass';
import { setConfirmHandler } from '../utils/confirm';
import { Radius, colors } from '../theme/tokens';


interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
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

    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((v: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setOptions(opts);
            if (Platform.OS === 'web') {
                (document.activeElement as HTMLElement | null)?.blur?.();
            }
        });
    }, []);

    const close = (result: boolean) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setOptions(null);
    };

    // Expose the styled dialog to non-hook call sites (confirmAction util).
    React.useEffect(() => {
        setConfirmHandler((title, message) => confirm({ title, message, destructive: true }));
        return () => setConfirmHandler(null);
    }, [confirm]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <Modal
                transparent
                visible={!!options}
                animationType="fade"
                onRequestClose={() => close(false)}
                accessibilityViewIsModal
            >
                <View style={styles.backdrop}>
                    <View style={styles.dialog}>
                        <View style={[styles.iconWrap, { backgroundColor: options?.destructive ? '#EF444422' : '#6366F122' }]}>
                            <AlertTriangle size={22} color={options?.destructive ? '#EF4444' : '#6366F1'} />
                        </View>
                        <Text style={styles.title}>{options?.title}</Text>
                        <Text style={styles.message}>{options?.message}</Text>
                        <View style={styles.actions}>
                            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => close(false)}>
                                <Text style={styles.btnCancelText}>{options?.cancelLabel ?? 'Cancelar'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.btn, options?.destructive ? styles.btnDanger : styles.btnPrimary]}
                                onPress={() => close(true)}
                            >
                                <Text style={styles.btnConfirmText}>{options?.confirmLabel ?? 'Confirmar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
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
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
        },
        dialog: {
            width: '100%',
            maxWidth: 400,
            borderRadius: Radius.xl,
            padding: 22,
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(17,24,39,0.92)' : 'rgba(255,255,255,0.92)',
            borderWidth: 1,
            borderColor: glass.border,
            ...glass.shadow,
            ...glass.backdrop,
        },
        iconWrap: {
            width: 48, height: 48, borderRadius: Radius.lg,
            alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        },
        title: {
            fontSize: 17, fontWeight: '800', textAlign: 'center',
            color: colors(isDark).text,
        },
        message: {
            fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 19,
            color: colors(isDark).textMuted,
        },
        actions: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
        btn: {
            flex: 1, paddingVertical: 12, borderRadius: Radius.md,
            alignItems: 'center', justifyContent: 'center',
        },
        btnCancel: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.06)',
            borderWidth: 1,
            borderColor: glass.border,
        },
        btnPrimary: { backgroundColor: '#6366F1' },
        btnDanger: { backgroundColor: '#EF4444' },
        btnCancelText: { fontWeight: '700', fontSize: 13.5, color: colors(isDark).text },
        btnConfirmText: { fontWeight: '700', fontSize: 13.5, color: '#FFFFFF' },
    });
};
