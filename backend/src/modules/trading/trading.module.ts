import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BinaryModule } from '../binary/binary.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { SpotOrderService } from './spot-order.service';

import { FuturesPositionService } from './futures-position.service';

@Module({
  imports: [RatesModule, WalletsModule, UsersModule, NotificationsModule, BinaryModule],
  controllers: [TradingController],
  providers: [TradingService, SpotOrderService, FuturesPositionService],
  exports: [TradingService, SpotOrderService, FuturesPositionService],
})
export class TradingModule {}
