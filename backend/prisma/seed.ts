import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const BASE_ASSET = process.env.BASE_ASSET ?? 'USDT';
const BASE_FIAT = process.env.BASE_FIAT ?? 'KZT';

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

async function creditHouse(currency: string, amount: string) {
  const system = await prisma.user.findFirstOrThrow({ where: { isSystem: true } });
  const houseWallet = await ensureWallet(system.id, currency, 'HOUSE');
  await prisma.wallet.update({
    where: { id: houseWallet.id },
    data: { available: { increment: amount } },
  });
}

async function main() {
  console.log('Seeding database...');

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
  await creditHouse(BASE_ASSET, '1000000');
  await creditHouse(BASE_FIAT, '50000000');

  for (const { currency, amount } of [
    { currency: 'BTC', amount: '100' },
    { currency: 'ETH', amount: '5000' },
    { currency: 'SOL', amount: '50000' },
    { currency: 'XRP', amount: '1000000' },
    { currency: 'BNB', amount: '10000' },
    { currency: 'ADA', amount: '5000000' },
    { currency: 'DOGE', amount: '50000000' },
    { currency: 'TON', amount: '500000' },
  ]) {
    await ensureWallet(system.id, currency, 'HOUSE');
    await creditHouse(currency, amount);
  }

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

  const platformPms = [];
  for (const p of [
    { type: 'CARD' as const, bankName: 'Kaspi Bank', details: 'Kaspi · перевод' },
    { type: 'CARD' as const, bankName: 'Halyk Bank', details: 'Halyk · карта' },
    { type: 'CARD' as const, bankName: 'Visa', details: 'Visa · международная' },
  ]) {
    let pm = await prisma.paymentMethod.findFirst({
      where: { userId: system.id, bankName: p.bankName },
    });
    if (!pm) {
      pm = await prisma.paymentMethod.create({
        data: {
          userId: system.id,
          type: p.type,
          bankName: p.bankName,
          holderName: 'NEXORA OTC',
          details: p.details,
          fiat: BASE_FIAT,
          isActive: true,
        },
      });
    }
    platformPms.push(pm);
  }

  const personas = [
    { username: 'alpha_trader', displayName: 'AlphaTrader', rating: '0.98', deals: 312 },
    { username: 'crypto_king', displayName: 'CryptoKing', rating: '0.96', deals: 528 },
    { username: 'safe_exchange', displayName: 'SafeExchange', rating: '0.99', deals: 891 },
    { username: 'kzt_master', displayName: 'KZTMaster', rating: '0.97', deals: 156 },
  ];

  for (const p of personas) {
    const persona = await prisma.user.upsert({
      where: { username: p.username },
      update: { personaRating: p.rating, personaDealsCount: p.deals },
      create: {
        username: p.username,
        role: 'TRADER',
        status: 'ACTIVE',
        isPersona: true,
        displayName: p.displayName,
        personaRating: p.rating,
        personaDealsCount: p.deals,
        createdById: admin.id,
      },
    });
    await ensureWallet(persona.id, BASE_ASSET, 'USER');
    await creditUser(persona.id, BASE_ASSET, '50000');

    const existingAd = await prisma.advertisement.findFirst({
      where: { userId: persona.id, isPlatform: true },
    });
    if (!existingAd) {
      await prisma.advertisement.create({
        data: {
          userId: persona.id,
          side: 'SELL',
          asset: BASE_ASSET,
          fiat: BASE_FIAT,
          isPlatform: true,
          isFloating: false,
          price: (499.5 + Math.random() * 2).toFixed(2),
          totalAmount: '5000000',
          availableAmount: '5000000',
          minFiat: '10000',
          maxFiat: '500000',
          terms: 'Мгновенная обработка оператором NEXORA',
          city: 'Алматы',
          bankName: 'Kaspi / Halyk',
          paymentWindowMin: 15,
          paymentMethods: {
            create: platformPms.map((pm) => ({ paymentMethodId: pm.id })),
          },
        },
      });
    }
  }

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
    await creditUser(trader.id, BASE_ASSET, '5000');
    await creditUser(trader.id, BASE_FIAT, '500000');

    const pm = await prisma.paymentMethod.create({
      data: {
        userId: trader.id,
        type: 'CARD',
        bankName: 'Kaspi Bank',
        holderName: t.displayName,
        details: '2202 2020 1111 2222',
        fiat: BASE_FIAT,
      },
    });

    const hasUserAd = await prisma.advertisement.findFirst({
      where: { userId: trader.id, isPlatform: false },
    });
    if (!hasUserAd) {
      await prisma.advertisement.create({
        data: {
          userId: trader.id,
          side: t.username === 'trader1' ? 'BUY' : 'SELL',
          asset: BASE_ASSET,
          fiat: BASE_FIAT,
          isPlatform: false,
          isFloating: false,
          price: t.username === 'trader1' ? '480' : '499.8',
          totalAmount: t.username === 'trader1' ? '480000' : '250000',
          availableAmount: t.username === 'trader1' ? '480000' : '250000',
          minFiat: '10000',
          maxFiat: '200000',
          city: 'Алматы',
          bankName: 'Kaspi Bank',
          terms: 'OTC-заявка клиента — обрабатывается оператором',
          paymentWindowMin: 30,
          paymentMethods: { create: [{ paymentMethodId: pm.id }] },
        },
      });
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: `rate:${BASE_ASSET}/${BASE_FIAT}` },
    update: { value: process.env.RATE_STATIC_USDT_KZT ?? '495' },
    create: { key: `rate:${BASE_ASSET}/${BASE_FIAT}`, value: process.env.RATE_STATIC_USDT_KZT ?? '495' },
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
