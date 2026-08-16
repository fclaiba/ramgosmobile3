import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import { glassShadow, Radius } from '../theme/tokens';
import { isSessionExpiredError } from '../utils/errors';
import { CURRENT_SESSION_KEY } from '../services/auth/sessionKeys';


interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class CrashHandler extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Una sesión vencida no es un crash: no ensucia Sentry.
        if (isSessionExpiredError(error)) {
            console.warn("CrashHandler: sesión expirada", error.message);
            return;
        }
        console.error("CrashHandler caught error:", error, errorInfo);
        Sentry.captureException(error, {
            extra: {
                componentStack: errorInfo.componentStack,
            },
        });
    }

    /**
     * Sesión expirada que se escapó del SessionGuard (p.ej. lanzada antes de que
     * montara el árbol de providers): borramos SOLO la sesión, no todo el storage.
     */
    handleSessionReset = async () => {
        try {
            await AsyncStorage.removeItem(CURRENT_SESSION_KEY);
        } catch (e) {
            console.error("Failed to clear session", e);
        }
        if (typeof window !== 'undefined') {
            window.location.reload();
        } else {
            this.setState({ hasError: false, error: null });
        }
    };

    handleReset = async () => {
        try {
            await AsyncStorage.clear();
            // On web, also clear localStorage just in case
            if (typeof localStorage !== 'undefined') {
                localStorage.clear();
            }
            // Force reload
            if (typeof window !== 'undefined') {
                window.location.reload();
            } else {
                // Native reload typically requires bridge or just clearing state
                this.setState({ hasError: false, error: null });
            }
        } catch (e) {
            console.error("Failed to reset", e);
        }
    };

    render() {
        if (this.state.hasError && isSessionExpiredError(this.state.error)) {
            return (
                <View style={styles.container}>
                    <View style={styles.card}>
                        <AlertTriangle size={48} color="#F59E0B" style={{ marginBottom: 16 }} />
                        <Text style={styles.title}>Tu sesión expiró</Text>
                        <Text style={styles.subtitle}>
                            Iniciá sesión nuevamente para continuar.
                        </Text>

                        <TouchableOpacity
                            style={styles.resetBtn}
                            onPress={this.handleSessionReset}
                            activeOpacity={0.8}
                        >
                            <RefreshCw size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.btnText}>Volver a iniciar sesión</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        if (this.state.hasError) {

            return (
                <View style={styles.container}>
                    <View style={styles.card}>
                        <AlertTriangle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
                        <Text style={styles.title}>Algo salió mal</Text>
                        <Text style={styles.subtitle}>
                            La aplicación encontró un error inesperado al iniciar.
                        </Text>

                        <ScrollView style={styles.errorBox}>
                            <Text style={styles.errorText}>{this.state.error?.message}</Text>
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.resetBtn}
                            onPress={this.handleReset}
                            activeOpacity={0.8}
                        >
                            <Trash2 size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.btnText}>Borrar datos y reiniciar</Text>
                        </TouchableOpacity>

                        <Text style={styles.hint}>
                            Esto borrará tu sesión local y caché para corregir problemas de datos corruptos.
                        </Text>
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.62)',
        borderRadius: Radius.xl,
        padding: 32,
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
        ...glassShadow(false),},
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24
    },
    errorBox: {
        backgroundColor: '#FEF2F2',
        borderRadius: Radius.md,
        padding: 16,
        width: '100%',
        maxHeight: 150,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#FECACA'
    },
    errorText: {
        color: '#B91C1C',
        fontFamily: 'monospace',
        fontSize: 12
    },
    resetBtn: {
        backgroundColor: '#EF4444',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: Radius.md,
        width: '100%',
        marginBottom: 16
    },
    btnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16
    },
    hint: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center'
    }
});
