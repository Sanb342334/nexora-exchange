import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { DepositCryptoConfig } from './deposit-crypto.config';
import { TreasuryService } from './treasury.service';
import { AdminTreasuryController, TreasuryController } from './treasury.controller';

@Module({
  imports: [PlatformModule],
  controllers: [TreasuryController, AdminTreasuryController],
  providers: [TreasuryService, DepositCryptoConfig],
  exports: [TreasuryService],
})
export class TreasuryModule {}
