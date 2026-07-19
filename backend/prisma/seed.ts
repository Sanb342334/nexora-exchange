import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const BASE_ASSET = process.env.BASE_ASSET ?? 'USDT';
const BASE_FIAT = process.env.BASE_FIAT ?? 'RUB';

async function ensureWallet(userId: string, currency: string, type: 'USER' | 'HOUSE') {
  const existing = await prisma.wallet.findUnique({
    where: { userId_currency: { userId, currency } },
  });
  if (existing) return existing;
  return prisma.wallet.create({ data: { userId, currency, type } });
}

async function creditUser(userId: string, currency: string, amount: string) {
  const system = await prisma.user.findFirstOrThrow({ where: { isSystem: true } });
  const houseWallet = await ensureWallet(system.id, currency, 'HOUSE');
  const userWallet = await ensureWallet(userId, currency, 'USER');

  await prisma.$transaction(async (tx) => {
    const tr = await tx.ledgerTransaction.create({
      data: { type: 'DEPOSIT', currency, refType: 'seed', description: 'Seed credit' },
    });
    const house = await tx.wallet.update({
      where: { id: houseWallet.id },
      data: { available: { decrement: amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        transactionId: tr.id,
        walletId: houseWallet.id,
        currency,
        availableDelta: `-${amount}`,
        frozenDelta: '0',
        availableAfter: house.available.toString(),
        frozenAfter: house.frozen.toString(),
      },
    });
    const user = await tx.wallet.update({
      where: { id: userWallet.id },
      data: { available: { increment: amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        transactionId: tr.id,
        walletId: userWallet.id,
        currency,
        availableDelta: amount,
        frozenDelta: '0',
        availableAfter: user.available.toString(),
        frozenAfter: user.frozen.toString(),
      },
    });
  });
}

async function main() {
  console.log('Seeding database...');

  // 1) System (house) account
  const system = await prisma.user.upsert({
    where: { username: 'system' },
    update: {},
    create: {
      username: 'system',
      role: 'SYSTEM',
      status: 'ACTIVE',
      isSystem: true,
      displayName: 'House / Treasury',
    },
  });
  await ensureWallet(system.id, BASE_ASSET, 'HOUSE');
  await ensureWallet(system.id, BASE_FIAT, 'HOUSE');

  // 2) Admin (platform owner)
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin12345!';
  const adminHash = await argon2.hash(adminPassword);
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      email: process.env.ADMIN_EMAIL ?? 'admin@p2p.local',
      passwordHash: adminHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      displayName: 'Администратор',
    },
  });
  await ensureWallet(admin.id, BASE_ASSET, 'USER');
  await ensureWallet(admin.id, BASE_FIAT, 'USER');

  // 3) Demo traders
  const demoPassword = 'Trader12345!';
  const demoHash = await argon2.hash(demoPassword);
  const traders = [
    { username: 'trader1', displayName: 'Иван Трейдер' },
    { username: 'trader2', displayName: 'Мария Трейдер' },
  ];

  for (const t of traders) {
    const trader = await prisma.user.upsert({
      where: { username: t.username },
      update: {},
      create: {
        username: t.username,
        passwordHash: demoHash,
        role: 'TRADER',
        status: 'ACTIVE',
        displayName: t.displayName,
        createdById: admin.id,
      },
    });
    await ensureWallet(trader.id, BASE_ASSET, 'USER');
    await ensureWallet(trader.id, BASE_FIAT, 'USER');

    // Give demo balances
    await creditUser(trader.id, BASE_ASSET, '5000');
    await creditUser(trader.id, BASE_FIAT, '500000');

    // Payment method + sample ad
    const pm = await prisma.paymentMethod.create({
      data: {
        userId: trader.id,
        type: 'CARD',
        bankName: 'Sber',
        holderName: t.displayName,
        details: '2202 2020 1111 2222',
        fiat: BASE_FIAT,
      },
    });

    await prisma.advertisement.create({
      data: {
        userId: trader.id,
        side: t.username === 'trader1' ? 'SELL' : 'BUY',
        asset: BASE_ASSET,
        fiat: BASE_FIAT,
        isFloating: t.username === 'trader1',
        price: t.username === 'trader1' ? null : '94.5',
        floatingMargin: t.username === 'trader1' ? '0.015' : null,
        totalAmount: '100000',
        availableAmount: '100000',
        minFiat: '1000',
        maxFiat: '50000',
        terms: 'Оплата в течение 15 минут. Только по указанным реквизитам.',
        paymentWindowMin: 15,
        paymentMethods: { create: [{ paymentMethodId: pm.id }] },
      },
    });
  }

  // 4) Default platform settings
  await prisma.systemSetting.upsert({
    where: { key: `rate:${BASE_ASSET}/${BASE_FIAT}` },
    update: {},
    create: { key: `rate:${BASE_ASSET}/${BASE_FIAT}`, value: process.env.RATE_STATIC_USDT_RUB ?? '95' },
  });

  console.log('Seed complete.');
  console.log(`Admin login:  ${adminUsername} / ${adminPassword}`);
  console.log(`Trader login: trader1 / ${demoPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
