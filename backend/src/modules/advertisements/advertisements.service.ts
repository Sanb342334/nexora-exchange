import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdSide, AdStatus, DealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PlatformService } from '../platform/platform.service';
import { D, toDb } from '../../common/money';
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
} from './dto/advertisement.dto';

const adInclude = {
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      isPersona: true,
      personaRating: true,
      personaDealsCount: true,
    },
  },
  paymentMethods: { include: { paymentMethod: true } },
} satisfies Prisma.AdvertisementInclude;

@Injectable()
export class AdvertisementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rates: RatesService,
    private readonly realtime: RealtimeGateway,
    private readonly platform: PlatformService,
  ) {}

  async create(userId: string, dto: CreateAdvertisementDto) {
    if (dto.minFiat > dto.maxFiat) {
      throw new BadRequestException('Минимальная сумма не может превышать максимальную');
    }
    if (!dto.isFloating && (dto.price == null || dto.price <= 0)) {
      throw new BadRequestException('Для фиксированной цены укажите price');
    }
    if (dto.isFloating && dto.floatingMargin == null) {
      throw new BadRequestException('Для плавающей цены укажите floatingMargin');
    }

    // Validate payment methods when provided (required for SELL ads).
    const pmIds = dto.paymentMethodIds ?? [];
    if (dto.side === 'SELL' && pmIds.length === 0) {
      throw new BadRequestException('Для продажи USDT укажите реквизиты');
    }
    if (pmIds.length > 0) {
      const methods = await this.prisma.paymentMethod.findMany({
        where: { id: { in: pmIds }, userId, isActive: true },
      });
      if (methods.length !== pmIds.length) {
        throw new BadRequestException('Указаны недоступные реквизиты');
      }
    }

    const ad = await this.prisma.advertisement.create({
      data: {
        userId,
        side: dto.side,
        asset: dto.asset ?? this.config.get<string>('economics.baseAsset') ?? 'USDT',
        fiat: dto.fiat ?? this.config.get<string>('economics.baseFiat') ?? 'KZT',
        isPlatform: false,
        isFloating: dto.isFloating ?? false,
        price: dto.price != null ? toDb(D(dto.price)) : null,
        floatingMargin: dto.floatingMargin != null ? toDb(D(dto.floatingMargin)) : null,
        totalAmount: toDb(D(dto.totalAmount)),
        availableAmount: toDb(D(dto.totalAmount)),
        minFiat: toDb(D(dto.minFiat)),
        maxFiat: toDb(D(dto.maxFiat)),
        terms: dto.terms,
        city: dto.city,
        bankName: dto.bankName,
        paymentWindowMin:
          dto.paymentWindowMin ??
          this.config.get<number>('economics.dealPaymentWindowMin') ??
          15,
        paymentMethods: pmIds.length
          ? { create: pmIds.map((id) => ({ paymentMethodId: id })) }
          : undefined,
      },
      include: adInclude,
    });

    await this.platform.notifyAdmins(
      'Новая заявка OTC',
      `${dto.side === 'BUY' ? 'Покупка' : 'Продажа'} USDT — ${dto.totalAmount} ${dto.fiat ?? 'KZT'}`,
    );
    this.realtime.emitToAdmins('otc:new-ad', { adId: ad.id });

    this.realtime.emitOrderbook('orderbook:update', { action: 'create', adId: ad.id });
    return this.presentAd(ad);
  }

  private async presentAd(ad: Prisma.AdvertisementGetPayload<{ include: typeof adInclude }>) {
    const withPrice = await this.withEffectivePrice(ad);
    return {
      ...withPrice,
      user: this.platform.sanitizePublicUser(ad.user),
    };
  }

  async marketStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeAds, deals24h, volumeAgg, users, onlineDeals] = await Promise.all([
      this.prisma.advertisement.count({ where: { status: AdStatus.ACTIVE, isPlatform: true } }),
      this.prisma.deal.count({ where: { createdAt: { gte: since } } }),
      this.prisma.deal.aggregate({
        where: { createdAt: { gte: since }, status: DealStatus.COMPLETED },
        _sum: { fiatAmount: true },
      }),
      this.prisma.user.count({ where: { role: 'TRADER', status: 'ACTIVE', isPersona: false } }),
      this.prisma.deal.count({
        where: { status: { in: [DealStatus.CREATED, DealStatus.PAID, DealStatus.DISPUTED] } },
      }),
    ]);
    return {
      activeAds,
      deals24h,
      volume24h: volumeAgg._sum.fiatAmount?.toString() ?? '0',
      users,
      online: Math.max(onlineDeals, 1),
    };
  }

  /** Resolve effective price for floating ads at read time. */
  private async withEffectivePrice<
    T extends { isFloating: boolean; price: Prisma.Decimal | null; floatingMargin: Prisma.Decimal | null; asset: string; fiat: string; side: AdSide },
  >(ad: T) {
    let effectivePrice: number;
    if (ad.isFloating) {
      const { price } = await this.rates.getMarketPrice(ad.asset, ad.fiat);
      const margin = ad.floatingMargin ? Number(ad.floatingMargin) : 0;
      effectivePrice = D(price)
        .times(1 + margin)
        .toDecimalPlaces(2)
        .toNumber();
    } else {
      effectivePrice = ad.price ? Number(ad.price) : 0;
    }
    return { ...ad, effectivePrice };
  }

  async list(filters: { side?: AdSide; asset?: string; fiat?: string; status?: AdStatus }) {
    const platformOnly = this.platform.isPlatformOrderbookOnly();
    const ads = await this.prisma.advertisement.findMany({
      where: {
        side: filters.side,
        asset: filters.asset,
        fiat: filters.fiat,
        status: filters.status ?? AdStatus.ACTIVE,
        ...(platformOnly ? { isPlatform: true } : {}),
      },
      include: adInclude,
      orderBy: [{ isPlatform: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(ads.map((ad) => this.presentAd(ad)));
  }

  async listMine(userId: string) {
    const ads = await this.prisma.advertisement.findMany({
      where: { userId },
      include: adInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(ads.map((ad) => this.presentAd(ad)));
  }

  async getById(id: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id }, include: adInclude });
    if (!ad) throw new NotFoundException('Объявление не найдено');
    return this.presentAd(ad);
  }

  async update(userId: string, isAdmin: boolean, id: string, dto: UpdateAdvertisementDto) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Объявление не найдено');
    if (ad.userId !== userId && !isAdmin) throw new ForbiddenException('Это не ваше объявление');

    const updated = await this.prisma.advertisement.update({
      where: { id },
      data: {
        status: dto.status,
        price: dto.price != null ? toDb(D(dto.price)) : undefined,
        floatingMargin: dto.floatingMargin != null ? toDb(D(dto.floatingMargin)) : undefined,
        minFiat: dto.minFiat != null ? toDb(D(dto.minFiat)) : undefined,
        maxFiat: dto.maxFiat != null ? toDb(D(dto.maxFiat)) : undefined,
        terms: dto.terms,
      },
      include: adInclude,
    });
    this.realtime.emitOrderbook('orderbook:update', { action: 'update', adId: id });
    return this.presentAd(updated);
  }
}
