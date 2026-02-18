export type Locale = "zh" | "en";

export const VALID_LOCALES: readonly Locale[] = ["zh", "en"];

export function isValidLocale(value: unknown): value is Locale {
  return VALID_LOCALES.includes(value as Locale);
}

const LOCALE_KEY = "2fa-locale";

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
  }
}

export function loadLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_KEY);
    if (!raw) return "zh";
    return isValidLocale(raw) ? raw : "zh";
  } catch {
    return "zh";
  }
}

export function getBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "zh";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("en")) return "en";
  return "zh";
}

export function detectLocale(): Locale {
  const saved = loadLocale();
  if (saved) return saved;
  return getBrowserLocale();
}
