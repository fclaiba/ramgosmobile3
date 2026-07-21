import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import { glassShadow, Radius } from '../theme/tokens';


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
        console.error("CrashHandler caught error:", error, errorInfo);
        Sentry.captureException(error, {
            extra: {
                componentStack: errorInfo.componentStack,
            },
        });
    }

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
