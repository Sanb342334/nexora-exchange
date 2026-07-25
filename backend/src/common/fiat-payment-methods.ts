/** Curated P2P payment methods per fiat (sourced from major exchange P2P listings). */
export const FIAT_PAYMENT_CATALOG: Record<string, readonly string[]> = {
  KZT: ['Kaspi Bank', 'Halyk Bank', 'Jusan Bank', 'ForteBank', 'Bank CenterCredit', 'Visa/Mastercard'],
  RUB: ['Sberbank', 'Tinkoff', 'SBP', 'Raiffeisen', 'Alfa-Bank', 'VTB', 'YooMoney'],
  UAH: ['Monobank', 'PrivatBank', 'PUMBBank', 'ABank', 'Visa/Mastercard'],
  BYN: ['Belarusbank', 'Priorbank', 'Alfa-Bank BY', 'Visa/Mastercard'],
  UZS: ['Humo', 'Uzcard', 'Kapitalbank', 'Visa/Mastercard'],
  KGS: ['Optima Bank', 'Demir Bank', 'MBank', 'Visa/Mastercard'],
  TJS: ['Amonatbank', 'Eskhata Bank', 'Visa/Mastercard'],
  AMD: ['Ameriabank', 'Inecobank', 'Idram', 'Visa/Mastercard'],
  AZN: ['Kapital Bank', 'ABB', 'Visa/Mastercard'],
  MDL: ['MAIB', 'MICB', 'Visa/Mastercard'],
  GEL: ['Bank of Georgia', 'TBC Bank', 'Visa/Mastercard'],
  EUR: ['SEPA', 'Revolut', 'PayPal', 'Wise', 'Bank transfer', 'Visa/Mastercard'],
  PLN: ['BLIK', 'PKO Bank', 'mBank', 'Revolut', 'Visa/Mastercard'],
  CZK: ['ČSOB', 'Komerční banka', 'Revolut', 'Visa/Mastercard'],
  RON: ['BCR', 'BRD', 'Revolut', 'Visa/Mastercard'],
  HUF: ['OTP Bank', 'Revolut', 'Visa/Mastercard'],
  SEK: ['Swish', 'SEB', 'Revolut', 'Visa/Mastercard'],
  NOK: ['VIPPS', 'DNB', 'Revolut', 'Visa/Mastercard'],
  DKK: ['MobilePay', 'Danske Bank', 'Revolut', 'Visa/Mastercard'],
  BGN: ['DSK Bank', 'Revolut', 'Visa/Mastercard'],
  CHF: ['TWINT', 'UBS', 'Revolut', 'Visa/Mastercard'],
  VND: ['MoMo', 'ZaloPay', 'Vietcombank', 'Techcombank', 'Visa/Mastercard'],
  TRY: ['Ziraat Bank', 'Garanti BBVA', 'Papara', 'Visa/Mastercard'],
  AED: ['Emirates NBD', 'ADCB', 'Visa/Mastercard', 'Bank transfer'],
};

export const ALL_FIATS = Object.keys(FIAT_PAYMENT_CATALOG);

export function getPaymentMethodsForFiat(fiat: string): string[] {
  const key = fiat.toUpperCase();
  return [...(FIAT_PAYMENT_CATALOG[key] ?? ['Bank transfer', 'Visa/Mastercard'])];
}
