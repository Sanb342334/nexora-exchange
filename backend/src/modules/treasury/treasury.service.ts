import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PlatformService } from '../platform/platform.service';
import { TelegramAdminService } from '../platform/telegram-admin.service';
import { D, toDb } from '../../common/money';
import {
  AdjustBalanceDto,
  CreateDepositDto,
  CreateWithdrawalDto,
} from './dto/treasury.dto';
import { DepositCryptoConfig } from './deposit-crypto.config';
import { PlatformLimitsService } from '../platform/platform-limits.service';

const PAY_WINDOW_SEC = 15 * 60;

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly platform: PlatformService,
    private readonly telegram: TelegramAdminService,
    private readonly cryptoCfg: DepositCryptoConfig,
    private readonly limits: PlatformLimitsService,
  ) {}

  depositMethods() {
    return {
      methods: [
        { id: 'CARD_P2P', title: 'P2P банковская карта', needsProof: true, needsAdminRequisites: true },
        { id: 'CRYPTO', title: 'Криптовалюта', needsProof: false, needsAdminRequisites: false },
      ],
      cryptoNetworks: this.cryptoCfg.list(),
    };
  }

  // ---------- Deposits ----------
  async requestDeposit(userId: string, dto: CreateDepositDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Некорректная сумма');
    const minDeposit = await this.limits.getMinDeposit();
    if (amount.lt(minDeposit)) {
      throw new BadRequestException(`Минимальная сумма пополнения: ${minDeposit}`);
    }
    const open = await this.prisma.depositRequest.findFirst({
      where: { userId, status: RequestStatus.PENDING },
    });
    if (open) {
      throw new BadRequestException('У вас уже есть активная заявка на пополнение. Отмените её или дождитесь обработки.');
    }

    const method = (dto.method || 'CARD_P2P').toUpperCase();
    if (method !== 'CARD_P2P' && method !== 'CRYPTO') {
      throw new BadRequestException('Доступны способы: CARD_P2P или CRYPTO');
    }

    let requisites: string | null = null;
    let paymentExpiresAt: Date | null = null;
    let currency = dto.currency;

    if (method === 'CRYPTO') {
      const net = dto.cryptoNetwork ? this.cryptoCfg.get(dto.cryptoNetwork) : this.cryptoCfg.list()[0];
      if (!net) {
        throw new BadRequestException('Крипто-адреса не настроены. Обратитесь в поддержку.');
      }
      currency = net.asset;
      requisites = `${net.asset} · ${net.network}\n${net.address}`;
      paymentExpiresAt = new Date(Date.now() + PAY_WINDOW_SEC * 1000);
    }

    const req = await this.prisma.depositRequest.create({
      data: {
        userId,
        currency,
        amount: toDb(D(dto.amount)),
        method,
        txHash: dto.txHash,
        requisites,
        requisitesAssignedAt: requisites ? new Date() : null,
        paymentExpiresAt,
      },
    });

    const payload = this.serializeDeposit(req);
    this.realtime.emitToAdmins('deposit:requested', payload);
    const hint =
      method === 'CRYPTO'
        ? 'крипто — дождитесь поступления'
        : 'выдайте реквизиты карты';
    await this.platform.notifyAdmins(
      'Новая заявка на пополнение',
      `@${user.username}: ${dto.amount} ${currency} (${method}) — ${hint}`,
    );
    const depText =
      `💳 <b>Заявка на пополнение</b>\n` +
      `User: <code>${user.username}</code>\n` +
      `Способ: <b>${method}</b>\n` +
      `Сумма: <b>${dto.amount} ${currency}</b>\n` +
      `ID: <code>${req.id}</code>\n` +
      (method === 'CRYPTO'
        ? `Адрес:\n<code>${requisites}</code>`
        : 'Нажмите кнопку — выдайте карту и (опц.) комментарий');
    await this.telegram.notify(depText, {
      inline_keyboard:
        method === 'CRYPTO'
          ? [
              [
                { text: '✅ Зачислить', callback_data: `adm:dep:ok:${req.id}` },
                { text: '❌ Отклонить', callback_data: `adm:dep:no:${req.id}` },
              ],
              [{ text: '🛠 Админ-панель', callback_data: 'adm:menu' }],
            ]
          : [
              [{ text: '💳 Выдать реквизиты', callback_data: `adm:req:${req.id}` }],
              [
                { text: '✅ Зачислить', callback_data: `adm:dep:ok:${req.id}` },
                { text: '❌ Отклонить', callback_data: `adm:dep:no:${req.id}` },
              ],
              [{ text: '🛠 Админ-панель', callback_data: 'adm:menu' }],
            ],
    });

    return payload;
  }

  async assignRequisites(adminId: string, id: string, requisites: string, comment?: string) {
    const req = await this.prisma.depositRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true } } },
    });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== RequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');
    if (!requisites?.trim()) throw new BadRequestException('Укажите реквизиты');

    const text = comment?.trim()
      ? `${requisites.trim()}\n\nКомментарий: ${comment.trim()}`
      : requisites.trim();

    const paymentExpiresAt = new Date(Date.now() + PAY_WINDOW_SEC * 1000);
    const updated = await this.prisma.depositRequest.update({
      where: { id },
      data: {
        requisites: text,
        requisitesAssignedAt: new Date(),
        paymentExpiresAt,
        reviewedById: adminId,
        reviewNote: comment?.trim() || null,
      },
    });

    const payload = this.serializeDeposit(updated);
    await this.notifications.push(
      req.userId,
      'DEPOSIT',
      'Реквизиты для оплаты',
      `Переведите ${req.amount} ${req.currency}. Таймер 15 минут. Затем загрузите чек.`,
    );
    this.realtime.emitToUser(req.userId, 'deposit:requisites', payload);
    this.realtime.emitToUser(req.userId, 'deposit:updated', payload);
    this.realtime.emitToUser(req.userId, 'notification', {
      type: 'DEPOSIT',
      title: 'Реквизиты для оплаты',
      body: `Переведите ${req.amount} ${req.currency}`,
    });
    this.realtime.emitToAdmins('deposit:updated', payload);

    return payload;
  }

  async attachDepositProof(userId: string, id: string, proofUrl: string) {
    const req = await this.prisma.depositRequest.findUnique({
      where: { id },
      include: { user: { select: { username: true, displayName: true } } },
    });
    if (!req || req.userId !== userId) throw new NotFoundException('Заявка не найдена');
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Заявка уже обработана');
    }
    if ((req.method || '').toUpperCase() === 'CRYPTO') {
      throw new BadRequestException('Для крипто-пополнения чек не требуется');
    }
    if (!req.requisites) {
      throw new BadRequestException('Сначала дождитесь реквизитов от оператора');
    }
    if (req.paymentExpiresAt && req.paymentExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Время оплаты истекло. Создайте новую заявку.');
    }

    const updated = await this.prisma.depositRequest.update({
      where: { id },
      data: { proofUrl },
    });

    const payload = this.serializeDeposit(updated);
    this.realtime.emitToAdmins('deposit:proof', payload);
    await this.platform.notifyAdmins(
      'Чек пополнения загружен',
      `@${req.user.username}: ${req.amount} ${req.currency} — на проверке`,
    );
    await this.telegram.notifyProof({
      caption:
        `🧾 <b>Чек загружен</b>\n` +
        `User: <code>${req.user.username}</code>\n` +
        `Сумма: <b>${req.amount} ${req.currency}</b>\n` +
        `ID: <code>${req.id}</code>`,
      proofUrl,
      keyboard: {
        inline_keyboard: [
          [
            { text: '✅ Зачислить', callback_data: `adm:dep:ok:${req.id}` },
            { text: '❌ Отклонить', callback_data: `adm:dep:no:${req.id}` },
          ],
          [{ text: '💰 Депозиты', callback_data: 'adm:deps' }],
        ],
      },
    });
    await this.notifications.push(
      userId,
      'DEPOSIT',
      'Платёж в обработке',
      'Ваш платёж в обработке. Средства будут зачислены после проверки платежной системой.',
    );
    return payload;
  }

  async cancelDeposit(userId: string, id: string) {
    const req = await this.prisma.depositRequest.findUnique({ where: { id } });
    if (!req || req.userId !== userId) throw new NotFoundException('Заявка не найдена');
    if (req.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Нельзя отменить обработанную заявку');
    }
    const updated = await this.prisma.depositRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, reviewedAt: new Date(), reviewNote: 'Отменено пользователем' },
    });
    this.realtime.emitToAdmins('deposit:cancelled', this.serializeDeposit(updated));
    await this.telegram.notify(
      `✖️ Заявка на пополнение отменена пользователем\nID: <code>${id}</code>`,
    );
    return this.serializeDeposit(updated);
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
    this.realtime.emitToAdmins('deposit:updated', this.serializeDeposit(updated));
    this.realtime.emitToUser(req.userId, 'deposit:approved', this.serializeDeposit(updated));
    return this.serializeDeposit(updated);
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
    this.realtime.emitToAdmins('deposit:updated', this.serializeDeposit(updated));
    this.realtime.emitToUser(req.userId, 'deposit:rejected', this.serializeDeposit(updated));
    return this.serializeDeposit(updated);
  }

  // ---------- Withdrawals ----------
  async withdrawalEligibility(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { withdrawRequireCardDeposit: true },
    });
    const cardDepositCount = await this.prisma.depositRequest.count({
      where: {
        userId,
        status: RequestStatus.APPROVED,
        method: { in: ['CARD_P2P', 'CARD'] },
      },
    });
    const hasCardDeposit = cardDepositCount > 0;
    const required = user.withdrawRequireCardDeposit;
    const allowed = !required || hasCardDeposit;
    return {
      allowed,
      required,
      hasCardDeposit,
      cardDepositCount,
      message: allowed
        ? null
        : 'Вывод доступен после успешного пополнения через P2P (банковская карта). Средства выводятся на ту же карту, с которой был депозит. Одного крипто-пополнения недостаточно.',
    };
  }

  async requestWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const eligibility = await this.withdrawalEligibility(userId);
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.message ?? 'Вывод недоступен');
    }
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Некорректная сумма');
    const minWd = await this.limits.getMinWithdrawal();
    if (amount.lt(minWd)) {
      throw new BadRequestException(`Минимальная сумма вывода: ${minWd}`);
    }
    const wallet = await this.wallets.getWallet(userId, dto.currency);
    if (D(wallet.available).lt(amount)) {
      throw new BadRequestException('Недостаточно доступных средств для вывода');
    }
    const method = (dto.method || 'CARD').toUpperCase();
    if (!dto.destination?.trim()) throw new BadRequestException('Укажите реквизиты / адрес');
    const lines = [
      `Способ: ${method === 'CRYPTO' ? 'Криптовалюта' : 'Банковская карта'}`,
      method === 'CRYPTO' ? `Адрес: ${dto.destination.trim()}` : `Реквизиты: ${dto.destination.trim()}`,
    ];
    if (method !== 'CRYPTO' && dto.holderName?.trim()) lines.push(`Получатель: ${dto.holderName.trim()}`);
    if (dto.comment?.trim()) lines.push(`Комментарий: ${dto.comment.trim()}`);
    const destination = lines.join('\n');

    const req = await this.prisma.$transaction(async (tx) => {
      const created = await tx.withdrawalRequest.create({
        data: {
          userId,
          currency: dto.currency,
          amount: toDb(amount),
          destination,
        },
      });
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
    await this.platform.notifyAdmins('Заявка на вывод', `${dto.amount} ${dto.currency}`);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    await this.telegram.notify(
      `📤 <b>Заявка на вывод</b>\n` +
        `User: <code>${user?.username ?? userId}</code>\n` +
        `Сумма: <b>${dto.amount} ${dto.currency}</b>\n` +
        `<pre>${destination}</pre>\n` +
        `ID: <code>${req.id}</code>`,
      {
        inline_keyboard: [
          [
            { text: '✅ Одобрить', callback_data: `adm:wd:ok:${req.id}` },
            { text: '❌ Отклонить', callback_data: `adm:wd:no:${req.id}` },
          ],
          [{ text: '📤 К выводам', callback_data: 'adm:wds' }],
        ],
      },
    );
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
    const reason = note?.trim();
    if (!reason) throw new BadRequestException('Укажите причину отказа');
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
          reviewNote: reason,
          reviewedAt: new Date(),
        },
      });
    });
    await this.notifications.push(
      req.userId,
      'WITHDRAWAL',
      'Вывод отклонён',
      `Причина: ${reason}`,
    );
    this.realtime.emitToUser(req.userId, 'withdrawal:updated', this.serializeWithdrawal(updated));
    await this.emitBalances(req.userId);
    return this.serializeWithdrawal(updated);
  }

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

  listMyDeposits(userId: string) {
    return this.prisma.depositRequest
      .findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
      .then((rows) => rows.map((r) => this.serializeDeposit(r)));
  }

  getMyActiveDeposit(userId: string) {
    return this.prisma.depositRequest
      .findFirst({
        where: { userId, status: RequestStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      })
      .then((r) => (r ? this.serializeDeposit(r) : null));
  }

  listMyWithdrawals(userId: string) {
    return this.prisma.withdrawalRequest
      .findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((r) => this.serializeWithdrawal(r)));
  }

  private serializeWithdrawal(req: {
    id: string;
    userId: string;
    currency: string;
    amount: { toString(): string };
    destination: string;
    status: RequestStatus;
    reviewNote?: string | null;
    reviewedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: req.id,
      userId: req.userId,
      currency: req.currency,
      amount: req.amount.toString(),
      destination: req.destination,
      status: req.status,
      reviewNote: req.reviewNote ?? null,
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
    };
  }

  listDeposits(status?: RequestStatus) {
    return this.prisma.depositRequest
      .findMany({
        where: status ? { status } : {},
        include: { user: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) =>
        rows.map((r) => ({
          ...this.serializeDeposit(r),
          user: r.user,
        })),
      );
  }

  listWithdrawals(status?: RequestStatus) {
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private serializeDeposit(req: {
    id: string;
    userId: string;
    currency: string;
    amount: { toString(): string };
    method?: string | null;
    proofUrl?: string | null;
    txHash?: string | null;
    status: RequestStatus;
    requisites?: string | null;
    requisitesAssignedAt?: Date | null;
    paymentExpiresAt?: Date | null;
    reviewNote?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const isCrypto = (req.method || '').toUpperCase() === 'CRYPTO';
    const stage = !req.requisites
      ? 'WAITING_REQUISITES'
      : isCrypto && req.status === 'PENDING'
        ? 'AWAITING_CRYPTO'
        : !req.proofUrl
          ? 'AWAITING_PAYMENT'
          : req.status === 'PENDING'
            ? 'AWAITING_REVIEW'
            : req.status;

    return {
      id: req.id,
      userId: req.userId,
      currency: req.currency,
      amount: req.amount.toString(),
      method: req.method,
      proofUrl: req.proofUrl,
      txHash: req.txHash,
      status: req.status,
      stage,
      requisites: req.requisites,
      requisitesAssignedAt: req.requisitesAssignedAt ? req.requisitesAssignedAt.toISOString() : null,
      paymentExpiresAt: req.paymentExpiresAt ? req.paymentExpiresAt.toISOString() : null,
      reviewNote: req.reviewNote,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
      paymentWindowSec: PAY_WINDOW_SEC,
    };
  }

  private async emitBalances(userId: string) {
    const balances = await this.wallets.getBalances(userId);
    this.realtime.emitToUser(userId, 'balance:update', balances);
  }
}
