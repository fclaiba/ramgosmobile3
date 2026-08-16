import React, { Component, ReactNode, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { navigationRef } from '../navigation/navigationRef';
import { isSessionExpiredError } from '../utils/errors';

/**
 * Boundary de sesión. Va DENTRO de AuthProvider (CrashHandler está fuera de los
 * providers y no puede desloguear), y separa dos casos:
 *
 *  - Error de sesión expirada (ConvexError UNAUTHENTICATED, que `useQuery`
 *    re-lanza durante el render): desloguea y manda al login, sin pantalla de
 *    crash. Un FORBIDDEN NO entra acá — pedir datos ajenos no cierra tu sesión.
 *  - Cualquier otro error: se re-lanza para que lo agarre CrashHandler igual que antes.
 */

interface BoundaryProps {
    resetKey: string;
    onSessionExpired: () => void;
    children: ReactNode;
}

interface BoundaryState {
    error: Error | null;
}

class SessionErrorBoundary extends Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): BoundaryState {
        return { error };
    }

    componentDidCatch(error: Error) {
        if (isSessionExpiredError(error)) {
            this.props.onSessionExpired();
        }
    }

    componentDidUpdate(prevProps: BoundaryProps) {
        // Cuando el estado de auth cambia (terminó el logout) volvemos a montar
        // el árbol. Los useQuery ya ven sessionToken undefined → 'skip', así que
        // no se re-lanza el mismo error en loop.
        if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null });
        }
    }

    render() {
        const { error } = this.state;
        if (error) {
            // No es de sesión: que siga subiendo hasta CrashHandler.
            if (!isSessionExpiredError(error)) throw error;
            return (
                <View style={styles.container}>
                    <ActivityIndicator size="large" color="#2196F3" />
                </View>
            );
        }
        return this.props.children;
    }
}

export function SessionGuard({ children }: { children: ReactNode }) {
    const { logout, status, sessionToken } = useAuth();
    const { show } = useToast();
    const handling = useRef(false);

    const onSessionExpired = useCallback(() => {
        if (handling.current) return;
        handling.current = true;

        const goToLogin = () => {
            show('Tu sesión expiró. Iniciá sesión nuevamente.', 'error');
            if (navigationRef.isReady()) {
                navigationRef.reset({ index: 0, routes: [{ name: 'Login' as never }] });
            }
            handling.current = false;
        };

        if (status === 'anonymous') {
            goToLogin();
            return;
        }
        logout().then(goToLogin).catch(goToLogin);
    }, [logout, show, status]);

    return (
        <SessionErrorBoundary
            resetKey={`${status}:${sessionToken ?? 'none'}`}
            onSessionExpired={onSessionExpired}
        >
            {children}
        </SessionErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
