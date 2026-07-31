import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { AdminSupportController, SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [PlatformModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
