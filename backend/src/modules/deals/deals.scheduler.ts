import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DealStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DealsService } from './deals.service';

@Injectable()
export class DealsScheduler {
  private readonly logger = new Logger(DealsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
  ) {}

  /** Auto-expire unpaid deals whose payment window elapsed. */
  @Interval(30_000)
  async expireStaleDeals() {
    const stale = await this.prisma.deal.findMany({
      where: {
        status: DealStatus.CREATED,
        paymentDeadline: { lt: new Date() },
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of stale) {
      try {
        await this.deals.expire(id);
      } catch (e) {
        this.logger.error(`Не удалось истечь сделку ${id}: ${(e as Error).message}`);
      }
    }
  }
}
