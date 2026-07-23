import { Alert, Platform } from 'react-native';

export type ConfirmKind = 'success' | 'danger' | 'warning' | 'info';

export interface ConfirmOpts {
    title: string;
    message: string;
    kind?: ConfirmKind;
    confirmLabel?: string;
    cancelLabel?: string;
}

type ConfirmHandler = (opts: ConfirmOpts) => Promise<boolean>;

// ConfirmProvider registers the glass-styled dialog here at mount.
let handler: ConfirmHandler | null = null;
export const setConfirmHandler = (h: ConfirmHandler | null) => { handler = h; };

export const confirmAction = (
    title: string, 
    message: string, 
    kind: ConfirmKind = 'danger',
    confirmLabel?: string,
    cancelLabel?: string
): Promise<boolean> => {
    if (handler) return handler({ title, message, kind, confirmLabel, cancelLabel });
    
    // Fallback if provider is not mounted (should not happen in app runtime).
    if (Platform.OS === 'web') {
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: cancelLabel ?? 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: confirmLabel ?? 'Confirmar', style: kind === 'danger' ? 'destructive' : 'default', onPress: () => resolve(true) },
        ]);
    });
};
