import { Module } from '@nestjs/common';
import { BinaryModule } from '../binary/binary.module';
import { SupportModule } from '../support/support.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { KycModule } from '../kyc/kyc.module';
import { TelegramBotService } from './telegram-bot.service';

/** Isolated so bot can inject treasury/binary/support without PlatformModule cycles. */
@Module({
  imports: [TreasuryModule, BinaryModule, SupportModule, KycModule],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
