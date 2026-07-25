import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpotOrderSide, SpotOrderStatus, SpotOrderType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { D, round, roundFiat } from '../../common/money';
import { houseBidAsk, parsePositiveDecimal, resolvePair } from '../../common/trading-pairs';
import { PlaceSpotOrderDto } from './dto/spot.dto';

@Injectable()
export class SpotOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private spread() {
    return this.config.get<number>('economics.defaultSpread') ?? 0.01;
  }

  private minNotional() {
    return D(this.config.get<number>('spot.minNotionalUsdt') ?? 10);
  }

  async place(userId: string, dto: PlaceSpotOrderDto) {
    if (!this.config.get<boolean>('spot.enabled')) {
      throw new BadRequestException('Spot trading is disabled');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account not active');
    }

    const existing = await this.prisma.spotOrder.findUnique({
      where: { userId_clientOrderId: { userId, clientOrderId: dto.clientOrderId } },
      include: { trades: true },
    });
    if (existing) return existing;

    const pair = resolvePair(dto.symbol);
    const qty = round(parsePositiveDecimal(dto.quantity, 'quantity'), 8);
    const side = dto.side as SpotOrderSide;
    const type = dto.type as SpotOrderType;
    const { bid, ask } = houseBidAsk(pair.base, this.spread());
    const econ = await this.users.getEffectiveEconomics(userId);
    const feeRate = D(econ.takerFee);

    let limitPrice = type === SpotOrderType.LIMIT
      ? roundFiat(parsePositiveDecimal(dto.price!, 'price'))
      : null;

    let fillPrice = side === SpotOrderSide.BUY ? D(ask) : D(bid);
    if (type === SpotOrderType.LIMIT && limitPrice) {
      if (side === SpotOrderSide.BUY && limitPrice.lt(fillPrice)) {
        fillPrice = limitPrice; // will rest if below ask — handled below
      }
      if (side === SpotOrderSide.SELL && limitPrice.gt(fillPrice)) {
        fillPrice = limitPrice;
      }
    }

    const canFillNow =
      type === SpotOrderType.MARKET ||
      (side === SpotOrderSide.BUY && limitPrice!.gte(D(ask))) ||
      (side === SpotOrderSide.SELL && limitPrice!.lte(D(bid)));

    const execPrice = type === SpotOrderType.MARKET
      ? fillPrice
      : canFillNow
        ? side === SpotOrderSide.BUY ? D(ask) : D(bid)
        : null;

    const quoteAmount = execPrice ? roundFiat(D(qty).times(execPrice)) : D(0);
    if (execPrice && quoteAmount.lt(this.minNotional())) {
      throw new BadRequestException(`Minimum order size is ${this.minNotional()} ${pair.quote}`);
    }

    let lockCurrency: string;
    let lockAmount = D(0);
    if (side === SpotOrderSide.BUY) {
      lockCurrency = pair.quote;
      const priceForLock = type === SpotOrderType.LIMIT && limitPrice ? limitPrice : D(ask);
      lockAmount = roundFiat(D(qty).times(priceForLock).times(D(1).plus(feeRate)));
    } else {
      lockCurrency = pair.base;
      lockAmount = qty;
    }

    return this.prisma.$transaction(async (tx) => {
      await this.wallets.lockSpot(userId, lockCurrency, lockAmount, { refType: 'spot_order', refId: dto.clientOrderId }, tx);

      const order = await tx.spotOrder.create({
        data: {
          userId,
          symbol: pair.symbol,
          base: pair.base,
          quote: pair.quote,
          side,
          type,
          status: SpotOrderStatus.OPEN,
          price: limitPrice?.toString() ?? null,
          quantity: qty.toString(),
          lockCurrency,
          lockAmount: lockAmount.toString(),
          lockedRemaining: lockAmount.toString(),
          clientOrderId: dto.clientOrderId,
        },
      });

      if (!canFillNow || !execPrice) {
        return order;
      }

      const fee = roundFiat(quoteAmount.times(feeRate));
      const trade = await tx.spotTrade.create({
        data: {
          orderId: order.id,
          userId,
          symbol: pair.symbol,
          side,
          price: execPrice.toString(),
          quantity: qty.toString(),
          quoteAmount: quoteAmount.toString(),
          feeAmount: fee.toString(),
          feeCurrency: pair.quote,
        },
      });

      const ledgerTx = await this.wallets.settleSpotFill(
        {
          userId,
          base: pair.base,
          quote: pair.quote,
          side: dto.side,
          quantity: qty,
          quoteAmount,
          feeAmount: fee,
          refId: trade.id,
        },
        tx,
      );

      await tx.spotTrade.update({ where: { id: trade.id }, data: { ledgerTxId: ledgerTx.id } });

      const unlockRemainder = lockAmount.minus(
        side === SpotOrderSide.BUY ? quoteAmount.plus(fee) : qty,
      );
      if (unlockRemainder.gt(0)) {
        await this.wallets.unlockSpot(userId, lockCurrency, unlockRemainder, { refType: 'spot_order', refId: order.id }, tx);
      }

      const filled = await tx.spotOrder.update({
        where: { id: order.id },
        data: {
          status: SpotOrderStatus.FILLED,
          filledQty: qty.toString(),
          lockedRemaining: '0',
          avgFillPrice: execPrice.toString(),
          feeAmount: fee.toString(),
          feeCurrency: pair.quote,
          filledAt: new Date(),
        },
        include: { trades: true },
      });

      await this.notifications.push(userId, 'SPOT_TRADE', 'Spot order filled', `${side} ${qty} ${pair.base}`, { orderId: order.id });

      return filled;
    });
  }

  async cancel(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.spotOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.userId !== userId) throw new ForbiddenException('Not your order');
      if (order.status !== SpotOrderStatus.OPEN) {
        throw new BadRequestException('Order cannot be cancelled');
      }

      const updated = await tx.spotOrder.updateMany({
        where: { id: orderId, status: SpotOrderStatus.OPEN },
        data: { status: SpotOrderStatus.CANCELLED, cancelledAt: new Date(), lockedRemaining: '0' },
      });
      if (updated.count === 0) throw new BadRequestException('Order already processed');

      const remain = D(order.lockedRemaining);
      if (remain.gt(0)) {
        await this.wallets.unlockSpot(userId, order.lockCurrency, remain, { refType: 'spot_order', refId: orderId }, tx);
      }

      return tx.spotOrder.findUnique({ where: { id: orderId }, include: { trades: true } });
    });
  }

  list(userId: string, limit = 50) {
    return this.prisma.spotOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { trades: true },
    });
  }

  listTrades(userId: string, limit = 50) {
    return this.prisma.spotTrade.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
