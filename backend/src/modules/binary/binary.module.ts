import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BinaryController } from './binary.controller';
import { BinaryPriceService } from './binary-price.service';
import { BinaryTradeService } from './binary-trade.service';

@Module({
  imports: [WalletsModule, NotificationsModule],
  controllers: [BinaryController],
  providers: [BinaryPriceService, BinaryTradeService],
  exports: [BinaryTradeService, BinaryPriceService],
})
export class BinaryModule {}
