import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { HedgeSide, HedgeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toDb, D } from '../../common/money';
import { EXCHANGE_ADAPTER, IExchangeAdapter } from './exchange-adapter.interface';
import { CreateHedgeDto } from './dto/hedge.dto';

@Injectable()
export class ExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_ADAPTER) private readonly adapter: IExchangeAdapter,
  ) {}

  get adapterName() {
    return this.adapter.name;
  }

  getTicker(symbol: string) {
    return this.adapter.getTicker(symbol);
  }

  /** Create a hedge order record (admin plans a real trade to cover a deal). */
  async createHedge(dto: CreateHedgeDto, adminId: string) {
    if (dto.dealId) {
      const deal = await this.prisma.deal.findUnique({ where: { id: dto.dealId } });
      if (!deal) throw new NotFoundException('Сделка не найдена');
    }
    return this.prisma.hedgeOrder.create({
      data: {
        dealId: dto.dealId,
        exchange: this.adapter.name,
        side: dto.side as HedgeSide,
        symbol: dto.symbol,
        qty: toDb(D(dto.qty)),
        price: dto.price != null ? toDb(D(dto.price)) : null,
        payoutRequisite: dto.payoutRequisite,
        note: dto.note,
        createdById: adminId,
        status: HedgeStatus.PENDING,
      },
    });
  }

  /** Submit a hedge order to the real exchange. */
  async submitHedge(id: string) {
    const hedge = await this.prisma.hedgeOrder.findUnique({ where: { id } });
    if (!hedge) throw new NotFoundException('Хедж-ордер не найден');

    try {
      const result = await this.adapter.placeOrder({
        symbol: hedge.symbol,
        side: hedge.side,
        qty: Number(hedge.qty),
        price: hedge.price ? Number(hedge.price) : undefined,
      });
      return this.prisma.hedgeOrder.update({
        where: { id },
        data: {
          externalOrderId: result.externalOrderId,
          status: result.status as HedgeStatus,
          filledQty: toDb(D(result.filledQty)),
          avgFillPrice: result.avgFillPrice != null ? toDb(D(result.avgFillPrice)) : null,
          rawResponse: result.raw as any,
        },
      });
    } catch (e) {
      return this.prisma.hedgeOrder.update({
        where: { id },
        data: { status: HedgeStatus.FAILED, note: (e as Error).message },
      });
    }
  }

  /** Refresh hedge status from the exchange. */
  async syncHedge(id: string) {
    const hedge = await this.prisma.hedgeOrder.findUnique({ where: { id } });
    if (!hedge) throw new NotFoundException('Хедж-ордер не найден');
    if (!hedge.externalOrderId) return hedge;
    const result = await this.adapter.getOrder(hedge.externalOrderId);
    return this.prisma.hedgeOrder.update({
      where: { id },
      data: {
        status: result.status as HedgeStatus,
        filledQty: toDb(D(result.filledQty)),
        avgFillPrice: result.avgFillPrice != null ? toDb(D(result.avgFillPrice)) : null,
        rawResponse: result.raw as any,
      },
    });
  }

  async cancelHedge(id: string) {
    const hedge = await this.prisma.hedgeOrder.findUnique({ where: { id } });
    if (!hedge) throw new NotFoundException('Хедж-ордер не найден');
    if (hedge.externalOrderId) {
      await this.adapter.cancelOrder(hedge.externalOrderId);
    }
    return this.prisma.hedgeOrder.update({
      where: { id },
      data: { status: HedgeStatus.CANCELLED },
    });
  }

  list(dealId?: string) {
    return this.prisma.hedgeOrder.findMany({
      where: dealId ? { dealId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
