import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEs from './locales/es/common.json';
import commonEn from './locales/en/common.json';
import authEs from './locales/es/auth.json';
import authEn from './locales/en/auth.json';
import settingsEs from './locales/es/settings.json';
import settingsEn from './locales/en/settings.json';

export const LANGUAGE_STORAGE_KEY = '@ramgos/language';
export type AppLanguage = 'es' | 'en';

const resources = {
  es: { common: commonEs, auth: authEs, settings: settingsEs },
  en: { common: commonEn, auth: authEn, settings: settingsEn }
} as const;

function normalizeLanguage(input?: string | null): AppLanguage {
  if (!input) return 'es';
  return input.toLowerCase().startsWith('en') ? 'en' : 'es';
}

function deviceDefaultLanguage(): AppLanguage {
  const locale = getLocales()[0]?.languageTag ?? '';
  return normalizeLanguage(locale);
}

export async function readStoredLanguage(): Promise<AppLanguage | null> {
  const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!saved) return null;
  return normalizeLanguage(saved);
}

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }
}

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources,
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  interpolation: { escapeValue: false }
});

void (async () => {
  try {
    const saved = await readStoredLanguage();
    await i18n.changeLanguage(saved ?? deviceDefaultLanguage());
  } catch {
    await i18n.changeLanguage('es');
  }
})();

export { normalizeLanguage };
export default i18n;
