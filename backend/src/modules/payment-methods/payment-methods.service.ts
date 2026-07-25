import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getPaymentMethodsForFiat } from '../../common/fiat-payment-methods';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreatePaymentMethodDto) {
    return this.prisma.paymentMethod.create({
      data: {
        userId,
        type: dto.type,
        bankName: dto.bankName,
        holderName: dto.holderName,
        details: dto.details,
        fiat: dto.fiat ?? 'KZT',
      },
    });
  }

  list(userId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  catalog(fiat: string) {
    const normalized = fiat.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
    return { fiat: normalized, methods: getPaymentMethodsForFiat(normalized) };
  }

  async update(userId: string, id: string, dto: UpdatePaymentMethodDto) {
    await this.assertOwner(userId, id);
    return this.prisma.paymentMethod.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    // Soft-disable to preserve references from historical deals.
    return this.prisma.paymentMethod.update({ where: { id }, data: { isActive: false } });
  }

  private async assertOwner(userId: string, id: string) {
    const pm = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) throw new NotFoundException('Реквизит не найден');
    if (pm.userId !== userId) throw new ForbiddenException('Это не ваш реквизит');
    return pm;
  }
}
