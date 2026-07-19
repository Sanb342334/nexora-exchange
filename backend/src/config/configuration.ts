export interface AppConfig {
  env: string;
  port: number;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  redisUrl: string;
  economics: {
    baseAsset: string;
    baseFiat: string;
    defaultTakerFee: number;
    defaultMakerFee: number;
    defaultSpread: number;
    dealPaymentWindowMin: number;
  };
  rates: {
    staticUsdtRub: number;
  };
  exchange: {
    adapter: 'mock' | 'bybit';
    bybitApiKey: string;
    bybitApiSecret: string;
    bybitTestnet: boolean;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  economics: {
    baseAsset: process.env.BASE_ASSET ?? 'USDT',
    baseFiat: process.env.BASE_FIAT ?? 'RUB',
    defaultTakerFee: parseFloat(process.env.DEFAULT_TAKER_FEE ?? '0.005'),
    defaultMakerFee: parseFloat(process.env.DEFAULT_MAKER_FEE ?? '0'),
    defaultSpread: parseFloat(process.env.DEFAULT_SPREAD ?? '0.01'),
    dealPaymentWindowMin: parseInt(process.env.DEAL_PAYMENT_WINDOW_MIN ?? '15', 10),
  },
  rates: {
    staticUsdtRub: parseFloat(process.env.RATE_STATIC_USDT_RUB ?? '95'),
  },
  exchange: {
    adapter: (process.env.EXCHANGE_ADAPTER as 'mock' | 'bybit') ?? 'mock',
    bybitApiKey: process.env.BYBIT_API_KEY ?? '',
    bybitApiSecret: process.env.BYBIT_API_SECRET ?? '',
    bybitTestnet: (process.env.BYBIT_TESTNET ?? 'true') === 'true',
  },
});
