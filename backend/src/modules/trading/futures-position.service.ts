import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FuturesPositionSide, FuturesPositionStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { D, round, roundFiat } from '../../common/money';
import { houseBidAsk, parsePositiveDecimal, resolvePair } from '../../common/trading-pairs';
import { OpenFuturesPositionDto } from './dto/futures.dto';

@Injectable()
export class FuturesPositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private spread() {
    return this.config.get<number>('economics.defaultSpread') ?? 0.01;
  }

  private minMargin() {
    return D(this.config.get<number>('futures.minMarginUsdt') ?? 10);
  }

  private maxLeverage() {
    return this.config.get<number>('futures.maxLeverage') ?? 20;
  }

  private maintenanceMarginRate() {
    return D(this.config.get<number>('futures.maintenanceMarginRate') ?? 0.005);
  }

  private markPrice(base: string, side: FuturesPositionSide) {
    const { bid, ask, mid } = houseBidAsk(base, this.spread());
    const price = side === FuturesPositionSide.LONG ? D(ask) : D(bid);
    return { mark: price, mid: D(mid) };
  }

  private liquidationPrice(entry: ReturnType<typeof D>, leverage: number, side: FuturesPositionSide) {
    const lev = D(leverage);
    const mm = this.maintenanceMarginRate();
    if (side === FuturesPositionSide.LONG) {
      return roundFiat(entry.times(D(1).minus(D(1).div(lev)).plus(mm)));
    }
    return roundFiat(entry.times(D(1).plus(D(1).div(lev)).minus(mm)));
  }

  private unrealizedPnl(
    side: FuturesPositionSide,
    entry: ReturnType<typeof D>,
    mark: ReturnType<typeof D>,
    qty: ReturnType<typeof D>,
  ) {
    const diff = side === FuturesPositionSide.LONG ? mark.minus(entry) : entry.minus(mark);
    return roundFiat(diff.times(qty));
  }

  private serialize(pos: {
    id: string;
    symbol: string;
    base: string;
    quote: string;
    side: FuturesPositionSide;
    leverage: number;
    entryPrice: { toString(): string };
    quantity: { toString(): string };
    margin: { toString(): string };
    liquidationPrice: { toString(): string };
    status: FuturesPositionStatus;
    closePrice: { toString(): string } | null;
    realizedPnl: { toString(): string };
    createdAt: Date;
    closedAt: Date | null;
  }) {
    const entry = D(pos.entryPrice.toString());
    const qty = D(pos.quantity.toString());
    const { mark } = this.markPrice(pos.base, pos.side);
    const unrealizedPnl =
      pos.status === FuturesPositionStatus.OPEN
        ? this.unrealizedPnl(pos.side, entry, mark, qty)
        : D(0);

    return {
      ...pos,
      entryPrice: entry.toNumber(),
      quantity: qty.toNumber(),
      margin: D(pos.margin.toString()).toNumber(),
      liquidationPrice: D(pos.liquidationPrice.toString()).toNumber(),
      closePrice: pos.closePrice ? D(pos.closePrice.toString()).toNumber() : null,
      realizedPnl: D(pos.realizedPnl.toString()).toNumber(),
      markPrice: mark.toNumber(),
      unrealizedPnl: unrealizedPnl.toNumber(),
    };
  }

  async open(userId: string, dto: OpenFuturesPositionDto) {
    if (!this.config.get<boolean>('futures.enabled')) {
      throw new BadRequestException('Futures trading is disabled');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account not active');
    }

    const existing = await this.prisma.futuresPosition.findUnique({
      where: { userId_clientOrderId: { userId, clientOrderId: dto.clientOrderId } },
    });
    if (existing) return this.serialize(existing);

    const pair = resolvePair(dto.symbol, 'futures');
    const qty = round(parsePositiveDecimal(dto.quantity, 'quantity'), 8);
    const leverage = Math.min(Math.max(1, dto.leverage), this.maxLeverage());
    const side = dto.side as FuturesPositionSide;
    const { mark } = this.markPrice(pair.base, side);
    const notional = roundFiat(qty.times(mark));
    const margin = roundFiat(notional.div(leverage));

    if (margin.lt(this.minMargin())) {
      throw new BadRequestException(`Minimum margin is ${this.minMargin()} ${pair.quote}`);
    }

    const liqPrice = this.liquidationPrice(mark, leverage, side);

    return this.prisma.$transaction(async (tx) => {
      await this.wallets.lockFuturesMargin(
        userId,
        pair.quote,
        margin,
        { refType: 'futures_position', refId: dto.clientOrderId },
        tx,
      );

      const position = await tx.futuresPosition.create({
        data: {
          userId,
          symbol: pair.symbol,
          base: pair.base,
          quote: pair.quote,
          side,
          leverage,
          entryPrice: mark.toString(),
          quantity: qty.toString(),
          margin: margin.toString(),
          liquidationPrice: liqPrice.toString(),
          clientOrderId: dto.clientOrderId,
        },
      });

      await this.notifications.push(
        userId,
        'FUTURES_POSITION',
        'Futures position opened',
        `${side} ${qty} ${pair.base} @ ${leverage}x`,
        { positionId: position.id },
      );

      return this.serialize(position);
    });
  }

  async close(userId: string, positionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.futuresPosition.findUnique({ where: { id: positionId } });
      if (!position) throw new NotFoundException('Position not found');
      if (position.userId !== userId) throw new ForbiddenException('Not your position');
      if (position.status !== FuturesPositionStatus.OPEN) {
        throw new BadRequestException('Position already closed');
      }

      const { mark } = this.markPrice(position.base, position.side);
      const entry = D(position.entryPrice);
      const qty = D(position.quantity);
      const margin = D(position.margin);
      const pnl = this.unrealizedPnl(position.side, entry, mark, qty);

      await this.wallets.settleFuturesClose(
        {
          userId,
          currency: position.quote,
          margin,
          pnl,
          refId: position.id,
        },
        tx,
      );

      const closed = await tx.futuresPosition.update({
        where: { id: positionId },
        data: {
          status: FuturesPositionStatus.CLOSED,
          closePrice: mark.toString(),
          realizedPnl: pnl.toString(),
          closedAt: new Date(),
        },
      });

      await this.notifications.push(
        userId,
        'FUTURES_POSITION',
        'Futures position closed',
        `PnL ${pnl.toString()} ${position.quote}`,
        { positionId },
      );

      return this.serialize(closed);
    });
  }

  list(userId: string, symbol?: string, openOnly = true) {
    return this.prisma.futuresPosition
      .findMany({
        where: {
          userId,
          ...(symbol ? { symbol: symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') } : {}),
          ...(openOnly ? { status: FuturesPositionStatus.OPEN } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .then((rows) => rows.map((p) => this.serialize(p)));
  }
}
