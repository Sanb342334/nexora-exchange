import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerTxType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { D, toDb, ZERO } from '../../common/money';

export type Tx = Prisma.TransactionClient;

interface EntryInput {
  walletId: string;
  availableDelta: Prisma.Decimal.Value;
  frozenDelta: Prisma.Decimal.Value;
}

interface PostOptions {
  type: LedgerTxType;
  currency: string;
  refType?: string;
  refId?: string;
  description?: string;
  createdById?: string;
}

/**
 * Wallet & double-entry ledger engine.
 *
 * Every balance mutation goes through `post()`, which:
 *  - validates that the transaction is balanced (sum of deltas per currency == 0),
 *  - updates wallet available/frozen atomically,
 *  - forbids negative available/frozen balances,
 *  - appends immutable LedgerEntry rows with the resulting balances.
 *
 * The SYSTEM (house) account is the counterparty for external deposits and
 * withdrawals so the ledger always stays balanced.
 */
@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx): Tx | PrismaService {
    return tx ?? this.prisma;
  }

  async ensureWallet(
    userId: string,
    currency: string,
    type: 'USER' | 'HOUSE' = 'USER',
    tx?: Tx,
  ) {
    const client = this.db(tx);
    const existing = await client.wallet.findUnique({
      where: { userId_currency: { userId, currency } },
    });
    if (existing) return existing;
    return client.wallet.create({ data: { userId, currency, type } });
  }

  async getSystemUserId(tx?: Tx): Promise<string> {
    const client = this.db(tx);
    const system = await client.user.findFirst({ where: { isSystem: true } });
    if (!system) {
      throw new BadRequestException('Системный (house) аккаунт не инициализирован. Запустите seed.');
    }
    return system.id;
  }

  async getBalances(userId: string) {
    const wallets = await this.prisma.wallet.findMany({ where: { userId } });
    return wallets.map((w) => ({
      currency: w.currency,
      available: w.available.toString(),
      frozen: w.frozen.toString(),
      total: D(w.available).plus(D(w.frozen)).toString(),
    }));
  }

  async getWallet(userId: string, currency: string, tx?: Tx) {
    return this.ensureWallet(userId, currency, 'USER', tx);
  }

  /**
   * Core primitive: apply a set of balanced entries in one ledger transaction.
   * Must be called inside a DB transaction for multi-entry movements.
   */
  async post(entries: EntryInput[], options: PostOptions, tx: Tx) {
    // 1) Balance invariant per currency.
    const net = entries.reduce(
      (acc, e) => acc.plus(D(e.availableDelta)).plus(D(e.frozenDelta)),
      ZERO,
    );
    if (!net.isZero()) {
      throw new BadRequestException(
        `Небалансированная леджер-транзакция (сумма дельт = ${net.toString()})`,
      );
    }

    const ledgerTx = await tx.ledgerTransaction.create({
      data: {
        type: options.type,
        currency: options.currency,
        refType: options.refType,
        refId: options.refId,
        description: options.description,
        createdById: options.createdById,
      },
    });

    for (const entry of entries) {
      const wallet = await tx.wallet.findUnique({ where: { id: entry.walletId } });
      if (!wallet) throw new BadRequestException('Кошелёк не найден');

      const newAvailable = D(wallet.available).plus(D(entry.availableDelta));
      const newFrozen = D(wallet.frozen).plus(D(entry.frozenDelta));

      // House wallets may go negative (they represent platform liability/treasury).
      if (wallet.type === 'USER') {
        if (newAvailable.isNegative()) {
          throw new BadRequestException('Недостаточно средств на балансе');
        }
        if (newFrozen.isNegative()) {
          throw new BadRequestException('Недостаточно замороженных средств');
        }
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { available: toDb(newAvailable), frozen: toDb(newFrozen) },
      });

      await tx.ledgerEntry.create({
        data: {
          transactionId: ledgerTx.id,
          walletId: wallet.id,
          currency: wallet.currency,
          availableDelta: toDb(D(entry.availableDelta)),
          frozenDelta: toDb(D(entry.frozenDelta)),
          availableAfter: toDb(newAvailable),
          frozenAfter: toDb(newFrozen),
        },
      });
    }

    return ledgerTx;
  }

  // -------- High-level operations --------

  /** External deposit: house -> user available. */
  async deposit(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string; createdById?: string },
    tx: Tx,
  ) {
    const userWallet = await this.ensureWallet(userId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);
    return this.post(
      [
        { walletId: houseWallet.id, availableDelta: D(amount).negated(), frozenDelta: 0 },
        { walletId: userWallet.id, availableDelta: amount, frozenDelta: 0 },
      ],
      { type: LedgerTxType.DEPOSIT, currency, ...ref },
      tx,
    );
  }

  /** External withdrawal: user available -> house. */
  async withdraw(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string; createdById?: string },
    tx: Tx,
  ) {
    const userWallet = await this.ensureWallet(userId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);
    return this.post(
      [
        { walletId: userWallet.id, availableDelta: D(amount).negated(), frozenDelta: 0 },
        { walletId: houseWallet.id, availableDelta: amount, frozenDelta: 0 },
      ],
      { type: LedgerTxType.WITHDRAWAL, currency, ...ref },
      tx,
    );
  }

  /** Lock available -> frozen within a single wallet (escrow hold). */
  async lock(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: D(amount).negated(), frozenDelta: amount }],
      { type: LedgerTxType.ESCROW_LOCK, currency, ...ref },
      tx,
    );
  }

  /** Unlock frozen -> available (escrow refund/cancel). */
  async unlock(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: amount, frozenDelta: D(amount).negated() }],
      { type: LedgerTxType.ESCROW_REFUND, currency, ...ref },
      tx,
    );
  }

  /**
   * Release escrow: seller frozen -> buyer available (net) + platform fee to house.
   * amount = full escrow amount; fee is taken from it.
   */
  async releaseEscrow(
    params: {
      sellerId: string;
      buyerId: string;
      currency: string;
      amount: Prisma.Decimal.Value;
      fee: Prisma.Decimal.Value;
      refType?: string;
      refId?: string;
    },
    tx: Tx,
  ) {
    const { sellerId, buyerId, currency, amount, fee, refType, refId } = params;
    const net = D(amount).minus(D(fee));
    if (net.isNegative()) throw new BadRequestException('Комиссия превышает сумму сделки');

    const sellerWallet = await this.ensureWallet(sellerId, currency, 'USER', tx);
    const buyerWallet = await this.ensureWallet(buyerId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);

    const entries: EntryInput[] = [
      { walletId: sellerWallet.id, availableDelta: 0, frozenDelta: D(amount).negated() },
      { walletId: buyerWallet.id, availableDelta: net, frozenDelta: 0 },
    ];
    if (D(fee).gt(0)) {
      entries.push({ walletId: houseWallet.id, availableDelta: fee, frozenDelta: 0 });
    }

    return this.post(
      entries,
      { type: LedgerTxType.ESCROW_RELEASE, currency, refType, refId },
      tx,
    );
  }

  /** Hold funds for a pending withdrawal: available -> frozen. */
  async holdForWithdrawal(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: D(amount).negated(), frozenDelta: amount }],
      { type: LedgerTxType.WITHDRAWAL, currency, ...ref, description: 'Hold for withdrawal' },
      tx,
    );
  }

  /** Release a withdrawal hold back to available (rejected/cancelled). */
  async releaseWithdrawalHold(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: amount, frozenDelta: D(amount).negated() }],
      { type: LedgerTxType.WITHDRAWAL, currency, ...ref, description: 'Release withdrawal hold' },
      tx,
    );
  }

  /** Settle an approved withdrawal: user frozen -> house. */
  async settleWithdrawal(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string; createdById?: string },
    tx: Tx,
  ) {
    const userWallet = await this.ensureWallet(userId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);
    return this.post(
      [
        { walletId: userWallet.id, availableDelta: 0, frozenDelta: D(amount).negated() },
        { walletId: houseWallet.id, availableDelta: amount, frozenDelta: 0 },
      ],
      { type: LedgerTxType.WITHDRAWAL, currency, ...ref },
      tx,
    );
  }

  /** Admin manual adjustment (credit/debit) against the house account. */
  async adjust(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value, // positive = credit user, negative = debit user
    ref: { refType?: string; refId?: string; createdById?: string; description?: string },
    tx: Tx,
  ) {
    const userWallet = await this.ensureWallet(userId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);
    return this.post(
      [
        { walletId: userWallet.id, availableDelta: amount, frozenDelta: 0 },
        { walletId: houseWallet.id, availableDelta: D(amount).negated(), frozenDelta: 0 },
      ],
      { type: LedgerTxType.ADJUSTMENT, currency, ...ref },
      tx,
    );
  }

  async getLedger(userId: string, limit = 100) {
    const wallets = await this.prisma.wallet.findMany({ where: { userId } });
    const walletIds = wallets.map((w) => w.id);
    return this.prisma.ledgerEntry.findMany({
      where: { walletId: { in: walletIds } },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Row-level lock to prevent concurrent double-spend on the same wallets. */
  private async lockWalletRows(walletIds: string[], tx: Tx) {
    for (const id of [...walletIds].sort()) {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${id} FOR UPDATE`;
    }
  }

  async lockSpot(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    await this.lockWalletRows([wallet.id], tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: D(amount).negated(), frozenDelta: amount }],
      { type: LedgerTxType.SPOT_LOCK, currency, ...ref },
      tx,
    );
  }

  async unlockSpot(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    await this.lockWalletRows([wallet.id], tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: amount, frozenDelta: D(amount).negated() }],
      { type: LedgerTxType.SPOT_UNLOCK, currency, ...ref },
      tx,
    );
  }

  async settleSpotFill(
    params: {
      userId: string;
      base: string;
      quote: string;
      side: 'BUY' | 'SELL';
      quantity: Prisma.Decimal.Value;
      quoteAmount: Prisma.Decimal.Value;
      feeAmount: Prisma.Decimal.Value;
      refId: string;
    },
    tx: Tx,
  ) {
    const { userId, base, quote, side, quantity, quoteAmount, feeAmount, refId } = params;
    const systemId = await this.getSystemUserId(tx);
    const userBase = await this.ensureWallet(userId, base, 'USER', tx);
    const userQuote = await this.ensureWallet(userId, quote, 'USER', tx);
    const houseBase = await this.ensureWallet(systemId, base, 'HOUSE', tx);
    const houseQuote = await this.ensureWallet(systemId, quote, 'HOUSE', tx);

    await this.lockWalletRows([userBase.id, userQuote.id, houseBase.id, houseQuote.id], tx);

    const freshHouseBase = await tx.wallet.findUniqueOrThrow({ where: { id: houseBase.id } });
    const freshHouseQuote = await tx.wallet.findUniqueOrThrow({ where: { id: houseQuote.id } });

    const qty = D(quantity);
    const quoteAmt = D(quoteAmount);
    const fee = D(feeAmount);

    if (side === 'BUY') {
      if (D(freshHouseBase.available).lt(qty)) {
        throw new BadRequestException('Insufficient house liquidity');
      }
      const debitQuote = quoteAmt.plus(fee);
      return this.post(
        [
          { walletId: userQuote.id, availableDelta: 0, frozenDelta: debitQuote.negated() },
          { walletId: userBase.id, availableDelta: qty, frozenDelta: 0 },
          { walletId: houseQuote.id, availableDelta: debitQuote, frozenDelta: 0 },
          { walletId: houseBase.id, availableDelta: qty.negated(), frozenDelta: 0 },
        ],
        { type: LedgerTxType.SPOT_FILL, currency: quote, refType: 'spot_trade', refId },
        tx,
      );
    }

    if (D(freshHouseQuote.available).lt(quoteAmt)) {
      throw new BadRequestException('Insufficient house liquidity');
    }
    const creditQuote = quoteAmt.minus(fee);
    return this.post(
      [
        { walletId: userBase.id, availableDelta: 0, frozenDelta: qty.negated() },
        { walletId: userQuote.id, availableDelta: creditQuote, frozenDelta: 0 },
        { walletId: houseBase.id, availableDelta: qty, frozenDelta: 0 },
        { walletId: houseQuote.id, availableDelta: creditQuote.negated(), frozenDelta: 0 },
      ],
      { type: LedgerTxType.SPOT_FILL, currency: base, refType: 'spot_trade', refId },
      tx,
    );
  }

  async lockFuturesMargin(
    userId: string,
    currency: string,
    amount: Prisma.Decimal.Value,
    ref: { refType?: string; refId?: string },
    tx: Tx,
  ) {
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    await this.lockWalletRows([wallet.id], tx);
    return this.post(
      [{ walletId: wallet.id, availableDelta: D(amount).negated(), frozenDelta: amount }],
      { type: LedgerTxType.FUTURES_LOCK, currency, ...ref },
      tx,
    );
  }

  async settleFuturesClose(
    params: {
      userId: string;
      currency: string;
      margin: Prisma.Decimal.Value;
      pnl: Prisma.Decimal.Value;
      refId: string;
    },
    tx: Tx,
  ) {
    const { userId, currency, margin, pnl, refId } = params;
    const wallet = await this.ensureWallet(userId, currency, 'USER', tx);
    const systemId = await this.getSystemUserId(tx);
    const houseWallet = await this.ensureWallet(systemId, currency, 'HOUSE', tx);
    await this.lockWalletRows([wallet.id, houseWallet.id], tx);

    const credit = D(margin).plus(pnl);
    const houseDelta = credit.negated();

    return this.post(
      [
        { walletId: wallet.id, availableDelta: credit, frozenDelta: D(margin).negated() },
        { walletId: houseWallet.id, availableDelta: houseDelta, frozenDelta: 0 },
      ],
      { type: LedgerTxType.FUTURES_PNL, currency, refType: 'futures_position', refId },
      tx,
    );
  }
}
