import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PlatformService } from '../platform/platform.service';
import { TelegramAdminService } from '../platform/telegram-admin.service';

const SUPPORT_CHAT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SUPPORT_CLEANUP_EVERY_MS = 15 * 60 * 1000; // check every 15 min

const SPECIALIST_FIRST = [
  'Анна',
  'Мария',
  'Елена',
  'Ольга',
  'Ирина',
  'Дмитрий',
  'Алексей',
  'Сергей',
  'Никита',
  'Виктория',
  'Ксения',
  'Артём',
];

function randomSpecialistName() {
  return SPECIALIST_FIRST[Math.floor(Math.random() * SPECIALIST_FIRST.length)];
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly platform: PlatformService,
    private readonly telegram: TelegramAdminService,
  ) {}

  /** Remove user support chats idle/older than 6 hours. */
  @Interval(SUPPORT_CLEANUP_EVERY_MS)
  async purgeStaleChats() {
    const cutoff = new Date(Date.now() - SUPPORT_CHAT_TTL_MS);
    try {
      const stale = await this.prisma.supportTicket.findMany({
        where: { updatedAt: { lt: cutoff } },
        select: { id: true, userId: true },
      });
      if (!stale.length) return;
      const ids = stale.map((t) => t.id);
      await this.prisma.supportTicket.deleteMany({ where: { id: { in: ids } } });
      for (const t of stale) {
        this.realtime.emitToUser(t.userId, 'support:cleared', { ticketId: t.id });
      }
      this.logger.log(`Support cleanup: removed ${ids.length} ticket(s) older than 6h`);
    } catch (e) {
      this.logger.warn(`Support cleanup failed: ${e}`);
    }
  }

  async getOrCreateTicket(userId: string) {
    let ticket = await this.prisma.supportTicket.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
        },
      },
    });
    if (!ticket) {
      ticket = await this.prisma.supportTicket.create({
        data: { userId, subject: 'Поддержка' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
          },
        },
      });
    }
    return ticket;
  }

  private async resolveStaffSenderId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new BadRequestException('Нет оператора для автоответа');
    return admin.id;
  }

  private async sendAutoAck(ticketId: string, userId: string) {
    const staffId = await this.resolveStaffSenderId();
    const name = randomSpecialistName();
    const body =
      `Здравствуйте! Вас консультирует специалист ${name}.\n\n` +
      `Мы уже работаем по вашему вопросу. Пожалуйста, ожидайте ответа — обычно это занимает до 15 минут.\n\n` +
      `Спасибо за обращение в поддержку NEXORA.`;

    const auto = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: staffId,
        body,
        isStaff: true,
      },
      include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
    });
    // Show specialist name in chat UI
    const shaped = {
      ...auto,
      sender: {
        ...auto.sender,
        displayName: name,
        username: name,
      },
    };
    this.realtime.emitToUser(userId, 'support:message', { ticketId, message: shaped });
    await this.notifications.push(
      userId,
      'SYSTEM',
      'Поддержка приняла обращение',
      `${name} работает по вашему вопросу. Ожидайте до 15 минут.`,
    );
    return shaped;
  }

  async sendUserMessage(userId: string, body: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Пустое сообщение');
    const ticket = await this.getOrCreateTicket(userId);

    const priorStaff = await this.prisma.supportMessage.count({
      where: { ticketId: ticket.id, isStaff: true },
    });

    const msg = await this.prisma.supportMessage.create({
      data: { ticketId: ticket.id, senderId: userId, body: text, isStaff: false },
      include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
    });
    await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date(), status: 'OPEN' },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    this.realtime.emitToAdmins('support:message', { ticketId: ticket.id, message: msg, user });
    this.realtime.emitToUser(userId, 'support:message', { ticketId: ticket.id, message: msg });
    await this.platform.notifyAdmins('Сообщение в поддержку', `@${user.username}: ${text.slice(0, 120)}`);

    // Inline «Ответить» immediately on the Telegram notification
    await this.telegram.notify(
      `💬 <b>Поддержка</b>\nUser: <code>${user.username}</code>\n${text.slice(0, 500)}\n\nID: <code>${ticket.id}</code>`,
      {
        inline_keyboard: [
          [{ text: '✍ Ответить', callback_data: `adm:sr:${ticket.id}` }],
          [
            { text: '👁 Тикет', callback_data: `adm:sd:${ticket.id}` },
            { text: '🛠 Админ', callback_data: 'adm:menu' },
          ],
        ],
      },
    );

    // Template auto-reply once per ticket (first contact)
    if (priorStaff === 0) {
      await this.sendAutoAck(ticket.id, userId);
    }

    return msg;
  }

  async listOpenTickets() {
    return this.prisma.supportTicket.findMany({
      where: { status: 'OPEN' },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { username: true } } },
        },
      },
    });
  }

  async getTicketAdmin(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Тикет не найден');
    return ticket;
  }

  async replyAdmin(adminId: string, ticketId: string, body: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Пустое сообщение');
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Тикет не найден');
    const msg = await this.prisma.supportMessage.create({
      data: { ticketId, senderId: adminId, body: text, isStaff: true },
      include: { sender: { select: { id: true, username: true, displayName: true, role: true } } },
    });
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date(), status: 'OPEN' },
    });
    await this.notifications.push(
      ticket.userId,
      'SYSTEM',
      'Поступил ответ от поддержки',
      text.slice(0, 200),
    );
    this.realtime.emitToUser(ticket.userId, 'support:message', { ticketId, message: msg });
    this.realtime.emitToUser(ticket.userId, 'support:reply', { ticketId, message: msg });
    this.realtime.emitToAdmins('support:message', { ticketId, message: msg });

    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { telegramId: true },
    });
    if (user?.telegramId) {
      const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;
      await this.telegram.notifyUser(
        user.telegramId,
        `💬 <b>Поступил ответ от поддержки</b>\n\n${preview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`,
      );
    }
    return msg;
  }

  async closeTicket(ticketId: string) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED' },
    });
  }
}
