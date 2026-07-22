import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { AdminDealsController, DealsController } from './deals.controller';
import { DealsScheduler } from './deals.scheduler';
import { UsersModule } from '../users/users.module';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [UsersModule, PlatformModule],
  controllers: [DealsController, AdminDealsController],
  providers: [DealsService, DealsScheduler],
  exports: [DealsService],
})
export class DealsModule {}
