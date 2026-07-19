import { Injectable } from '@nestjs/common';
import { DealStatus, RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { D, ZERO } from '../../common/money';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      totalTraders,
      activeTraders,
      openDeals,
      disputedDeals,
      pendingDeposits,
      pendingWithdrawals,
      completedDeals,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'TRADER' } }),
      this.prisma.user.count({ where: { role: 'TRADER', status: 'ACTIVE' } }),
      this.prisma.deal.count({
        where: { status: { in: [DealStatus.CREATED, DealStatus.PAID] } },
      }),
      this.prisma.deal.count({ where: { status: DealStatus.DISPUTED } }),
      this.prisma.depositRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.withdrawalRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.deal.findMany({
        where: { status: DealStatus.COMPLETED },
        select: { fiatAmount: true, feeAmount: true, asset: true, fiat: true },
      }),
    ]);

    const volumeFiat = completedDeals.reduce((acc, d) => acc.plus(D(d.fiatAmount)), ZERO);
    const feeAsset = completedDeals.reduce((acc, d) => acc.plus(D(d.feeAmount)), ZERO);

    // House (system) balances = platform liability snapshot.
    const houseWallets = await this.prisma.wallet.findMany({ where: { type: 'HOUSE' } });
    const totalUserBalances = await this.prisma.wallet.groupBy({
      by: ['currency'],
      where: { type: 'USER' },
      _sum: { available: true, frozen: true },
    });

    return {
      traders: { total: totalTraders, active: activeTraders },
      deals: {
        open: openDeals,
        disputed: disputedDeals,
        completed: completedDeals.length,
      },
      pending: { deposits: pendingDeposits, withdrawals: pendingWithdrawals },
      volume: {
        completedFiat: volumeFiat.toString(),
        feesCollectedAsset: feeAsset.toString(),
      },
      house: houseWallets.map((w) => ({
        currency: w.currency,
        available: w.available.toString(),
        frozen: w.frozen.toString(),
      })),
      userBalances: totalUserBalances.map((b) => ({
        currency: b.currency,
        available: b._sum.available?.toString() ?? '0',
        frozen: b._sum.frozen?.toString() ?? '0',
      })),
    };
  }

  disputes() {
    return this.prisma.dispute.findMany({
      where: { status: 'OPEN' },
      include: {
        deal: {
          include: {
            buyer: { select: { id: true, username: true } },
            seller: { select: { id: true, username: true } },
          },
        },
        openedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  auditLog(limit = 200) {
    return this.prisma.auditLog.findMany({
      include: { actor: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
