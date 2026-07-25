import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeService } from '../exchange/exchange.service';
import { D, roundFiat } from '../../common/money';
import { mockUsdtFiatRate } from '../../common/mock-fiat-rates';

interface CacheEntry {
  price: number;
  source: string;
  ts: number;
}

@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly exchange: ExchangeService,
  ) {}

  private key(asset: string, fiat: string) {
    return `${asset}/${fiat}`;
  }

  /** Current market price for asset in fiat, with caching + snapshot persistence. */
  async getMarketPrice(asset?: string, fiat?: string): Promise<{ price: number; source: string }> {
    const a = asset ?? this.config.get<string>('economics.baseAsset') ?? 'USDT';
    const f = fiat ?? this.config.get<string>('economics.baseFiat') ?? 'KZT';
    const key = this.key(a, f);

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return { price: cached.price, source: cached.source };
    }

    // 1) manual override stored in settings
    const manual = await this.prisma.systemSetting.findUnique({
      where: { key: `rate:${key}` },
    });
    if (manual) {
      const price = parseFloat(manual.value);
      this.cache.set(key, { price, source: 'manual', ts: Date.now() });
      return { price, source: 'manual' };
    }

    // 2) live exchange ticker
    try {
      const ticker = await this.exchange.getTicker(`${a}${f}`);
      if (ticker.price > 0) {
        this.cache.set(key, { price: ticker.price, source: ticker.source, ts: Date.now() });
        await this.snapshot(a, f, ticker.price, ticker.source);
        return { price: ticker.price, source: ticker.source };
      }
    } catch (e) {
      this.logger.warn(`Не удалось получить курс с биржи: ${(e as Error).message}`);
    }

    // 3) static fallback
    const staticPrice = mockUsdtFiatRate(`${a}${f}`, this.config.get<number>('rates.staticUsdtKzt') ?? 470);
    this.cache.set(key, { price: staticPrice, source: 'static', ts: Date.now() });
    return { price: staticPrice, source: 'static' };
  }

  private async snapshot(asset: string, fiat: string, price: number, source: string) {
    await this.prisma.rateSnapshot.create({
      data: { asset, fiat, price: price.toString(), source },
    });
  }

  async setManualRate(asset: string, fiat: string, price: number) {
    const key = `rate:${this.key(asset, fiat)}`;
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: String(price) },
      create: { key, value: String(price) },
    });
    this.cache.delete(this.key(asset, fiat));
    return { asset, fiat, price };
  }

  async clearManualRate(asset: string, fiat: string) {
    await this.prisma.systemSetting
      .delete({ where: { key: `rate:${this.key(asset, fiat)}` } })
      .catch(() => undefined);
    this.cache.delete(this.key(asset, fiat));
    return { success: true };
  }

  /**
   * Quote a side with spread applied.
   * side BUY  -> price a trader pays to buy asset (market * (1 + spread))
   * side SELL -> price a trader receives to sell asset (market * (1 - spread))
   */
  async quote(side: 'BUY' | 'SELL', asset?: string, fiat?: string, spreadOverride?: number) {
    const { price, source } = await this.getMarketPrice(asset, fiat);
    const spread = spreadOverride ?? this.config.get<number>('economics.defaultSpread') ?? 0.01;
    const factor = side === 'BUY' ? 1 + spread : 1 - spread;
    const quoted = roundFiat(D(price).times(factor));
    return {
      side,
      market: price,
      source,
      spread,
      price: quoted.toNumber(),
    };
  }

  async history(asset?: string, fiat?: string, limit = 100) {
    const a = asset ?? this.config.get<string>('economics.baseAsset') ?? 'USDT';
    const f = fiat ?? this.config.get<string>('economics.baseFiat') ?? 'KZT';
    return this.prisma.rateSnapshot.findMany({
      where: { asset: a, fiat: f },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
