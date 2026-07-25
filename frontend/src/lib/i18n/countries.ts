/** Countries for registration — excludes US, UK, and high-risk jurisdictions. */

export const ALLOWED_COUNTRY_CODES = [
  'KZ', 'RU', 'UA', 'BY', 'UZ', 'KG', 'TJ', 'AM', 'AZ', 'MD', 'GE',
  'NL', 'DE', 'FR', 'IT', 'ES', 'PL', 'CZ', 'RO', 'HU', 'AT', 'BE',
  'PT', 'SE', 'NO', 'DK', 'FI', 'GR', 'BG', 'SK', 'LT', 'LV', 'EE',
  'IE', 'CH', 'VN', 'TR', 'AE',
] as const;

export type CountryCode = (typeof ALLOWED_COUNTRY_CODES)[number];

export const COUNTRY_FIAT_MAP: Record<CountryCode, { defaultFiat: string; fiats: string[] }> = {
  KZ: { defaultFiat: 'KZT', fiats: ['KZT'] },
  RU: { defaultFiat: 'RUB', fiats: ['RUB'] },
  UA: { defaultFiat: 'UAH', fiats: ['UAH', 'EUR'] },
  BY: { defaultFiat: 'BYN', fiats: ['BYN'] },
  UZ: { defaultFiat: 'UZS', fiats: ['UZS'] },
  KG: { defaultFiat: 'KGS', fiats: ['KGS'] },
  TJ: { defaultFiat: 'TJS', fiats: ['TJS'] },
  AM: { defaultFiat: 'AMD', fiats: ['AMD'] },
  AZ: { defaultFiat: 'AZN', fiats: ['AZN'] },
  MD: { defaultFiat: 'MDL', fiats: ['MDL', 'EUR'] },
  GE: { defaultFiat: 'GEL', fiats: ['GEL', 'EUR'] },
  NL: { defaultFiat: 'EUR', fiats: ['EUR'] },
  DE: { defaultFiat: 'EUR', fiats: ['EUR'] },
  FR: { defaultFiat: 'EUR', fiats: ['EUR'] },
  IT: { defaultFiat: 'EUR', fiats: ['EUR'] },
  ES: { defaultFiat: 'EUR', fiats: ['EUR'] },
  PL: { defaultFiat: 'PLN', fiats: ['PLN', 'EUR'] },
  CZ: { defaultFiat: 'CZK', fiats: ['CZK', 'EUR'] },
  RO: { defaultFiat: 'RON', fiats: ['RON', 'EUR'] },
  HU: { defaultFiat: 'HUF', fiats: ['HUF', 'EUR'] },
  AT: { defaultFiat: 'EUR', fiats: ['EUR'] },
  BE: { defaultFiat: 'EUR', fiats: ['EUR'] },
  PT: { defaultFiat: 'EUR', fiats: ['EUR'] },
  SE: { defaultFiat: 'SEK', fiats: ['SEK', 'EUR'] },
  NO: { defaultFiat: 'NOK', fiats: ['NOK', 'EUR'] },
  DK: { defaultFiat: 'DKK', fiats: ['DKK', 'EUR'] },
  FI: { defaultFiat: 'EUR', fiats: ['EUR'] },
  GR: { defaultFiat: 'EUR', fiats: ['EUR'] },
  BG: { defaultFiat: 'BGN', fiats: ['BGN', 'EUR'] },
  SK: { defaultFiat: 'EUR', fiats: ['EUR'] },
  LT: { defaultFiat: 'EUR', fiats: ['EUR'] },
  LV: { defaultFiat: 'EUR', fiats: ['EUR'] },
  EE: { defaultFiat: 'EUR', fiats: ['EUR'] },
  IE: { defaultFiat: 'EUR', fiats: ['EUR'] },
  CH: { defaultFiat: 'CHF', fiats: ['CHF', 'EUR'] },
  VN: { defaultFiat: 'VND', fiats: ['VND'] },
  TR: { defaultFiat: 'TRY', fiats: ['TRY', 'EUR'] },
  AE: { defaultFiat: 'AED', fiats: ['AED', 'EUR'] },
};

export type CountryConfig = {
  code: CountryCode;
  defaultFiat: string;
  fiats: string[];
};

export const COUNTRIES: CountryConfig[] = ALLOWED_COUNTRY_CODES.map((code) => ({
  code,
  defaultFiat: COUNTRY_FIAT_MAP[code].defaultFiat,
  fiats: COUNTRY_FIAT_MAP[code].fiats,
}));

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function isAllowedCountry(code: string): code is CountryCode {
  return ALLOWED_COUNTRY_CODES.includes(code as CountryCode);
}

export function isFiatAllowedForCountry(countryCode: string, fiat: string): boolean {
  if (!isAllowedCountry(countryCode)) return false;
  return COUNTRY_FIAT_MAP[countryCode].fiats.includes(fiat);
}

export function localeToIntl(locale: string): string {
  const map: Record<string, string> = {
    en: 'en-US', ru: 'ru-RU', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
    'es-419': 'es-MX', it: 'it-IT', pl: 'pl-PL', nl: 'nl-NL', cs: 'cs-CZ', da: 'da-DK',
    no: 'nb-NO', sv: 'sv-SE', fi: 'fi-FI', hu: 'hu-HU', ro: 'ro-RO', tr: 'tr-TR',
    el: 'el-GR', vi: 'vi-VN', ms: 'ms-MY', hi: 'hi-IN', bn: 'bn-BD', th: 'th-TH',
    ko: 'ko-KR', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
  };
  return map[locale] ?? 'en-US';
}

export function countryLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([localeToIntl(locale)], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function fiatLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([localeToIntl(locale)], { type: 'currency' }).of(code);
    return name ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}
