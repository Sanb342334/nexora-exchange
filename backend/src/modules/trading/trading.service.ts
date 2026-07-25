import { BadRequestException, Injectable } from '@nestjs/common';
import { RatesService } from '../rates/rates.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  houseBidAsk,
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
  ) {}

  listPairs(type?: 'spot' | 'futures') {
    const source = type === 'futures' ? FUTURES_PAIRS : SPOT_PAIRS;
    return source.map((p) => ({
      ...p,
      lastPrice: REFERENCE_PRICES[p.base] ?? 0,
      change24h: (Math.random() * 6 - 2).toFixed(2),
    }));
  }

  resolvePair(symbol: string): TradingPair {
    return resolvePair(symbol);
  }

  async orderBook(symbol: string, depth = 15) {
    const pair = resolvePair(symbol);
    const { mid, bid, ask } = houseBidAsk(pair.base, 0.001);
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
