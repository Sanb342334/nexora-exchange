import { Module } from '@nestjs/common';
import { OtcService } from './otc.service';
import { OtcController } from './otc.controller';

@Module({
  controllers: [OtcController],
  providers: [OtcService],
  exports: [OtcService],
})
export class OtcModule {}
