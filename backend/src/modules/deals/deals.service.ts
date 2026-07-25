import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AdSide, DealStatus, DisputeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { RatesService } from '../rates/rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PlatformService } from '../platform/platform.service';
import { D, roundFiat, round, toDb } from '../../common/money';
import { CreateDealDto } from './dto/deal.dto';

const dealInclude = {
  buyer: {
    select: {
      id: true,
      username: true,
      displayName: true,
      isPersona: true,
      personaRating: true,
      personaDealsCount: true,
    },
  },
  seller: {
    select: {
      id: true,
      username: true,
      displayName: true,
      isPersona: true,
      personaRating: true,
      personaDealsCount: true,
    },
  },
  paymentMethod: true,
  advertisement: { select: { id: true, side: true, isPlatform: true } },
  dispute: true,
} satisfies Prisma.DealInclude;

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wallets: WalletsService,
    private readonly users: UsersService,
    private readonly rates: RatesService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly platform: PlatformService,
  ) {}

  private genCode(): string {
    return 'D' + randomBytes(4).toString('hex').toUpperCase();
  }

  private async effectiveAdPrice(ad: {
    isFloating: boolean;
    price: Prisma.Decimal | null;
    floatingMargin: Prisma.Decimal | null;
    asset: string;
    fiat: string;
  }): Promise<number> {
    if (!ad.isFloating) return ad.price ? Number(ad.price) : 0;
    const { price } = await this.rates.getMarketPrice(ad.asset, ad.fiat);
    const margin = ad.floatingMargin ? Number(ad.floatingMargin) : 0;
    return D(price)
      .times(1 + margin)
      .toNumber();
  }

  async createFromAd(takerId: string, dto: CreateDealDto) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: dto.advertisementId },
      include: { paymentMethods: true, user: { select: { isPersona: true, isSystem: true } } },
    });
    if (!ad) throw new NotFoundException('Объявление не найдено');
    if (ad.status !== 'ACTIVE') throw new BadRequestException('Объявление неактивно');
    if (ad.userId === takerId) throw new BadRequestException('Нельзя торговать по своему объявлению');

    const fiatAmount = roundFiat(dto.fiatAmount);
    if (fiatAmount.lt(D(ad.minFiat)) || fiatAmount.gt(D(ad.maxFiat))) {
      throw new BadRequestException(
        `Сумма вне лимитов объявления (${ad.minFiat}–${ad.maxFiat} ${ad.fiat})`,
      );
    }
    if (fiatAmount.gt(D(ad.availableAmount))) {
      throw new BadRequestException('Недостаточный доступный объём в объявлении');
    }

    // Determine roles. Advertiser side SELL => advertiser sells crypto (seller).
    const advertiserIsSeller = ad.side === AdSide.SELL;
    const sellerId = advertiserIsSeller ? ad.userId : takerId;
    const buyerId = advertiserIsSeller ? takerId : ad.userId;
    const takerIsSeller = sellerId === takerId;

    // Payment method: the seller always receives fiat and provides requisites.
    let paymentMethodId: string | undefined;
    if (advertiserIsSeller) {
      // requisites come from the ad; taker may choose which one
      const allowed = ad.paymentMethods.map((p) => p.paymentMethodId);
      paymentMethodId = dto.paymentMethodId ?? allowed[0];
      if (!paymentMethodId || !allowed.includes(paymentMethodId)) {
        throw new BadRequestException('Некорректный реквизит для оплаты');
      }
    } else {
      // taker is the seller and must supply their own payment method
      if (!dto.paymentMethodId) {
        throw new BadRequestException('Укажите реквизит для получения оплаты');
      }
      const pm = await this.prisma.paymentMethod.findFirst({
        where: { id: dto.paymentMethodId, userId: takerId, isActive: true },
      });
      if (!pm) throw new BadRequestException('Реквизит не найден');
      paymentMethodId = pm.id;
    }

    const price = await this.effectiveAdPrice(ad);
    if (price <= 0) throw new BadRequestException('Некорректная цена объявления');

    const assetAmount = round(fiatAmount.div(price), 10);

    // Fee is charged to the taker and deducted from the crypto delivered to the buyer.
    const econ = await this.users.getEffectiveEconomics(takerId);
    const feeAmount = round(assetAmount.times(econ.takerFee), 10);
    const netAmount = assetAmount.minus(feeAmount);

    // Enforce max open deals for the taker.
    const openCount = await this.prisma.deal.count({
      where: {
        status: { in: [DealStatus.CREATED, DealStatus.PAID, DealStatus.DISPUTED] },
        OR: [{ buyerId: takerId }, { sellerId: takerId }],
      },
    });
    const takerUser = await this.prisma.user.findUnique({ where: { id: takerId } });
    if (takerUser && openCount >= takerUser.maxOpenDeals) {
      throw new BadRequestException('Достигнут лимит одновременных сделок');
    }

    const windowMin = ad.paymentWindowMin;
    const buyerAlias = this.platform.generateAlias();
    const sellerAlias = this.platform.generateAlias();

    const deal = await this.prisma.$transaction(async (tx) => {
      // Lock the seller's crypto into escrow.
      await this.wallets.lock(sellerId, ad.asset, assetAmount, { refType: 'deal' }, tx);

      // Reduce the ad's available volume.
      await tx.advertisement.update({
        where: { id: ad.id },
        data: { availableAmount: toDb(D(ad.availableAmount).minus(fiatAmount)) },
      });

      return tx.deal.create({
        data: {
          code: this.genCode(),
          status: DealStatus.CREATED,
          advertisementId: ad.id,
          buyerId,
          sellerId,
          asset: ad.asset,
          fiat: ad.fiat,
          price: toDb(D(price)),
          assetAmount: toDb(assetAmount),
          fiatAmount: toDb(fiatAmount),
          feeAmount: toDb(feeAmount),
          netAmount: toDb(netAmount),
          paymentMethodId,
          paymentDeadline: new Date(Date.now() + windowMin * 60_000),
          buyerAlias,
          sellerAlias,
        },
        include: dealInclude,
      });
    });

    await this.systemMessage(deal.id, `Сделка ${deal.code} создана. Крипта заблокирована в эскроу.`);
    await this.notifyBoth(deal.buyerId, deal.sellerId, 'DEAL', 'Новая сделка', `Сделка ${deal.code} создана`);
    if (ad.isPlatform || ad.user.isPersona) {
      await this.platform.notifyAdmins(
        'Платформенная сделка',
        `Новая сделка ${deal.code} — требуется сопровождение оператора`,
      );
      this.realtime.emitToAdmins('platform:deal', { dealId: deal.id, code: deal.code });
    } else {
      await this.platform.notifyAdmins(
        'Новая OTC-сделка',
        `Сделка ${deal.code} по заявке клиента — возьмите в работу`,
      );
    }
    this.emitDeal(deal.id, 'deal:created', this.presentDeal(deal, takerId));
    this.realtime.emitOrderbook('orderbook:update', { action: 'deal', adId: ad.id });
    return this.presentDeal(deal, takerId);
  }

  private presentDeal<
    T extends {
      buyerId: string;
      sellerId: string;
      buyerAlias?: string | null;
      sellerAlias?: string | null;
      buyer: Parameters<PlatformService['sanitizePublicUser']>[0];
      seller: Parameters<PlatformService['sanitizePublicUser']>[0];
    },
  >(deal: T, viewerId?: string, isAdmin = false) {
    if (isAdmin) {
      return {
        ...deal,
        buyer: this.platform.sanitizePublicUser(deal.buyer),
        seller: this.platform.sanitizePublicUser(deal.seller),
      };
    }
    let buyer = this.platform.sanitizePublicUser(deal.buyer);
    let seller = this.platform.sanitizePublicUser(deal.seller);
    if (viewerId === deal.buyerId) {
      seller = this.platform.maskCounterparty(deal.seller, deal.sellerAlias);
    } else if (viewerId === deal.sellerId) {
      buyer = this.platform.maskCounterparty(deal.buyer, deal.buyerAlias);
    } else if (viewerId) {
      buyer = this.platform.maskCounterparty(deal.buyer, deal.buyerAlias);
      seller = this.platform.maskCounterparty(deal.seller, deal.sellerAlias);
    }
    return { ...deal, buyer, seller };
  }

  async markPaid(userId: string, dealId: string, proofUrl?: string) {
    const deal = await this.getRaw(dealId);
    if (deal.buyerId !== userId) throw new ForbiddenException('Только покупатель может отметить оплату');
    if (deal.status !== DealStatus.CREATED) {
      throw new BadRequestException('Оплату можно отметить только для новой сделки');
    }
    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        status: DealStatus.PAID,
        paidAt: new Date(),
        ...(proofUrl ? { proofUrl } : {}),
      },
      include: dealInclude,
    });
    await this.systemMessage(
      dealId,
      'Покупатель отметил оплату. Ожидается подтверждение продавца.',
      proofUrl,
    );
    const seller = await this.prisma.user.findUnique({ where: { id: deal.sellerId } });
    if (seller?.isPersona) {
      await this.platform.notifyAdmins(
        'Оплата по сделке',
        `Покупатель оплатил сделку ${deal.code} — подтвердите и отпустите USDT`,
      );
      this.realtime.emitToAdmins('platform:paid', { dealId, code: deal.code });
    } else {
      await this.notifications.push(deal.sellerId, 'DEAL', 'Оплата отмечена', `Покупатель оплатил сделку ${deal.code}`);
    }
    this.emitDeal(dealId, 'deal:updated', this.presentDeal(updated, userId));
    return this.presentDeal(updated, userId);
  }

  async release(userId: string, isAdmin: boolean, dealId: string) {
    const deal = await this.getRaw(dealId);
    const seller = await this.prisma.user.findUnique({ where: { id: deal.sellerId } });
    const sellerIsPersona = seller?.isPersona ?? false;
    if (deal.sellerId !== userId && !isAdmin && !sellerIsPersona) {
      throw new ForbiddenException('Только продавец может подтвердить сделку');
    }
    if (sellerIsPersona && !isAdmin) {
      throw new ForbiddenException('Подтверждение платформенной сделки выполняет оператор');
    }
    if (deal.status !== DealStatus.PAID) {
      throw new BadRequestException('Сделку можно подтвердить только после оплаты');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.wallets.releaseEscrow(
        {
          sellerId: deal.sellerId,
          buyerId: deal.buyerId,
          currency: deal.asset,
          amount: D(deal.assetAmount),
          fee: D(deal.feeAmount),
          refType: 'deal',
          refId: deal.id,
        },
        tx,
      );
      return tx.deal.update({
        where: { id: dealId },
        data: {
          status: DealStatus.COMPLETED,
          releasedAt: new Date(),
          completedAt: new Date(),
        },
        include: dealInclude,
      });
    });

    await this.systemMessage(dealId, `Сделка ${deal.code} завершена. Крипта переведена покупателю.`);
    await this.notifyBoth(deal.buyerId, deal.sellerId, 'DEAL', 'Сделка завершена', `Сделка ${deal.code} успешно завершена`);
    this.emitDeal(dealId, 'deal:completed', this.presentDeal(updated, userId, isAdmin));
    this.emitBalances(deal.buyerId, deal.sellerId);
    return this.presentDeal(updated, userId, isAdmin);
  }

  async cancel(userId: string, isAdmin: boolean, dealId: string, reason?: string) {
    const deal = await this.getRaw(dealId);
    const isParty = deal.buyerId === userId || deal.sellerId === userId;
    if (!isParty && !isAdmin) throw new ForbiddenException('Нет доступа к сделке');
    if (deal.status !== DealStatus.CREATED) {
      throw new BadRequestException('Отменить можно только неоплаченную сделку');
    }
    return this.refundAndClose(deal, DealStatus.CANCELLED, reason ?? 'Отменено участником');
  }

  /** Called by the scheduler when the payment window elapses. */
  async expire(dealId: string) {
    const deal = await this.getRaw(dealId);
    if (deal.status !== DealStatus.CREATED) return;
    await this.refundAndClose(deal, DealStatus.EXPIRED, 'Истёк срок оплаты');
  }

  private async refundAndClose(
    deal: Prisma.DealGetPayload<{ include: typeof dealInclude }>,
    status: DealStatus,
    reason: string,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.wallets.unlock(
        deal.sellerId,
        deal.asset,
        D(deal.assetAmount),
        { refType: 'deal', refId: deal.id },
        tx,
      );
      if (deal.advertisementId) {
        await tx.advertisement.update({
          where: { id: deal.advertisementId },
          data: { availableAmount: { increment: deal.fiatAmount } },
        });
      }
      return tx.deal.update({
        where: { id: deal.id },
        data: { status, cancelledAt: new Date(), cancelReason: reason },
        include: dealInclude,
      });
    });
    await this.systemMessage(deal.id, `Сделка ${deal.code} закрыта: ${reason}. Эскроу возвращён продавцу.`);
    await this.notifyBoth(deal.buyerId, deal.sellerId, 'DEAL', 'Сделка закрыта', `Сделка ${deal.code}: ${reason}`);
    this.emitDeal(deal.id, 'deal:closed', updated);
    this.emitBalances(deal.buyerId, deal.sellerId);
    return updated;
  }

  // -------- Disputes --------
  async openDispute(userId: string, dealId: string, reason: string) {
    const deal = await this.getRaw(dealId);
    if (deal.buyerId !== userId && deal.sellerId !== userId) {
      throw new ForbiddenException('Нет доступа к сделке');
    }
    if (!([DealStatus.CREATED, DealStatus.PAID] as DealStatus[]).includes(deal.status)) {
      throw new BadRequestException('Спор можно открыть только по активной сделке');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.dispute.create({
        data: { dealId, openedById: userId, reason, status: DisputeStatus.OPEN },
      });
      return tx.deal.update({
        where: { id: dealId },
        data: { status: DealStatus.DISPUTED },
        include: dealInclude,
      });
    });
    await this.systemMessage(dealId, `Открыт спор по сделке ${deal.code}. Ожидается решение администратора.`);
    this.realtime.emitToAdmins('dispute:opened', { dealId, reason });
    this.emitDeal(dealId, 'deal:updated', updated);
    return updated;
  }

  async resolveDispute(
    adminId: string,
    dealId: string,
    winner: 'BUYER' | 'SELLER',
    resolution: string,
  ) {
    const deal = await this.getRaw(dealId);
    if (deal.status !== DealStatus.DISPUTED) {
      throw new BadRequestException('Сделка не находится в споре');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (winner === 'BUYER') {
        // Release escrow to the buyer (as if seller confirmed).
        await this.wallets.releaseEscrow(
          {
            sellerId: deal.sellerId,
            buyerId: deal.buyerId,
            currency: deal.asset,
            amount: D(deal.assetAmount),
            fee: D(deal.feeAmount),
            refType: 'dispute',
            refId: deal.id,
          },
          tx,
        );
      } else {
        // Refund escrow to the seller.
        await this.wallets.unlock(
          deal.sellerId,
          deal.asset,
          D(deal.assetAmount),
          { refType: 'dispute', refId: deal.id },
          tx,
        );
      }
      await tx.dispute.update({
        where: { dealId },
        data: {
          status: winner === 'BUYER' ? DisputeStatus.RESOLVED_BUYER : DisputeStatus.RESOLVED_SELLER,
          resolvedById: adminId,
          resolution,
          resolvedAt: new Date(),
        },
      });
      return tx.deal.update({
        where: { id: dealId },
        data: {
          status: winner === 'BUYER' ? DealStatus.COMPLETED : DealStatus.CANCELLED,
          completedAt: winner === 'BUYER' ? new Date() : undefined,
          cancelledAt: winner === 'SELLER' ? new Date() : undefined,
          cancelReason: winner === 'SELLER' ? `Спор решён в пользу продавца: ${resolution}` : undefined,
        },
        include: dealInclude,
      });
    });

    await this.systemMessage(dealId, `Спор решён в пользу ${winner === 'BUYER' ? 'покупателя' : 'продавца'}: ${resolution}`);
    await this.notifyBoth(deal.buyerId, deal.sellerId, 'DISPUTE', 'Спор решён', `Сделка ${deal.code}: ${resolution}`);
    this.emitDeal(dealId, 'deal:updated', updated);
    this.emitBalances(deal.buyerId, deal.sellerId);
    return updated;
  }

  // -------- Queries --------
  async getById(userId: string, isAdmin: boolean, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { ...dealInclude, chatMessages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    if (!isAdmin && deal.buyerId !== userId && deal.sellerId !== userId) {
      throw new ForbiddenException('Нет доступа к сделке');
    }
    return this.presentDeal(deal, userId, isAdmin);
  }

  async listMine(userId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: {
        ...dealInclude,
        chatMessages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return deals.map((d) => {
      const { chatMessages, ...rest } = d;
      return {
        ...this.presentDeal(rest, userId),
        lastMessage: chatMessages[0] ?? null,
      };
    });
  }

  listAll(status?: DealStatus) {
    return this.prisma.deal.findMany({
      where: status ? { status } : {},
      include: dealInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // -------- Chat --------
  async sendMessage(userId: string, isAdmin: boolean, dealId: string, body: string, attachmentUrl?: string) {
    const deal = await this.getRaw(dealId);
    if (!isAdmin && deal.buyerId !== userId && deal.sellerId !== userId) {
      throw new ForbiddenException('Нет доступа к сделке');
    }
    const message = await this.prisma.chatMessage.create({
      data: { dealId, senderId: userId, body, attachmentUrl },
      include: { sender: { select: { id: true, username: true, displayName: true } } },
    });
    this.emitDeal(dealId, 'chat:message', message);
    const recipient = deal.buyerId === userId ? deal.sellerId : deal.buyerId;
    await this.notifications.push(recipient, 'DEAL', 'Новое сообщение', `Сделка ${deal.code}`);
    return message;
  }

  private async systemMessage(dealId: string, body: string, attachmentUrl?: string) {
    const message = await this.prisma.chatMessage.create({
      data: {
        dealId,
        senderId: await this.systemSenderId(),
        body,
        isSystem: true,
        attachmentUrl,
      },
    });
    this.emitDeal(dealId, 'chat:message', message);
  }

  private async systemSenderId(): Promise<string> {
    const system = await this.prisma.user.findFirst({ where: { isSystem: true } });
    if (!system) throw new BadRequestException('Системный аккаунт не инициализирован');
    return system.id;
  }

  private async getRaw(dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, include: dealInclude });
    if (!deal) throw new NotFoundException('Сделка не найдена');
    return deal;
  }

  private emitDeal(dealId: string, event: string, payload: unknown) {
    this.realtime.emitToDeal(dealId, event, payload);
    this.realtime.emitToAdmins(event, payload);
  }

  private async notifyBoth(
    a: string,
    b: string,
    type: 'DEAL' | 'DISPUTE',
    title: string,
    body: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [a, b] } },
      select: { id: true, isPersona: true, isSystem: true },
    });
    for (const u of users) {
      if (!u.isPersona && !u.isSystem) {
        await this.notifications.push(u.id, type, title, body);
      }
    }
  }

  private async emitBalances(...userIds: string[]) {
    for (const id of userIds) {
      const balances = await this.wallets.getBalances(id);
      this.realtime.emitToUser(id, 'balance:update', balances);
    }
  }
}
