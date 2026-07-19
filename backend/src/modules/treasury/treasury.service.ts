import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { D, toDb } from '../../common/money';
import {
  AdjustBalanceDto,
  CreateDepositDto,
  CreateWithdrawalDto,
} from './dto/treasury.dto';

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------- Deposits ----------
  async requestDeposit(userId: string, dto: CreateDepositDto) {
    const req = await this.prisma.depositRequest.create({
      data: {
        userId,
        currency: dto.currency,
        amount: toDb(D(dto.amount)),
        method: dto.method,
        txHash: dto.txHash,
        proofUrl: dto.proofUrl,
      },
    });
    this.realtime.emitToAdmins('deposit:requested', req);
    return req;
  }

  async approveDeposit(adminId: string, id: string, note?: string) {
    const req = await this.prisma.depositRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка на депозит не найдена');
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Заявка уже обработана');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.wallets.deposit(
        req.userId,
        req.currency,
        D(req.amount),
        { refType: 'deposit', refId: req.id, createdById: adminId },
        tx,
      );
      return tx.depositRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          reviewedById: adminId,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
    });
    await this.notifications.push(
      req.userId,
      'DEPOSIT',
      'Депозит зачислен',
      `${req.amount} ${req.currency} зачислено на баланс`,
    );
    await this.emitBalances(req.userId);
    return updated;
  }

  async rejectDeposit(adminId: string, id: string, note?: string) {
    const req = await this.prisma.depositRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== RequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');
    const updated = await this.prisma.depositRequest.update({
      where: { id },
      data: {
        status: RequestStatus.REJECTED,
        reviewedById: adminId,
        reviewNote: note,
        reviewedAt: new Date(),
      },
    });
    await this.notifications.push(req.userId, 'DEPOSIT', 'Депозит отклонён', note ?? '');
    return updated;
  }

  // ---------- Withdrawals ----------
  async requestWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const amount = D(dto.amount);
    const wallet = await this.wallets.getWallet(userId, dto.currency);
    if (D(wallet.available).lt(amount)) {
      throw new BadRequestException('Недостаточно доступных средств для вывода');
    }
    const req = await this.prisma.$transaction(async (tx) => {
      const created = await tx.withdrawalRequest.create({
        data: {
          userId,
          currency: dto.currency,
          amount: toDb(amount),
          destination: dto.destination,
        },
      });
      // Hold funds so they cannot be spent while pending.
      await this.wallets.holdForWithdrawal(
        userId,
        dto.currency,
        amount,
        { refType: 'withdrawal', refId: created.id },
        tx,
      );
      return created;
    });
    this.realtime.emitToAdmins('withdrawal:requested', req);
    await this.emitBalances(userId);
    return req;
  }

  async approveWithdrawal(adminId: string, id: string, note?: string) {
    const req = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка на вывод не найдена');
    if (req.status !== RequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.wallets.settleWithdrawal(
        req.userId,
        req.currency,
        D(req.amount),
        { refType: 'withdrawal', refId: req.id, createdById: adminId },
        tx,
      );
      return tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          reviewedById: adminId,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
    });
    await this.notifications.push(
      req.userId,
      'WITHDRAWAL',
      'Вывод выполнен',
      `${req.amount} ${req.currency} отправлено на ${req.destination}`,
    );
    await this.emitBalances(req.userId);
    return updated;
  }

  async rejectWithdrawal(adminId: string, id: string, note?: string) {
    const req = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== RequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.wallets.releaseWithdrawalHold(
        req.userId,
        req.currency,
        D(req.amount),
        { refType: 'withdrawal', refId: req.id },
        tx,
      );
      return tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: RequestStatus.REJECTED,
          reviewedById: adminId,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
    });
    await this.notifications.push(req.userId, 'WITHDRAWAL', 'Вывод отклонён', note ?? '');
    await this.emitBalances(req.userId);
    return updated;
  }

  // ---------- Admin manual adjustment ----------
  async adjustBalance(adminId: string, dto: AdjustBalanceDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.wallets.adjust(
        dto.userId,
        dto.currency,
        D(dto.amount),
        { refType: 'adjustment', createdById: adminId, description: dto.description },
        tx,
      );
    });
    await this.notifications.push(
      dto.userId,
      'BALANCE',
      'Баланс изменён администратором',
      `${dto.amount > 0 ? '+' : ''}${dto.amount} ${dto.currency}. ${dto.description ?? ''}`,
    );
    await this.emitBalances(dto.userId);
    return { success: true };
  }

  // ---------- Queries ----------
  listMyDeposits(userId: string) {
    return this.prisma.depositRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listMyWithdrawals(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listDeposits(status?: RequestStatus) {
    return this.prisma.depositRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  listWithdrawals(status?: RequestStatus) {
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async emitBalances(userId: string) {
    const balances = await this.wallets.getBalances(userId);
    this.realtime.emitToUser(userId, 'balance:update', balances);
  }
}
