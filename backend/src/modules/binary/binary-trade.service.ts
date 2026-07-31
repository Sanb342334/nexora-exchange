import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BinaryDirection,
  BinaryOutcomeMode,
  BinaryTradeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { D, toDb } from '../../common/money';
import {
  BINARY_CURRENCIES,
  BINARY_PAIRS,
  BINARY_TRADE_FEE_RATE,
  DEFAULT_BINARY_PAYOUT,
  convertFiatAmount,
  findBinaryPair,
  formatDuration,
  isAllowedDuration,
  normalizePairId,
  plannedWin,
} from './binary.constants';
import { BinaryPriceService } from './binary-price.service';
import { escapeTelegramHtml, telegramSendHtml } from '../platform/telegram-api';
import { PlatformLimitsService } from '../platform/platform-limits.service';

@Injectable()
export class BinaryTradeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinaryTradeService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private tpSlTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly prices: BinaryPriceService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
    private readonly limits: PlatformLimitsService,
  ) {}

  async onModuleInit() {
    const open = await this.prisma.binaryTrade.findMany({ where: { status: 'OPEN' } });
    for (const t of open) {
      const elapsed = (Date.now() - t.createdAt.getTime()) / 1000;
      const left = Math.max(0, t.durationSec - elapsed);
      this.scheduleSettle(t.id, left);
    }
    this.tpSlTimer = setInterval(() => {
      this.checkTpSl().catch((e) => this.logger.warn(`tpsl: ${e}`));
    }, 800);
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.tpSlTimer) clearInterval(this.tpSlTimer);
  }

  async getPayoutCoef(): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: 'binary_payout_coefficient' },
    });
    return row ? parseFloat(row.value) : DEFAULT_BINARY_PAYOUT;
  }

  async getDepositRequisites(): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'deposit_requisites' } });
    return row?.value ?? 'Реквизиты не заданы. Обратитесь в поддержку.';
  }

  async setDepositRequisites(value: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'deposit_requisites' },
      update: { value },
      create: { key: 'deposit_requisites', value },
    });
  }

  async setPayoutCoef(value: number) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'binary_payout_coefficient' },
      update: { value: String(value) },
      create: { key: 'binary_payout_coefficient', value: String(value) },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const currency = user.tradingCurrency || user.preferredFiat || 'KZT';
    await this.wallets.ensureWallet(userId, currency);
    const balances = await this.wallets.getBalances(userId);
    const bal = balances.find((b) => b.currency === currency);
    const payout = await this.getPayoutCoef();
    return {
      balance: bal?.available ?? '0',
      currency,
      symbol: BINARY_CURRENCIES[currency]?.symbol ?? currency,
      payout,
      pendingWithdraw: user.pendingWithdraw.toString(),
      outcomeMode: user.outcomeMode,
      needsCurrency: !user.currencySelected,
      tradeFeeRate: BINARY_TRADE_FEE_RATE,
      withdrawRequireCardDeposit: user.withdrawRequireCardDeposit,
      limits: await this.limits.getAll(),
    };
  }

  async setCurrency(userId: string, currency: string) {
    if (!BINARY_CURRENCIES[currency]) throw new BadRequestException('Недоступная валюта');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const from = user.tradingCurrency || user.preferredFiat || 'KZT';
    await this.wallets.ensureWallet(userId, currency);
    if (from !== currency) {
      const bals = await this.wallets.getBalances(userId);
      const fromBal = parseFloat(bals.find((b) => b.currency === from)?.available ?? '0');
      if (fromBal > 0) {
        const toAmt = convertFiatAmount(fromBal, from, currency);
        await this.prisma.$transaction(async (tx) => {
          await this.wallets.convertAvailable(userId, from, currency, fromBal, toAmt, tx);
        });
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tradingCurrency: currency,
        preferredFiat: currency,
        currencySelected: true,
      },
    });
    await this.log(userId, 'currency_change', { from, currency });
    return this.me(userId);
  }

  async openTrade(
    userId: string,
    input: {
      pairId: string;
      direction: 'up' | 'down' | 'UP' | 'DOWN';
      stake: number;
      durationSec: number;
      leverage?: number;
      takeProfit?: number;
      stopLoss?: number;
    },
  ) {
    const pair = findBinaryPair(input.pairId);
    if (!pair) throw new BadRequestException('Неизвестная пара');
    const direction = input.direction.toUpperCase() as BinaryDirection;
    if (direction !== 'UP' && direction !== 'DOWN') {
      throw new BadRequestException('direction must be up/down');
    }
    if (!isAllowedDuration(input.durationSec)) {
      throw new BadRequestException('Недопустимая экспирация');
    }
    const stake = D(input.stake);
    if (stake.lte(0)) throw new BadRequestException('Некорректная маржа');
    const minTrade = await this.limits.getMinTrade();
    if (stake.lt(minTrade)) {
      throw new BadRequestException(`Минимальная сумма сделки: ${minTrade}`);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.tradeLocked || user.kycRequired) {
      throw new BadRequestException('Торговля ограничена. Пройдите верификацию.');
    }
    const currency = user.tradingCurrency || 'KZT';
    const payoutCoef = await this.getPayoutCoef();
    const leverage = Math.min(125, Math.max(1, Math.floor(input.leverage || 10)));
    const entry = this.prices.tick(pair.id).price;
    const takeProfit = input.takeProfit && input.takeProfit > 0 ? input.takeProfit : null;
    const stopLoss = input.stopLoss && input.stopLoss > 0 ? input.stopLoss : null;
    const fee = stake.mul(BINARY_TRADE_FEE_RATE);
    const debit = stake.add(fee);

    const bals = await this.wallets.getBalances(userId);
    const available = D(bals.find((b) => b.currency === currency)?.available ?? 0);
    if (available.lt(debit)) {
      throw new BadRequestException(
        `Недостаточно средств: нужно ${debit.toFixed(2)} ${currency} (маржа + комиссия ${BINARY_TRADE_FEE_RATE * 100}%)`,
      );
    }

    const trade = await this.prisma.$transaction(async (tx) => {
      const created = await tx.binaryTrade.create({
        data: {
          userId,
          pairId: pair.id,
          direction,
          stake: toDb(stake),
          fee: toDb(fee),
          currency,
          entryPrice: toDb(D(entry)),
          payoutCoef: toDb(D(payoutCoef)),
          leverage,
          takeProfit: takeProfit != null ? toDb(D(takeProfit)) : null,
          stopLoss: stopLoss != null ? toDb(D(stopLoss)) : null,
          durationSec: input.durationSec,
          status: 'OPEN',
        },
      });
      await this.wallets.binaryOpenStake(
        userId,
        currency,
        toDb(debit),
        {
          refId: created.id,
          description: `Futures ${pair.id} ${direction} ${leverage}x · fee ${fee.toFixed(4)}`,
        },
        tx,
      );
      return created;
    });

    await this.log(userId, 'trade_open', {
      tradeId: trade.id,
      pair: pair.id,
      direction,
      stake: stake.toString(),
      fee: fee.toString(),
      entry,
      leverage,
      takeProfit,
      stopLoss,
      durationSec: input.durationSec,
    });

    this.scheduleSettle(trade.id, input.durationSec);
    this.realtime.emitToUser(userId, 'binary:opened', trade);

    return {
      tradeId: trade.id,
      entryPrice: Number(trade.entryPrice),
      durationSec: trade.durationSec,
      pairId: trade.pairId,
      direction: trade.direction,
      stake: trade.stake.toString(),
      fee: trade.fee.toString(),
      feeRate: BINARY_TRADE_FEE_RATE,
      leverage,
      currency,
      message: await this.formatOpenMessage(userId, trade.id),
    };
  }

  async closeTrade(userId: string, tradeId: string) {
    const trade = await this.prisma.binaryTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.userId !== userId || trade.status !== 'OPEN') {
      throw new BadRequestException('Сделка не найдена или уже закрыта');
    }
    return this.settle(tradeId, 'manual');
  }

  async listTrades(userId: string, opts: { closedOnly?: boolean; limit?: number; offset?: number } = {}) {
    const where: Prisma.BinaryTradeWhereInput = {
      userId,
      ...(opts.closedOnly ? { status: { in: ['WON', 'LOST'] } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.binaryTrade.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 20,
        skip: opts.offset ?? 0,
      }),
      this.prisma.binaryTrade.count({ where }),
    ]);
    return { items, total };
  }

  async openTrades(userId: string) {
    return this.prisma.binaryTrade.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Live chart quote: candles + entry markers, price biased by admin WIN/LOSE. */
  async chartQuote(userId: string, pairRaw: string) {
    const pairId = findBinaryPair(pairRaw)?.id ?? normalizePairId(pairRaw);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const open = await this.prisma.binaryTrade.findMany({
      where: { userId, pairId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });

    let price = this.prices.get(pairId);
    let inProfit: boolean | null = null;
    let active: null | {
      id: string;
      direction: string;
      entryPrice: number;
      durationSec: number;
      createdAt: string;
      endsAt: string;
      shouldWin: boolean;
      inProfit: boolean;
      progress: number;
      leverage: number;
      stake: string;
      fee: string;
      unrealizedPnl: number;
      takeProfit: number | null;
      stopLoss: number | null;
    } = null;

    const primary = open[0];
    if (primary) {
      const shouldWin = plannedWin(primary.id, user.outcomeMode);
      const entry = Number(primary.entryPrice);
      const lev = primary.leverage || 10;
      const bias = this.prices.biasedPrice({
        pairId,
        entry,
        direction: primary.direction as 'UP' | 'DOWN',
        shouldWin,
        createdAt: primary.createdAt,
        durationSec: primary.durationSec,
        leverage: lev,
      });
      price = bias.price;
      inProfit = bias.inProfit;
      const uPnl = this.computePnl(entry, bias.price, primary.direction, Number(primary.stake), lev);
      active = {
        id: primary.id,
        direction: primary.direction,
        entryPrice: entry,
        durationSec: primary.durationSec,
        createdAt: primary.createdAt.toISOString(),
        endsAt: new Date(primary.createdAt.getTime() + primary.durationSec * 1000).toISOString(),
        shouldWin,
        inProfit: bias.inProfit,
        progress: bias.progress,
        leverage: lev,
        stake: primary.stake.toString(),
        fee: (primary.fee ?? 0).toString(),
        unrealizedPnl: uPnl,
        takeProfit: primary.takeProfit != null ? Number(primary.takeProfit) : null,
        stopLoss: primary.stopLoss != null ? Number(primary.stopLoss) : null,
      };
    }

    const candles = this.prices.historyWithBias(pairId, primary ? price : null);
    const markers = open.map((t) => {
      const shouldWin = plannedWin(t.id, user.outcomeMode);
      const live = this.prices.biasedPrice({
        pairId,
        entry: Number(t.entryPrice),
        direction: t.direction as 'UP' | 'DOWN',
        shouldWin,
        createdAt: t.createdAt,
        durationSec: t.durationSec,
        leverage: t.leverage || 10,
      });
      return {
        tradeId: t.id,
        entryPrice: Number(t.entryPrice),
        direction: t.direction,
        createdAt: t.createdAt.toISOString(),
        inProfit: live.inProfit,
        shouldWin,
        stake: t.stake.toString(),
        durationSec: t.durationSec,
      };
    });

    return {
      pair: pairId,
      price,
      ts: Date.now() / 1000,
      candles,
      markers,
      active,
      outcomeMode: user.outcomeMode,
      inProfit,
    };
  }

  async tradeFeed(userId: string, limit = 40) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const items = await this.prisma.binaryTrade.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      items: items.map((t) => {
        const open = t.status === 'OPEN';
        let inProfit: boolean | null = null;
        if (open) {
          const shouldWin = plannedWin(t.id, user.outcomeMode);
          inProfit = this.prices.biasedPrice({
            pairId: t.pairId,
            entry: Number(t.entryPrice),
            direction: t.direction as 'UP' | 'DOWN',
            shouldWin,
            createdAt: t.createdAt,
            durationSec: t.durationSec,
            leverage: t.leverage || 10,
          }).inProfit;
        } else {
          inProfit = t.status === 'WON';
        }
        return {
          ...t,
          stake: t.stake.toString(),
          fee: (t.fee ?? 0).toString(),
          feeRate: BINARY_TRADE_FEE_RATE,
          payout: t.payout.toString(),
          entryPrice: t.entryPrice.toString(),
          exitPrice: t.exitPrice?.toString() ?? null,
          realizedPnl: t.realizedPnl?.toString?.() ?? String(t.realizedPnl ?? 0),
          takeProfit: t.takeProfit?.toString() ?? null,
          stopLoss: t.stopLoss?.toString() ?? null,
          leverage: t.leverage,
          inProfit,
          live: open,
        };
      }),
    };
  }

  private scheduleSettle(tradeId: string, delaySec: number) {
    if (this.timers.has(tradeId)) clearTimeout(this.timers.get(tradeId)!);
    const timer = setTimeout(() => {
      this.settle(tradeId).catch((e) => this.logger.error(`settle ${tradeId}: ${e}`));
    }, Math.max(0, delaySec) * 1000);
    this.timers.set(tradeId, timer);
  }

  /** Futures-style PnL: margin = stake, exposure = stake × leverage. */
  private computePnl(entry: number, exit: number, direction: string, stake: number, leverage: number) {
    const dir = direction === 'UP' ? 1 : -1;
    const lev = Math.min(125, Math.max(1, leverage || 1));
    const move = entry > 0 ? (exit - entry) / entry : 0;
    // Amplify so PnL reaches margin extremes much faster
    const boost = 3.2;
    let pnl = stake * move * dir * lev * boost;
    // Isolated margin: lose at most the margin; gain soft-cap at lev×margin
    if (pnl < -stake) pnl = -stake;
    const maxGain = stake * lev;
    if (pnl > maxGain) pnl = maxGain;
    return pnl;
  }

  private async checkTpSl() {
    const open = await this.prisma.binaryTrade.findMany({
      where: { status: 'OPEN', OR: [{ takeProfit: { not: null } }, { stopLoss: { not: null } }] },
      take: 80,
    });
    for (const t of open) {
      const user = await this.prisma.user.findUnique({ where: { id: t.userId } });
      if (!user) continue;
      const shouldWin = plannedWin(t.id, user.outcomeMode);
      const live = this.prices.biasedPrice({
        pairId: t.pairId,
        entry: Number(t.entryPrice),
        direction: t.direction as 'UP' | 'DOWN',
        shouldWin,
        createdAt: t.createdAt,
        durationSec: t.durationSec,
        leverage: t.leverage || 10,
      });
      const price = live.price;
      const tp = t.takeProfit != null ? Number(t.takeProfit) : null;
      const sl = t.stopLoss != null ? Number(t.stopLoss) : null;
      const long = t.direction === 'UP';
      if (tp != null && ((long && price >= tp) || (!long && price <= tp))) {
        await this.settle(t.id, 'tp', price);
        continue;
      }
      if (sl != null && ((long && price <= sl) || (!long && price >= sl))) {
        await this.settle(t.id, 'sl', price);
      }
    }
  }

  async settle(tradeId: string, reason = 'expiry', forcedExit?: number) {
    this.timers.delete(tradeId);
    const trade = await this.prisma.binaryTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') return;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: trade.userId } });
    const shouldWin = plannedWin(trade.id, user.outcomeMode);
    const entry = Number(trade.entryPrice);
    const leverage = trade.leverage || 10;

    let exitPrice =
      forcedExit ??
      this.prices.priceForOutcome(trade.pairId, entry, trade.direction, shouldWin, leverage);

    // For manual/tp/sl use live biased price if no forced
    if (!forcedExit && (reason === 'manual' || reason === 'tp' || reason === 'sl')) {
      exitPrice = this.prices.biasedPrice({
        pairId: trade.pairId,
        entry,
        direction: trade.direction as 'UP' | 'DOWN',
        shouldWin,
        createdAt: trade.createdAt,
        durationSec: trade.durationSec,
        leverage,
      }).price;
    }

    const stakeN = Number(trade.stake);
    const pnlN = this.computePnl(entry, exitPrice, trade.direction, stakeN, leverage);
    const credit = Math.max(0, stakeN + pnlN);
    const won = pnlN >= 0;
    const liquidated = !won && credit <= 0.0000001;

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.binaryTrade.update({
        where: { id: tradeId },
        data: {
          status: won ? BinaryTradeStatus.WON : BinaryTradeStatus.LOST,
          exitPrice: toDb(D(exitPrice)),
          payout: toDb(D(credit)),
          realizedPnl: toDb(D(pnlN)),
          closeReason: liquidated ? `${reason}:liquidation` : reason,
          settledAt: new Date(),
        },
      });
      if (credit > 0) {
        await this.wallets.binaryCreditPayout(
          trade.userId,
          trade.currency,
          toDb(D(credit)),
          { refId: tradeId, description: `Futures close ${trade.pairId} ${reason}` },
          tx,
        );
      }
      return updated;
    });

    const balances = await this.wallets.getBalances(trade.userId);
    const bal = balances.find((b) => b.currency === trade.currency)?.available ?? '0';
    const symbol = BINARY_CURRENCIES[trade.currency]?.symbol ?? trade.currency;
    const pairTitle = findBinaryPair(trade.pairId)?.title ?? trade.pairId;

    const title = liquidated
      ? 'Ликвидация позиции'
      : won
        ? 'Сделка закрыта с прибылью'
        : 'Сделка закрыта с убытком';
    const body = liquidated
      ? `${pairTitle}: маржа ${stakeN} ${symbol} списана полностью`
      : `${pairTitle}: ${pnlN >= 0 ? '+' : ''}${pnlN.toFixed(2)} ${symbol} (${reason})`;

    await this.notifications.push(trade.userId, 'BINARY_TRADE', title, body, {
      tradeId,
      won,
      liquidated,
      balance: bal,
    });
    await this.log(trade.userId, 'trade_close', {
      tradeId,
      won,
      liquidated,
      pnl: pnlN,
      credit,
      exitPrice,
      reason,
      balance: bal,
    });

    // Anchor live market to exit — prevents sharp reverse spike after DOWN/WIN etc.
    this.prices.commitPrice(trade.pairId, exitPrice);

    const settledPayload = {
      tradeId: closed.id,
      pairId: closed.pairId,
      status: won ? 'WON' : 'LOST',
      liquidated,
      balance: bal,
      symbol,
      profit: pnlN.toFixed(2),
      stake: String(stakeN),
      exitPrice,
      currency: trade.currency,
    };
    this.realtime.emitToUser(trade.userId, 'binary:settled', settledPayload);
    this.realtime.emitToUser(trade.userId, 'balance:updated', {
      balance: bal,
      symbol,
      currency: trade.currency,
    });

    if (liquidated) {
      const user = await this.prisma.user.findUnique({
        where: { id: trade.userId },
        select: { telegramId: true },
      });
      if (user?.telegramId) {
        const token =
          this.config.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || '';
        await telegramSendHtml(
          token,
          user.telegramId,
          `⚠️ <b>Ликвидация</b>\n\n` +
            `Позиция <b>${escapeTelegramHtml(pairTitle)}</b> закрыта с полной потерей маржи.\n` +
            `Маржа: <b>${stakeN} ${escapeTelegramHtml(symbol)}</b>\n` +
            `ID: <code>${tradeId}</code>`,
        );
      }
    }

    return { ...closed, balance: bal, symbol, liquidated, profit: pnlN };
  }

  private async formatOpenMessage(userId: string, tradeId: string) {
    const trade = await this.prisma.binaryTrade.findUniqueOrThrow({ where: { id: tradeId } });
    const me = await this.me(userId);
    const pair = findBinaryPair(trade.pairId)?.title ?? trade.pairId;
    const arrow = trade.direction === 'UP' ? '▲' : '▼';
    return `${arrow} ${pair} · ${formatDuration(trade.durationSec)}\nМаржа: ${trade.stake} ${me.symbol}\nКомиссия ${BINARY_TRADE_FEE_RATE * 100}%: ${trade.fee} ${me.symbol}\nЦена входа: ${Number(trade.entryPrice).toFixed(4)}\nБаланс: ${me.balance} ${me.symbol}`;
  }

  async log(userId: string, action: string, details?: Record<string, unknown>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.loggingEnabled) return;
    const row = await this.prisma.actionLog.create({
      data: {
        userId,
        action,
        details: (details ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.realtime.emitToAdmins('user:action', {
      userId,
      username: user.username,
      action,
      details: details ?? {},
      createdAt: row.createdAt,
    });
  }

  async getLogs(userId: string, limit = 50) {
    return this.prisma.actionLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---- Admin ----

  async adminListUsers(limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { isSystem: false, isPersona: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          role: true,
          status: true,
          tradingCurrency: true,
          outcomeMode: true,
          loggingEnabled: true,
          tradeLocked: true,
          kycRequired: true,
          withdrawRequireCardDeposit: true,
          pendingWithdraw: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where: { isSystem: false, isPersona: false } }),
    ]);
    const withBalances = await Promise.all(
      items.map(async (u) => {
        const bals = await this.wallets.getBalances(u.id);
        const cur = u.tradingCurrency || 'KZT';
        return {
          ...u,
          balance: bals.find((b) => b.currency === cur)?.available ?? '0',
          pendingWithdraw: u.pendingWithdraw.toString(),
        };
      }),
    );
    return { items: withBalances, total };
  }

  async adminSetOutcome(userId: string, mode: BinaryOutcomeMode) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { outcomeMode: mode },
    });
  }

  async adminMessageUser(userId: string, text: string) {
    await this.notifications.push(userId, 'SYSTEM', 'Сообщение от администрации', text);
    this.realtime.emitToUser(userId, 'notification', {
      title: 'Сообщение от администрации',
      body: text,
    });
    await this.log(userId, 'admin_message', { text });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    let telegramSent = false;
    if (user?.telegramId) {
      const token =
        this.config.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || '';
      telegramSent = await telegramSendHtml(
        token,
        user.telegramId,
        `📩 <b>Сообщение от NEXORA</b>\n\n${escapeTelegramHtml(text)}`,
      );
      if (!telegramSent) {
        this.logger.warn(`Telegram message to ${user.telegramId} failed`);
      }
    }
    return { ok: true, telegramSent };
  }

  async adminOpenTrades(limit = 50) {
    return this.prisma.binaryTrade.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, username: true, displayName: true, outcomeMode: true } },
      },
    });
  }

  /** Force WIN/LOSE on an open trade immediately (admin chart control). */
  async adminForceSettle(tradeId: string, result: 'WIN' | 'LOSE') {
    const trade = await this.prisma.binaryTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') throw new BadRequestException('Сделка не открыта');

    if (this.timers.has(tradeId)) {
      clearTimeout(this.timers.get(tradeId)!);
      this.timers.delete(tradeId);
    }

    const prev = await this.prisma.user.findUniqueOrThrow({ where: { id: trade.userId } });
    await this.prisma.user.update({
      where: { id: trade.userId },
      data: { outcomeMode: result === 'WIN' ? BinaryOutcomeMode.WIN : BinaryOutcomeMode.LOSE },
    });
    try {
      return await this.settle(tradeId);
    } finally {
      await this.prisma.user.update({
        where: { id: trade.userId },
        data: { outcomeMode: prev.outcomeMode },
      });
    }
  }

  async adminSetLogging(userId: string, enabled: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { loggingEnabled: enabled },
    });
  }

  async adminSetTradeLock(userId: string, locked: boolean, kycRequired?: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        tradeLocked: locked,
        ...(kycRequired != null ? { kycRequired } : { kycRequired: locked }),
      },
    });
  }

  async adminSetWithdrawCardGate(userId: string, required: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { withdrawRequireCardDeposit: required },
    });
  }

  async adminUserStats(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        tradingCurrency: true,
        outcomeMode: true,
        loggingEnabled: true,
        tradeLocked: true,
        kycRequired: true,
        withdrawRequireCardDeposit: true,
        createdAt: true,
        lastLoginAt: true,
        telegram: true,
        telegramId: true,
      },
    });
    const [open, won, lost, volumeAgg, pnlAgg, logs, bals] = await Promise.all([
      this.prisma.binaryTrade.count({ where: { userId, status: 'OPEN' } }),
      this.prisma.binaryTrade.count({ where: { userId, status: 'WON' } }),
      this.prisma.binaryTrade.count({ where: { userId, status: 'LOST' } }),
      this.prisma.binaryTrade.aggregate({ where: { userId }, _sum: { stake: true } }),
      this.prisma.binaryTrade.aggregate({
        where: { userId, status: { in: ['WON', 'LOST'] } },
        _sum: { realizedPnl: true },
      }),
      this.getLogs(userId, 100),
      this.wallets.getBalances(userId),
    ]);
    return {
      user,
      stats: {
        open,
        won,
        lost,
        volume: volumeAgg._sum.stake?.toString() ?? '0',
        realizedPnl: pnlAgg._sum.realizedPnl?.toString() ?? '0',
      },
      balances: bals,
      logs,
    };
  }

  async adminSetBalance(userId: string, amount: number, adminId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const currency = user.tradingCurrency || 'KZT';
    const bals = await this.wallets.getBalances(userId);
    const current = D(bals.find((b) => b.currency === currency)?.available ?? 0);
    const target = D(amount);
    const delta = target.minus(current);
    if (!delta.isZero()) {
      await this.prisma.$transaction(async (tx) => {
        await this.wallets.adjust(
          userId,
          currency,
          toDb(delta),
          { refType: 'admin_binary_balance', createdById: adminId, description: 'Admin set binary balance' },
          tx,
        );
      });
    }
    await this.log(userId, 'admin_set_balance', { amount, currency, adminId });
    return this.me(userId);
  }

  async adminStats() {
    const [users, openTrades, won, lost, volume] = await Promise.all([
      this.prisma.user.count({ where: { isSystem: false, isPersona: false } }),
      this.prisma.binaryTrade.count({ where: { status: 'OPEN' } }),
      this.prisma.binaryTrade.count({ where: { status: 'WON' } }),
      this.prisma.binaryTrade.count({ where: { status: 'LOST' } }),
      this.prisma.binaryTrade.aggregate({ _sum: { stake: true } }),
    ]);
    return {
      users,
      openTrades,
      won,
      lost,
      volume: volume._sum.stake?.toString() ?? '0',
      payoutCoef: await this.getPayoutCoef(),
    };
  }

  /**
   * Generate ~6 months of fake deposits / withdrawals / trades for the admin
   * (status / history showcase). Idempotent-ish: tagged via reviewNote/closeReason.
   */
  async adminSeedFakeHistory(adminId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const currency = user.tradingCurrency || 'RUB';
    await this.wallets.ensureWallet(adminId, currency);

    const pairs = BINARY_PAIRS.filter((p) => p.kind === 'crypto').map((p) => p.id);
    const now = Date.now();
    const day = 86_400_000;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    const withdrawAmounts: number[] = [];
    for (let i = 0; i < 48; i++) {
      const style = i % 5;
      if (style === 0) withdrawAmounts.push(Math.round(rnd(50_000, 700_000)));
      else if (style === 1) withdrawAmounts.push(Math.round(rnd(50_000, 700_000) * 100) / 100);
      else if (style === 2) withdrawAmounts.push(pick([100_000, 150_000, 200_000, 250_000, 300_000, 500_000, 700_000]));
      else if (style === 3) withdrawAmounts.push(Math.round(rnd(52_340.12, 689_999.87) * 100) / 100);
      else withdrawAmounts.push(Math.floor(rnd(55_000, 680_000) / 1000) * 1000 + 0.5);
    }

    const depositAmounts: number[] = [];
    for (let i = 0; i < 70; i++) {
      const style = i % 4;
      if (style === 0) depositAmounts.push(Math.round(rnd(15_000, 450_000)));
      else if (style === 1) depositAmounts.push(Math.round(rnd(10_000, 400_000) * 100) / 100);
      else if (style === 2) depositAmounts.push(pick([25_000, 50_000, 75_000, 100_000, 200_000, 350_000]));
      else depositAmounts.push(Math.round(rnd(18_250.4, 399_999.6) * 100) / 100);
    }

    let deposits = 0;
    let withdrawals = 0;
    let trades = 0;

    await this.prisma.$transaction(async (tx) => {
      // clear previous fake batch for this user
      await tx.depositRequest.deleteMany({
        where: { userId: adminId, reviewNote: 'FAKE_HISTORY' },
      });
      await tx.withdrawalRequest.deleteMany({
        where: { userId: adminId, reviewNote: 'FAKE_HISTORY' },
      });
      await tx.binaryTrade.deleteMany({
        where: { userId: adminId, closeReason: 'fake_history' },
      });

      for (let i = 0; i < depositAmounts.length; i++) {
        const createdAt = new Date(now - rnd(1, 180) * day - rnd(0, day));
        const amount = depositAmounts[i];
        const method = i % 3 === 0 ? 'CRYPTO' : 'CARD_P2P';
        await tx.depositRequest.create({
          data: {
            userId: adminId,
            currency,
            amount: toDb(D(amount)),
            method,
            status: 'APPROVED',
            requisites: method === 'CRYPTO' ? 'USDT TRC20\nTFakeDemoAddressForHistory0001' : 'Карта · 4276 **** **** 8812',
            reviewNote: 'FAKE_HISTORY',
            reviewedAt: createdAt,
            reviewedById: adminId,
            createdAt,
            updatedAt: createdAt,
          },
        });
        deposits++;
      }

      for (let i = 0; i < withdrawAmounts.length; i++) {
        const createdAt = new Date(now - rnd(1, 175) * day - rnd(0, day));
        const amount = withdrawAmounts[i];
        const crypto = i % 4 === 0;
        await tx.withdrawalRequest.create({
          data: {
            userId: adminId,
            currency,
            amount: toDb(D(amount)),
            destination: crypto
              ? `Способ: Криптовалюта\nАдрес: TFakeWithdraw${String(i).padStart(4, '0')}xxxx`
              : `Способ: Банковская карта\nРеквизиты: 2200 ${String(1000 + i).slice(-4)} **** ${String(2000 + i).slice(-4)}\nПолучатель: Тест Пользователь`,
            status: 'APPROVED',
            reviewNote: 'FAKE_HISTORY',
            reviewedAt: createdAt,
            reviewedById: adminId,
            createdAt,
            updatedAt: createdAt,
          },
        });
        withdrawals++;
      }

      const tradeCount = 260;
      for (let i = 0; i < tradeCount; i++) {
        const createdAt = new Date(now - rnd(0.5, 180) * day - rnd(0, day));
        const durationSec = pick([60, 300, 900, 1800, 3600]);
        const settledAt = new Date(createdAt.getTime() + durationSec * 1000);
        const direction = Math.random() > 0.48 ? BinaryDirection.UP : BinaryDirection.DOWN;
        const won = Math.random() > 0.42;
        const stake = Math.round(rnd(500, 85_000) * (Math.random() > 0.7 ? 100 : 1)) / (Math.random() > 0.5 ? 1 : 100);
        const stakeN = Math.max(100, stake);
        const leverage = pick([5, 10, 20, 50, 100]);
        const entry = rnd(0.05, 70000);
        const move = rnd(0.001, 0.04) * (won ? 1 : -1);
        const exit =
          direction === BinaryDirection.UP ? entry * (1 + move) : entry * (1 - move);
        const pnl = this.computePnl(entry, exit, direction, stakeN, leverage);
        const credit = Math.max(0, stakeN + pnl);
        await tx.binaryTrade.create({
          data: {
            userId: adminId,
            pairId: pick(pairs),
            direction,
            stake: toDb(D(stakeN)),
            currency,
            entryPrice: toDb(D(entry)),
            exitPrice: toDb(D(exit)),
            payout: toDb(D(credit)),
            payoutCoef: toDb(D(1)),
            leverage,
            realizedPnl: toDb(D(pnl)),
            closeReason: 'fake_history',
            status: won || pnl >= 0 ? BinaryTradeStatus.WON : BinaryTradeStatus.LOST,
            durationSec,
            settledAt,
            createdAt,
            updatedAt: settledAt,
          },
        });
        trades++;
      }
    });

    // showcase balance
    await this.adminSetBalance(adminId, Math.round(rnd(1_250_000, 3_800_000) * 100) / 100, adminId);

    return { ok: true, deposits, withdrawals, trades, currency };
  }
}
