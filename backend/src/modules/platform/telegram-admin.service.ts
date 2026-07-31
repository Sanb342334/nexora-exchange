import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';

type InlineBtn = { text: string; callback_data?: string; url?: string };
type InlineKeyboard = { inline_keyboard: InlineBtn[][] };

const TG_ADMIN_IDS_KEY = 'telegram_admin_chat_ids';
const DEFAULT_UNLOCK_PASSWORD = 'mister22';

/**
 * Optional Telegram notify for admins.
 * Env: TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_IDS=123,456
 * Dynamic admins via /adminq + password (systemSetting + User.role).
 */
@Injectable()
export class TelegramAdminService {
  private readonly logger = new Logger(TelegramAdminService.name);
  private chatCache = new Set<string>();
  private cacheAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private token() {
    return (
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();
  }

  unlockPassword(): string {
    return (
      this.config.get<string>('TELEGRAM_ADMIN_UNLOCK_PASSWORD') ||
      process.env.TELEGRAM_ADMIN_UNLOCK_PASSWORD ||
      DEFAULT_UNLOCK_PASSWORD
    ).trim();
  }

  private envChats(): string[] {
    const chatsRaw =
      this.config.get<string>('TELEGRAM_ADMIN_CHAT_IDS') ||
      process.env.TELEGRAM_ADMIN_CHAT_IDS ||
      '';
    return chatsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async refreshAdminChats(): Promise<Set<string>> {
    const ids = new Set(this.envChats());
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key: TG_ADMIN_IDS_KEY } });
      if (row?.value) {
        for (const part of row.value.split(/[,\s]+/)) {
          const id = part.trim();
          if (id) ids.add(id);
        }
      }
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE', telegramId: { not: null } },
        select: { telegramId: true },
      });
      for (const a of admins) {
        if (a.telegramId) ids.add(a.telegramId);
      }
    } catch (e) {
      this.logger.warn(`refreshAdminChats: ${e}`);
    }
    this.chatCache = ids;
    this.cacheAt = Date.now();
    return ids;
  }

  async getAdminChatIds(): Promise<string[]> {
    if (Date.now() - this.cacheAt > 8000 || !this.cacheAt) {
      await this.refreshAdminChats();
    }
    return [...this.chatCache];
  }

  async isAdminTelegramId(...candidates: Array<string | number | undefined | null>): Promise<boolean> {
    const ids = await this.getAdminChatIds();
    if (!ids.length) return false;
    const set = new Set(ids);
    return candidates.some((c) => c != null && c !== '' && set.has(String(c)));
  }

  /** Persist TG id as admin + promote linked Mini App user if any. */
  async grantTelegramAdmin(telegramId: string | number) {
    const id = String(telegramId).trim();
    if (!id) throw new Error('Пустой telegram id');

    const row = await this.prisma.systemSetting.findUnique({ where: { key: TG_ADMIN_IDS_KEY } });
    const existing = new Set(
      (row?.value || '')
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    existing.add(id);
    const value = [...existing].join(',');
    await this.prisma.systemSetting.upsert({
      where: { key: TG_ADMIN_IDS_KEY },
      update: { value },
      create: { key: TG_ADMIN_IDS_KEY, value },
    });

    const user = await this.prisma.user.findUnique({ where: { telegramId: id } });
    let promotedUser = false;
    if (user && user.role !== 'ADMIN') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });
      promotedUser = true;
    } else if (user?.role === 'ADMIN') {
      promotedUser = true;
    }

    await this.refreshAdminChats();
    return { telegramId: id, promotedUser, userId: user?.id ?? null };
  }

  private async chats(): Promise<string[]> {
    return this.getAdminChatIds();
  }

  private publicBase(): string {
    const explicit =
      this.config.get<string>('PUBLIC_API_URL') ||
      process.env.PUBLIC_API_URL ||
      this.config.get<string>('TELEGRAM_WEBAPP_URL') ||
      process.env.TELEGRAM_WEBAPP_URL ||
      '';
    if (explicit.trim()) {
      // webapp is frontend; API often same host via /api proxy — prefer API origin from CORS https
      return explicit.trim().replace(/\/$/, '');
    }
    const cors = this.config.get<string>('CORS_ORIGINS') || process.env.CORS_ORIGINS || '';
    const https = cors
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('https://'));
    return https?.replace(/\/$/, '') || 'http://localhost:4000';
  }

  resolvePublicUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    const base = this.publicBase();
    // uploads served from API :4000/api/uploads — if base is frontend, try API_URL
    const api =
      this.config.get<string>('PUBLIC_API_URL') ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      '';
    const root = (api || base).replace(/\/$/, '').replace(/\/api$/, '');
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${root}${path}`;
  }

  async notify(text: string, keyboard?: InlineKeyboard) {
    const token = this.token();
    const chats = await this.chats();
    if (!token || !chats.length) {
      this.logger.debug('Telegram admin notify skipped (no token/chat ids)');
      return;
    }
    for (const chatId of chats) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: keyboard ?? {
              inline_keyboard: [[{ text: '🛠 Админ-панель', callback_data: 'adm:menu' }]],
            },
          }),
        });
        if (!res.ok) {
          this.logger.warn(`Telegram notify failed ${chatId}: ${await res.text()}`);
        }
      } catch (e) {
        this.logger.warn(`Telegram notify error: ${e}`);
      }
    }
  }

  /** Direct message to a trader by telegram user id. */
  async notifyUser(telegramId: string | number, text: string) {
    const token = this.token();
    if (!token || telegramId == null || telegramId === '') return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Telegram user notify failed ${telegramId}: ${await res.text()}`);
      }
    } catch (e) {
      this.logger.warn(`Telegram user notify error: ${e}`);
    }
  }

  /** Send proof image/file to admins (no "open link" for trader). */
  async notifyProof(opts: {
    caption: string;
    proofUrl: string;
    keyboard?: InlineKeyboard;
  }) {
    const token = this.token();
    const chats = await this.chats();
    if (!token || !chats.length) return;

    const localPath = this.localUploadPath(opts.proofUrl);
    const publicUrl = this.resolvePublicUrl(opts.proofUrl);
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(opts.proofUrl);

    for (const chatId of chats) {
      try {
        if (localPath && existsSync(localPath)) {
          const buf = readFileSync(localPath);
          const blob = new Blob([new Uint8Array(buf)]);
          const form = new FormData();
          form.append('chat_id', chatId);
          form.append('caption', opts.caption.slice(0, 1024));
          form.append('parse_mode', 'HTML');
          if (opts.keyboard) form.append('reply_markup', JSON.stringify(opts.keyboard));
          const fname = localPath.split(/[/\\]/).pop() || 'proof.jpg';
          if (isImage) {
            form.append('photo', blob, fname);
            const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: 'POST',
              body: form,
            });
            if (!res.ok) this.logger.warn(`sendPhoto failed: ${await res.text()}`);
          } else {
            form.append('document', blob, fname);
            const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
              method: 'POST',
              body: form,
            });
            if (!res.ok) this.logger.warn(`sendDocument failed: ${await res.text()}`);
          }
        } else if (publicUrl.startsWith('http')) {
          const body: Record<string, unknown> = {
            chat_id: chatId,
            caption: opts.caption.slice(0, 1024),
            parse_mode: 'HTML',
            reply_markup: opts.keyboard,
          };
          if (isImage) {
            body.photo = publicUrl;
            await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          } else {
            body.document = publicUrl;
            await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          }
        } else {
          await this.notify(`${opts.caption}\nФайл: ${opts.proofUrl}`, opts.keyboard);
        }
      } catch (e) {
        this.logger.warn(`Telegram proof notify error: ${e}`);
        await this.notify(`${opts.caption}\n(файл не отправился)`, opts.keyboard);
      }
    }
  }

  private localUploadPath(proofUrl: string): string | null {
    const m = proofUrl.match(/\/uploads\/([^/?#]+)/i) || proofUrl.match(/^\/api\/uploads\/([^/?#]+)/i);
    if (!m) return null;
    return join(process.cwd(), 'uploads', m[1]);
  }
}
