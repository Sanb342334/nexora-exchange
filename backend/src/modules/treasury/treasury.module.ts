import { Module } from '@nestjs/common';
import { TreasuryService } from './treasury.service';
import { AdminTreasuryController, TreasuryController } from './treasury.controller';

@Module({
  controllers: [TreasuryController, AdminTreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
