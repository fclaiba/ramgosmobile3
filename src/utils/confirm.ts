import { Alert, Platform } from 'react-native';

type ConfirmHandler = (title: string, message: string) => Promise<boolean>;

// ConfirmProvider registers the glass-styled dialog here at mount.
let handler: ConfirmHandler | null = null;
export const setConfirmHandler = (h: ConfirmHandler | null) => { handler = h; };

export const confirmAction = (title: string, message: string): Promise<boolean> => {
    if (handler) return handler(title, message);
    // Fallback if provider is not mounted (should not happen in app runtime).
    if (Platform.OS === 'web') {
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
        ]);
    });
};
