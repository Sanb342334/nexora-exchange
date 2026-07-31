import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const KEYS = {
  minDeposit: 'min_deposit',
  minWithdrawal: 'min_withdrawal',
  minTrade: 'min_trade',
} as const;

const DEFAULTS = {
  minDeposit: 1000,
  minWithdrawal: 1000,
  minTrade: 10,
} as const;

@Injectable()
export class PlatformLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row?.value) return fallback;
    const n = Number(row.value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  private async setNumber(key: string, value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Значение должно быть числом ≥ 0');
    }
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
    return value;
  }

  async getAll() {
    const [minDeposit, minWithdrawal, minTrade] = await Promise.all([
      this.getNumber(KEYS.minDeposit, DEFAULTS.minDeposit),
      this.getNumber(KEYS.minWithdrawal, DEFAULTS.minWithdrawal),
      this.getNumber(KEYS.minTrade, DEFAULTS.minTrade),
    ]);
    return { minDeposit, minWithdrawal, minTrade };
  }

  getMinDeposit() {
    return this.getNumber(KEYS.minDeposit, DEFAULTS.minDeposit);
  }

  getMinWithdrawal() {
    return this.getNumber(KEYS.minWithdrawal, DEFAULTS.minWithdrawal);
  }

  getMinTrade() {
    return this.getNumber(KEYS.minTrade, DEFAULTS.minTrade);
  }

  setMinDeposit(value: number) {
    return this.setNumber(KEYS.minDeposit, value);
  }

  setMinWithdrawal(value: number) {
    return this.setNumber(KEYS.minWithdrawal, value);
  }

  setMinTrade(value: number) {
    return this.setNumber(KEYS.minTrade, value);
  }
}
