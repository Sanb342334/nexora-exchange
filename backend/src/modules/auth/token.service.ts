import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }

  async issueTokens(
    payload: JwtPayload,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl'),
    });

    // Opaque refresh token stored hashed in DB for revocation control.
    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtl = this.config.get<string>('jwt.refreshTtl') ?? '30d';
    const expiresAt = new Date(Date.now() + this.parseTtlToMs(refreshTtl));

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: this.hash(refreshToken),
        userAgent: meta?.userAgent,
        ip: meta?.ip,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async rotate(
    refreshToken: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ pair: TokenPair; userId: string } | null> {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return null;
    }
    // Revoke old token (rotation) and issue a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const pair = await this.issueTokens(
      { sub: stored.user.id, username: stored.user.username, role: stored.user.role },
      meta,
    );
    return { pair, userId: stored.user.id };
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
