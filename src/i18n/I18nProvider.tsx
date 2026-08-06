import { PropsWithChildren, useEffect } from 'react';
import i18n, { normalizeLanguage, readStoredLanguage, setAppLanguage } from './index';
import { useUserPreferences } from '../hooks/useUserPreferences';

export function I18nProvider({ children }: PropsWithChildren) {
  const { language } = useUserPreferences();

  useEffect(() => {
    void (async () => {
      const saved = await readStoredLanguage();
      if (saved && i18n.language !== saved) {
        await i18n.changeLanguage(saved);
      }
    })();
  }, []);

  useEffect(() => {
    const next = normalizeLanguage(language);
    void setAppLanguage(next);
  }, [language]);

  return <>{children}</>;
}
