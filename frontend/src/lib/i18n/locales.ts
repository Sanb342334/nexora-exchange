export type LocaleId =
  | 'ms'
  | 'cs'
  | 'da'
  | 'de'
  | 'en'
  | 'es'
  | 'es-419'
  | 'fr'
  | 'it'
  | 'hu'
  | 'nl'
  | 'no'
  | 'pl'
  | 'pt'
  | 'ro'
  | 'fi'
  | 'sv'
  | 'vi'
  | 'tr'
  | 'el'
  | 'ru'
  | 'uk'
  | 'hi'
  | 'bn'
  | 'th'
  | 'ko'
  | 'zh-CN'
  | 'zh-TW';

export type Locale = {
  id: LocaleId;
  label: string;
};

/** Kraken-compatible language list (28 locales). */
export const LOCALES: Locale[] = [
  { id: 'ms', label: 'Bahasa Melayu' },
  { id: 'cs', label: 'Čeština' },
  { id: 'da', label: 'Dansk' },
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'es-419', label: 'Español (Latinoamérica)' },
  { id: 'fr', label: 'Français' },
  { id: 'it', label: 'Italiano' },
  { id: 'hu', label: 'Magyar' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'no', label: 'Norsk' },
  { id: 'pl', label: 'Polski' },
  { id: 'pt', label: 'Português' },
  { id: 'ro', label: 'Română' },
  { id: 'fi', label: 'Suomi' },
  { id: 'sv', label: 'Svenska' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'el', label: 'Ελληνικά' },
  { id: 'ru', label: 'Русский' },
  { id: 'uk', label: 'Українська' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'th', label: 'ภาษาไทย' },
  { id: 'ko', label: '한국어' },
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
];

export const DEFAULT_LOCALE: LocaleId = 'en';

export function isLocaleId(value: string): value is LocaleId {
  return LOCALES.some((l) => l.id === value);
}
