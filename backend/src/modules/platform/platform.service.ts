import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const ALIAS_PREFIX = ['Alpha', 'Crypto', 'Neo', 'Swift', 'Golden', 'Safe', 'Turbo', 'Prime'];
const ALIAS_SUFFIX = ['Trader', 'Whale', 'Fox', 'Vault', 'Bridge', 'Hawk', 'Node', 'Flow'];

/** Helpers for house-backed P2P illusion (users see personas, platform is counterparty). */
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  generateAlias(): string {
    const p = ALIAS_PREFIX[Math.floor(Math.random() * ALIAS_PREFIX.length)];
    const s = ALIAS_SUFFIX[Math.floor(Math.random() * ALIAS_SUFFIX.length)];
    const n = Math.floor(Math.random() * 900) + 100;
    return `${p}${s}${n}`;
  }

  isPlatformOrderbookOnly(): boolean {
    return process.env.PLATFORM_ORDERBOOK_ONLY !== 'false';
  }

  sanitizePublicUser(user: {
    id: string;
    username: string;
    displayName?: string | null;
    isPersona?: boolean;
    personaRating?: { toString(): string } | null;
    personaDealsCount?: number;
  }) {
    return {
      id: user.id,
      username: user.isPersona ? user.displayName ?? user.username : user.username,
      displayName: user.displayName ?? user.username,
      trustScore: user.personaRating ? Math.round(Number(user.personaRating) * 100) : null,
      completedDeals: user.personaDealsCount ?? null,
    };
  }

  maskCounterparty(
    party: { id: string; username: string; displayName?: string | null },
    alias: string | null | undefined,
  ) {
    const name = alias ?? this.generateAlias();
    return {
      id: party.id,
      username: name,
      displayName: name,
      trustScore: null as number | null,
      completedDeals: null as number | null,
    };
  }

  async notifyAdmins(title: string, body: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    for (const a of admins) {
      await this.prisma.notification.create({
        data: { userId: a.id, type: 'DEAL', title, body },
      });
    }
  }
}
