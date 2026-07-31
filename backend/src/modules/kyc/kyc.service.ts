import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TelegramAdminService } from '../platform/telegram-admin.service';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly telegram: TelegramAdminService,
  ) {}

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        kycStatus: true,
        kycRejectReason: true,
        kycRequired: true,
      },
    });
    const latest = await this.prisma.kycSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: user.kycStatus,
      rejectReason: user.kycRejectReason,
      verified: user.kycStatus === 'APPROVED',
      latest: latest
        ? {
            id: latest.id,
            status: latest.status,
            createdAt: latest.createdAt,
            reviewNote: latest.reviewNote,
            passportPage1Url: latest.passportPage1Url,
            passportPage2Url: latest.passportPage2Url,
            selfieUrl: latest.selfieUrl,
          }
        : null,
    };
  }

  async submit(
    userId: string,
    dto: { passportPage1Url: string; passportPage2Url: string; selfieUrl: string },
  ) {
    if (!dto.passportPage1Url?.trim() || !dto.passportPage2Url?.trim() || !dto.selfieUrl?.trim()) {
      throw new BadRequestException('Загрузите все три фото');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.kycStatus === 'APPROVED') {
      throw new BadRequestException('Верификация уже пройдена');
    }
    const pending = await this.prisma.kycSubmission.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestException('Заявка уже на проверке. Дождитесь решения.');
    }

    const sub = await this.prisma.kycSubmission.create({
      data: {
        userId,
        passportPage1Url: dto.passportPage1Url.trim(),
        passportPage2Url: dto.passportPage2Url.trim(),
        selfieUrl: dto.selfieUrl.trim(),
        status: 'PENDING',
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'PENDING', kycRejectReason: null },
    });

    await this.notifications.push(
      userId,
      'SYSTEM',
      'KYC отправлен на проверку',
      'Документы получены. Обычно проверка занимает до нескольких часов.',
    );

    const caption =
      `🪪 <b>KYC заявка</b>\n` +
      `User: <code>${user.username}</code>\n` +
      `ID: <code>${userId}</code>\n` +
      `Sub: <code>${sub.id}</code>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Одобрить', callback_data: `adm:kyc:ok:${sub.id}` },
          { text: '❌ Отклонить', callback_data: `adm:kyc:no:${sub.id}` },
        ],
        [{ text: '👤 Юзер', callback_data: `adm:ud:${userId}` }],
      ],
    };

    await this.telegram.notify(caption, keyboard);
    await this.telegram.notifyProof({
      caption: `${caption}\n\n1/3 Паспорт · стр. 1`,
      proofUrl: sub.passportPage1Url,
      keyboard,
    });
    await this.telegram.notifyProof({
      caption: `2/3 Паспорт · стр. 2 · @${user.username}`,
      proofUrl: sub.passportPage2Url,
    });
    await this.telegram.notifyProof({
      caption: `3/3 Селфи с документом · @${user.username}`,
      proofUrl: sub.selfieUrl,
      keyboard,
    });

    this.realtime.emitToAdmins('kyc:submitted', { submissionId: sub.id, userId });
    return this.getStatus(userId);
  }

  async approve(adminId: string, submissionId: string, note?: string) {
    const sub = await this.prisma.kycSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('Заявка не найдена');
    if (sub.status !== 'PENDING') throw new BadRequestException('Заявка уже обработана');

    await this.prisma.$transaction([
      this.prisma.kycSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          reviewNote: note?.trim() || null,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      }),
      this.prisma.user.update({
        where: { id: sub.userId },
        data: {
          kycStatus: 'APPROVED',
          kycRequired: false,
          tradeLocked: false,
          kycRejectReason: null,
        },
      }),
    ]);

    await this.notifications.push(
      sub.userId,
      'SYSTEM',
      'Верификация пройдена',
      'Ваш аккаунт успешно верифицирован.',
    );
    await this.notifyTg(sub.userId, '✅ Верификация пройдена. Аккаунт подтверждён.');
    this.realtime.emitToUser(sub.userId, 'kyc:updated', { status: 'APPROVED' });
    return this.getStatus(sub.userId);
  }

  async reject(adminId: string, submissionId: string, reason?: string) {
    const sub = await this.prisma.kycSubmission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('Заявка не найдена');
    if (sub.status !== 'PENDING') throw new BadRequestException('Заявка уже обработана');
    const note = reason?.trim() || 'Документы отклонены. Загрузите более чёткие фото.';

    await this.prisma.$transaction([
      this.prisma.kycSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          reviewNote: note,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      }),
      this.prisma.user.update({
        where: { id: sub.userId },
        data: {
          kycStatus: 'REJECTED',
          kycRejectReason: note,
        },
      }),
    ]);

    await this.notifications.push(sub.userId, 'SYSTEM', 'Верификация отклонена', note);
    await this.notifyTg(sub.userId, `❌ Верификация отклонена.\n${note}`);
    this.realtime.emitToUser(sub.userId, 'kyc:updated', { status: 'REJECTED', reason: note });
    return this.getStatus(sub.userId);
  }

  /** Grant verification without documents (admin). */
  async grant(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'APPROVED',
        kycRequired: false,
        tradeLocked: false,
        kycRejectReason: null,
      },
    });
    await this.notifications.push(
      userId,
      'SYSTEM',
      'Верификация пройдена',
      'Верификация выдана администратором.',
    );
    await this.notifyTg(userId, '✅ Верификация пройдена. Аккаунт подтверждён.');
    this.realtime.emitToUser(userId, 'kyc:updated', { status: 'APPROVED' });
    void adminId;
    return this.getStatus(userId);
  }

  async revoke(userId: string, reason?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'NONE',
        kycRejectReason: reason?.trim() || null,
      },
    });
    this.realtime.emitToUser(userId, 'kyc:updated', { status: 'NONE' });
    return this.getStatus(userId);
  }

  private async notifyTg(userId: string, text: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (u?.telegramId) {
      await this.telegram.notifyUser(u.telegramId, text).catch(() => undefined);
    }
  }
}
