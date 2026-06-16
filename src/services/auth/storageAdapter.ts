import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSISTENCE_ENABLED = true;

type StorageLike = {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const XOR_KEY = 'R@mG0s_S3cUr3_K3y_2026';

const encode = (text: string): string => {
    if (!text) return text;
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length);
        result += charCode.toString(16).padStart(2, '0');
    }
    return result;
};

const decode = (hex: string): string | null => {
    if (!hex) return null;
    // Fallback if the string doesn't look like our hex encoded string (e.g. legacy data)
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return hex;
    try {
        let result = '';
        for (let i = 0; i < hex.length; i += 2) {
            const charCode = parseInt(hex.substring(i, i + 2), 16) ^ XOR_KEY.charCodeAt((i / 2) % XOR_KEY.length);
            result += String.fromCharCode(charCode);
        }
        // Double check if decoded string is valid JSON or similar, if it fails fallback
        if (result.includes('"[object Object]"')) return hex;
        return result;
    } catch (e) {
        return hex;
    }
};

const inMemoryStorage: StorageLike = {
    async getItem(key) {
        const val = memoryStore.has(key) ? memoryStore.get(key)! : null;
        return val ? decode(val) : null;
    },
    async setItem(key, value) {
        memoryStore.set(key, encode(value));
    },
    async removeItem(key) {
        memoryStore.delete(key);
    },
};

const persistentStorage: StorageLike = {
    async getItem(key) {
        const val = await AsyncStorage.getItem(key);
        return val ? decode(val) : null;
    },
    async setItem(key, value) {
        await AsyncStorage.setItem(key, encode(value));
    },
    async removeItem(key) {
        await AsyncStorage.removeItem(key);
    },
};

export const storage: StorageLike = PERSISTENCE_ENABLED ? persistentStorage : inMemoryStorage;

export { PERSISTENCE_ENABLED };





