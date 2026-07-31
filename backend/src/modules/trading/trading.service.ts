import { Injectable } from '@nestjs/common';
import { RatesService } from '../rates/rates.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BinaryPriceService } from '../binary/binary-price.service';
import {
  REFERENCE_PRICES,
  resolvePair,
  FUTURES_PAIRS,
  SPOT_PAIRS,
  type TradingPair,
} from '../../common/trading-pairs';

@Injectable()
export class TradingService {
  constructor(
    private readonly rates: RatesService,
    private readonly prisma: PrismaService,
    private readonly prices: BinaryPriceService,
  ) {}

  private livePrice(base: string, quote = 'USDT') {
    const id = `${base}${quote}`.toUpperCase();
    const live = this.prices.get(id);
    if (live && live > 0) return live;
    return REFERENCE_PRICES[base] ?? 0;
  }

  listPairs(type?: 'spot' | 'futures') {
    const source = type === 'futures' ? FUTURES_PAIRS : SPOT_PAIRS;
    return source.map((p) => {
      const lastPrice = this.livePrice(p.base, p.quote);
      const hist = this.prices.history(p.symbol);
      const first = hist[0]?.c ?? lastPrice;
      const change = first > 0 ? ((lastPrice - first) / first) * 100 : 0;
      return {
        ...p,
        lastPrice,
        change24h: change.toFixed(2),
      };
    });
  }

  resolvePair(symbol: string): TradingPair {
    return resolvePair(symbol);
  }

  async orderBook(symbol: string, depth = 15) {
    const pair = resolvePair(symbol);
    const mid = this.livePrice(pair.base, pair.quote);
    const half = 0.001 / 2;
    const bid = mid * (1 - half);
    const ask = mid * (1 + half);
    const spread = mid * 0.0002;
    const bids: { price: number; amount: number }[] = [];
    const asks: { price: number; amount: number }[] = [];
    for (let i = 0; i < depth; i++) {
      bids.push({ price: +(bid - spread * (i + 1)).toFixed(8), amount: +(Math.random() * 2 + 0.01).toFixed(6) });
      asks.push({ price: +(ask + spread * (i + 1)).toFixed(8), amount: +(Math.random() * 2 + 0.01).toFixed(6) });
    }
    return { symbol: pair.symbol, base: pair.base, quote: pair.quote, bids, asks, lastPrice: mid, bid, ask };
  }

  async recentTrades(symbol: string, limit = 20) {
    const pair = resolvePair(symbol);
    return this.prisma.spotTrade.findMany({
      where: { symbol: pair.symbol },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async fiatRate(fiat: string) {
    return this.rates.getMarketPrice('USDT', fiat);
  }
}
