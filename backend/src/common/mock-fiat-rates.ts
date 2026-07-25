/** Static mock USDT/fiat rates for local development (approximate market levels). */
export const MOCK_USDT_FIAT_RATES: Record<string, number> = {
  USDTKZT: 470,
  USDTRUB: 95,
  USDTEUR: 0.92,
  USDTUAH: 41,
  USDTBYN: 3.25,
  USDTUZS: 12600,
  USDTKGS: 87,
  USDTTJS: 10.9,
  USDTAMD: 385,
  USDTAZN: 1.7,
  USDTMDL: 17.5,
  USDTGEL: 2.7,
  USDTPLN: 3.95,
  USDTCZK: 23.5,
  USDTRON: 4.55,
  USDTHUF: 365,
  USDTSEK: 10.5,
  USDTNOK: 10.8,
  USDTDKK: 6.9,
  USDTBGN: 1.8,
  USDTCHF: 0.88,
  USDTVND: 25400,
  USDTTRY: 34,
  USDTAED: 3.67,
};

export function mockUsdtFiatRate(symbol: string, fallbackKzt = 470): number {
  const key = symbol.toUpperCase().replace('/', '');
  return MOCK_USDT_FIAT_RATES[key] ?? fallbackKzt;
}
