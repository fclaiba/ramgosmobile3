// FASE 3: puente mínimo para exponer el sessionToken fuera del árbol de AuthProvider.
// En App.tsx CartProvider envuelve a AuthProvider, por lo que CartContext no puede
// usar useAuth(). AuthContext escribe acá y CartContext lee vía useSyncExternalStore.

let currentToken: string | undefined;
const listeners = new Set<() => void>();

export const sessionTokenStore = {
    get: (): string | undefined => currentToken,
    set: (token: string | undefined) => {
        if (token === currentToken) return;
        currentToken = token;
        listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
