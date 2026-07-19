import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdSide, AdStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { D, toDb } from '../../common/money';
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
} from './dto/advertisement.dto';

const adInclude = {
  user: { select: { id: true, username: true, displayName: true } },
  paymentMethods: { include: { paymentMethod: true } },
} satisfies Prisma.AdvertisementInclude;

@Injectable()
export class AdvertisementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rates: RatesService,
    private readonly realtime: RealtimeGateway,
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

    // Validate ownership of payment methods.
    const methods = await this.prisma.paymentMethod.findMany({
      where: { id: { in: dto.paymentMethodIds }, userId, isActive: true },
    });
    if (methods.length !== dto.paymentMethodIds.length) {
      throw new BadRequestException('Указаны недоступные реквизиты');
    }

    const ad = await this.prisma.advertisement.create({
      data: {
        userId,
        side: dto.side,
        asset: dto.asset ?? this.config.get<string>('economics.baseAsset') ?? 'USDT',
        fiat: dto.fiat ?? this.config.get<string>('economics.baseFiat') ?? 'RUB',
        isFloating: dto.isFloating ?? false,
        price: dto.price != null ? toDb(D(dto.price)) : null,
        floatingMargin: dto.floatingMargin != null ? toDb(D(dto.floatingMargin)) : null,
        totalAmount: toDb(D(dto.totalAmount)),
        availableAmount: toDb(D(dto.totalAmount)),
        minFiat: toDb(D(dto.minFiat)),
        maxFiat: toDb(D(dto.maxFiat)),
        terms: dto.terms,
        paymentWindowMin:
          dto.paymentWindowMin ??
          this.config.get<number>('economics.dealPaymentWindowMin') ??
          15,
        paymentMethods: {
          create: dto.paymentMethodIds.map((id) => ({ paymentMethodId: id })),
        },
      },
      include: adInclude,
    });

    this.realtime.emitOrderbook('orderbook:update', { action: 'create', adId: ad.id });
    return this.withEffectivePrice(ad);
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
    const ads = await this.prisma.advertisement.findMany({
      where: {
        side: filters.side,
        asset: filters.asset,
        fiat: filters.fiat,
        status: filters.status ?? AdStatus.ACTIVE,
      },
      include: adInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(ads.map((ad) => this.withEffectivePrice(ad)));
  }

  async listMine(userId: string) {
    const ads = await this.prisma.advertisement.findMany({
      where: { userId },
      include: adInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(ads.map((ad) => this.withEffectivePrice(ad)));
  }

  async getById(id: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id }, include: adInclude });
    if (!ad) throw new NotFoundException('Объявление не найдено');
    return this.withEffectivePrice(ad);
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
    return this.withEffectivePrice(updated);
  }
}
