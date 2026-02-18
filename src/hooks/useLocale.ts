import { useState, useCallback, useEffect } from "react";
import { loadLocale, saveLocale, type Locale } from "../lib/locale-store";
import { t } from "../lib/i18n";

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(loadLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocale(newLocale);
  }, []);

  const translate = useCallback((key: string, params?: Record<string, string | number>) => {
    return t(locale, key, params);
  }, [locale]);

  return { locale, setLocale, t: translate };
}
