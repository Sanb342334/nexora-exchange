import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { isAllowedCountry, isFiatAllowedForCountry } from '../../common/countries';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { TokenService } from './token.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly wallets: WalletsService,
    private readonly config: ConfigService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async validateAndLogin(dto: LoginDto, meta?: { userAgent?: string; ip?: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Аккаунт заблокирован');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    if (user.totpEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('Требуется код двухфакторной аутентификации');
      }
      const ok = authenticator.verify({ token: dto.totpCode, secret: user.totpSecret ?? '' });
      if (!ok) {
        throw new UnauthorizedException('Неверный код 2FA');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const pair = await this.tokens.issueTokens(
      { sub: user.id, username: user.username, role: user.role },
      meta,
    );
    return { ...pair, user: this.sanitize(user) };
  }

  async register(dto: RegisterDto, meta?: { userAgent?: string; ip?: string }) {
    if (!isAllowedCountry(dto.countryCode)) {
      throw new BadRequestException('Страна недоступна для регистрации');
    }
    if (!isFiatAllowedForCountry(dto.countryCode, dto.preferredFiat)) {
      throw new BadRequestException('Валюта недоступна для выбранной страны');
    }

    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('Такой логин уже занят');

    if (dto.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailTaken) throw new BadRequestException('Email уже используется');
    }

    const baseAsset = this.config.get<string>('economics.baseAsset') ?? 'USDT';
    const passwordHash = await AuthService.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.username,
        role: 'TRADER',
        status: 'ACTIVE',
        countryCode: dto.countryCode,
        preferredFiat: dto.preferredFiat,
        preferredAsset: baseAsset,
        locale: dto.locale ?? 'en',
      },
    });

    await this.wallets.ensureWallet(user.id, baseAsset);
    await this.wallets.ensureWallet(user.id, dto.preferredFiat);

    const pair = await this.tokens.issueTokens(
      { sub: user.id, username: user.username, role: user.role },
      meta,
    );
    return { ...pair, user: this.sanitize(user) };
  }

  async refresh(refreshToken: string, meta?: { userAgent?: string; ip?: string }) {
    const result = await this.tokens.rotate(refreshToken, meta);
    if (!result) {
      throw new UnauthorizedException('Недействительный или просроченный refresh-токен');
    }
    return result.pair;
  }

  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new UnauthorizedException();
    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException('Текущий пароль неверен');
    const passwordHash = await AuthService.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
    return { success: true };
  }

  // ---- 2FA (TOTP) ----
  async setup2fa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const otpauthUrl = authenticator.keyuri(user.username, 'P2P Exchange', secret);
    return { secret, otpauthUrl };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      throw new BadRequestException('Сначала инициализируйте 2FA');
    }
    const ok = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!ok) throw new BadRequestException('Неверный код');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { success: true };
  }

  async disable2fa(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });
    return { success: true };
  }

  private sanitize(user: {
    id: string;
    email: string | null;
    username: string;
    role: string;
    status: string;
    displayName: string | null;
    totpEnabled: boolean;
    countryCode?: string | null;
    preferredFiat?: string | null;
    preferredAsset?: string | null;
    locale?: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      totpEnabled: user.totpEnabled,
      countryCode: user.countryCode ?? null,
      preferredFiat: user.preferredFiat ?? null,
      preferredAsset: user.preferredAsset ?? null,
      locale: user.locale ?? null,
    };
  }
}
