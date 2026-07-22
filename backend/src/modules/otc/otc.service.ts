import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdStatus, OtcStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { D, toDb } from '../../common/money';

const adQueueInclude = {
  user: { select: { id: true, username: true, displayName: true, telegram: true } },
  assignedOperator: { select: { id: true, username: true, displayName: true } },
  paymentMethods: { include: { paymentMethod: true } },
} satisfies Prisma.AdvertisementInclude;

const dealQueueInclude = {
  buyer: { select: { id: true, username: true, displayName: true } },
  seller: { select: { id: true, username: true, displayName: true } },
  assignedOperator: { select: { id: true, username: true, displayName: true } },
  advertisement: { select: { id: true, side: true, city: true, bankName: true } },
} satisfies Prisma.DealInclude;

export class SetOtcMarginDto {
  externalBuyPrice?: number;
  externalSellPrice?: number;
  externalOrderUrl?: string;
}

@Injectable()
export class OtcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async getQueue() {
    const [userAds, activeDeals] = await Promise.all([
      this.prisma.advertisement.findMany({
        where: {
          isPlatform: false,
          status: { in: [AdStatus.ACTIVE, AdStatus.PAUSED] },
        },
        include: adQueueInclude,
        orderBy: [{ otcStage: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
      this.prisma.deal.findMany({
        where: { status: { in: ['CREATED', 'PAID', 'DISPUTED'] } },
        include: dealQueueInclude,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { userAds, activeDeals };
  }

  async takeAd(adminId: string, adId: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: adId } });
    if (!ad) throw new NotFoundException('Заявка не найдена');
    if (ad.isPlatform) throw new BadRequestException('Платформенное объявление не берётся в OTC-очередь');
    if (ad.assignedOperatorId && ad.assignedOperatorId !== adminId) {
      throw new ForbiddenException('Заявка уже закреплена за другим оператором');
    }
    const updated = await this.prisma.advertisement.update({
      where: { id: adId },
      data: {
        assignedOperatorId: adminId,
        takenAt: ad.takenAt ?? new Date(),
        otcStage: ad.otcStage === OtcStage.NEW ? OtcStage.ORDER_FOUND : ad.otcStage,
      },
      include: adQueueInclude,
    });
    this.realtime.emitToAdmins('otc:updated', { type: 'ad', id: adId });
    return updated;
  }

  async setAdMargin(adminId: string, adId: string, dto: SetOtcMarginDto) {
    const ad = await this.requireAdOperator(adminId, adId);
    const buy = dto.externalBuyPrice != null ? D(dto.externalBuyPrice) : null;
    const sell = dto.externalSellPrice != null ? D(dto.externalSellPrice) : null;
    let profit: Prisma.Decimal | null = null;
    if (buy && sell) {
      profit = sell.minus(buy);
    } else if (ad.price && buy) {
      profit = D(ad.price).minus(buy);
    }
    return this.prisma.advertisement.update({
      where: { id: adId },
      data: {
        externalBuyPrice: buy != null ? toDb(buy) : undefined,
        externalSellPrice: sell != null ? toDb(sell) : undefined,
        externalOrderUrl: dto.externalOrderUrl,
        expectedProfit: profit != null ? toDb(profit) : undefined,
      },
      include: adQueueInclude,
    });
  }

  async setAdStage(adminId: string, adId: string, stage: OtcStage) {
    await this.requireAdOperator(adminId, adId);
    const updated = await this.prisma.advertisement.update({
      where: { id: adId },
      data: { otcStage: stage, status: stage === OtcStage.COMPLETED ? AdStatus.CLOSED : undefined },
      include: adQueueInclude,
    });
    this.realtime.emitToAdmins('otc:updated', { type: 'ad', id: adId });
    return updated;
  }

  async takeDeal(adminId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    if (deal.assignedOperatorId && deal.assignedOperatorId !== adminId) {
      throw new ForbiddenException('Сделка закреплена за другим оператором');
    }
    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        assignedOperatorId: adminId,
        takenAt: deal.takenAt ?? new Date(),
        otcStage: deal.otcStage === OtcStage.NEW ? OtcStage.ORDER_FOUND : deal.otcStage,
      },
      include: dealQueueInclude,
    });
    this.realtime.emitToAdmins('otc:updated', { type: 'deal', id: dealId });
    return updated;
  }

  async setDealMargin(adminId: string, dealId: string, dto: SetOtcMarginDto) {
    await this.requireDealOperator(adminId, dealId);
    const deal = await this.prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    const buy = dto.externalBuyPrice != null ? D(dto.externalBuyPrice) : null;
    const sell = dto.externalSellPrice != null ? D(dto.externalSellPrice) : null;
    let profit: Prisma.Decimal | null = null;
    if (buy && sell) {
      profit = D(sell).minus(buy);
    } else if (buy) {
      profit = D(deal.price).minus(buy);
    }
    return this.prisma.deal.update({
      where: { id: dealId },
      data: {
        externalBuyPrice: buy != null ? toDb(buy) : undefined,
        externalSellPrice: sell != null ? toDb(D(sell)) : undefined,
        externalOrderUrl: dto.externalOrderUrl,
        expectedProfit: profit != null ? toDb(profit) : undefined,
      },
      include: dealQueueInclude,
    });
  }

  async setDealStage(adminId: string, dealId: string, stage: OtcStage) {
    await this.requireDealOperator(adminId, dealId);
    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: { otcStage: stage },
      include: dealQueueInclude,
    });
    this.realtime.emitToAdmins('otc:updated', { type: 'deal', id: dealId });
    return updated;
  }

  private async requireAdOperator(adminId: string, adId: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: adId } });
    if (!ad) throw new NotFoundException('Заявка не найдена');
    if (ad.assignedOperatorId && ad.assignedOperatorId !== adminId) {
      throw new ForbiddenException('Заявка закреплена за другим оператором');
    }
    return ad;
  }

  private async requireDealOperator(adminId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    if (deal.assignedOperatorId && deal.assignedOperatorId !== adminId) {
      throw new ForbiddenException('Сделка закреплена за другим оператором');
    }
    return deal;
  }
}
