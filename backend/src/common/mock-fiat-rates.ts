/** Static USDT/fiat rates — mid-2026 approximate market levels. */
export const MOCK_USDT_FIAT_RATES: Record<string, number> = {
  USDTKZT: 512,
  USDTRUB: 87.5,
  USDTEUR: 0.922,
  USDTUAH: 41.2,
  USDTBYN: 3.28,
  USDTUZS: 12850,
  USDTKGS: 87.5,
  USDTTJS: 10.95,
  USDTAMD: 388,
  USDTAZN: 1.7,
  USDTMDL: 17.6,
  USDTGEL: 2.72,
  USDTPLN: 3.92,
  USDTCZK: 23.2,
  USDTRON: 4.52,
  USDTHUF: 358,
  USDTSEK: 10.35,
  USDTNOK: 10.55,
  USDTDKK: 6.88,
  USDTBGN: 1.8,
  USDTCHF: 0.875,
  USDTVND: 25500,
  USDTTRY: 39.5,
  USDTAED: 3.673,
  USDTGBP: 0.785,
  USDTCNY: 7.25,
};

export function mockUsdtFiatRate(symbol: string, fallbackKzt = 512): number {
  const key = symbol.toUpperCase().replace('/', '');
  return MOCK_USDT_FIAT_RATES[key] ?? fallbackKzt;
}
