import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateTraderDto, ResetPasswordDto, UpdateUserDto } from './dto/users.dto';

const userSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  telegram: true,
  role: true,
  status: true,
  takerFee: true,
  makerFee: true,
  spread: true,
  dailyTradeLimit: true,
  maxOpenDeals: true,
  totpEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  countryCode: true,
  preferredFiat: true,
  preferredAsset: true,
  locale: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
    private readonly config: ConfigService,
  ) {}

  async createTrader(dto: CreateTraderDto, createdById: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('Такой логин уже занят');

    const passwordHash = await AuthService.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        telegram: dto.telegram,
        role: 'TRADER',
        status: 'ACTIVE',
        createdById,
        takerFee: dto.takerFee,
        makerFee: dto.makerFee,
        spread: dto.spread,
        dailyTradeLimit: dto.dailyTradeLimit,
        maxOpenDeals: dto.maxOpenDeals ?? 5,
      },
      select: userSelect,
    });

    // Provision wallets for the base asset and fiat.
    const baseAsset = this.config.get<string>('economics.baseAsset') ?? 'USDT';
    const baseFiat = this.config.get<string>('economics.baseFiat') ?? 'KZT';
    await this.wallets.ensureWallet(user.id, baseAsset);
    await this.wallets.ensureWallet(user.id, baseFiat);

    return user;
  }

  async list() {
    return this.prisma.user.findMany({
      where: { isSystem: false },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async getWithBalances(id: string) {
    const user = await this.getById(id);
    const balances = await this.wallets.getBalances(id);
    return { ...user, balances };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.isSystem) throw new BadRequestException('Системный аккаунт нельзя изменять');

    const data: Prisma.UserUpdateInput = {
      displayName: dto.displayName,
      telegram: dto.telegram,
      takerFee: dto.takerFee,
      makerFee: dto.makerFee,
      spread: dto.spread,
      dailyTradeLimit: dto.dailyTradeLimit,
      maxOpenDeals: dto.maxOpenDeals,
    };
    if (dto.blocked !== undefined) {
      data.status = dto.blocked ? 'BLOCKED' : 'ACTIVE';
    }

    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const passwordHash = await AuthService.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  /** Resolve effective fee/spread for a user, falling back to platform defaults. */
  async getEffectiveEconomics(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const defaults = this.config.get('economics') as {
      defaultTakerFee: number;
      defaultMakerFee: number;
      defaultSpread: number;
    };
    return {
      takerFee: user?.takerFee ? Number(user.takerFee) : defaults.defaultTakerFee,
      makerFee: user?.makerFee ? Number(user.makerFee) : defaults.defaultMakerFee,
      spread: user?.spread ? Number(user.spread) : defaults.defaultSpread,
    };
  }
}
