import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSISTENCE_ENABLED = true;

type StorageLike = {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const inMemoryStorage: StorageLike = {
    async getItem(key) {
        return memoryStore.has(key) ? memoryStore.get(key)! : null;
    },
    async setItem(key, value) {
        memoryStore.set(key, value);
    },
    async removeItem(key) {
        memoryStore.delete(key);
    },
};

const persistentStorage: StorageLike = {
    async getItem(key) {
        return AsyncStorage.getItem(key);
    },
    async setItem(key, value) {
        await AsyncStorage.setItem(key, value);
    },
    async removeItem(key) {
        await AsyncStorage.removeItem(key);
    },
};

export const storage: StorageLike = PERSISTENCE_ENABLED ? persistentStorage : inMemoryStorage;

export { PERSISTENCE_ENABLED };





