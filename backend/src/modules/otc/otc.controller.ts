import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OtcStage } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { OtcService, SetOtcMarginDto } from './otc.service';

class SetStageDto {
  stage!: OtcStage;
}

@Roles('ADMIN')
@Controller('admin/otc')
export class OtcController {
  constructor(private readonly otc: OtcService) {}

  @Get('queue')
  queue() {
    return this.otc.getQueue();
  }

  @Post('ads/:id/take')
  takeAd(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.otc.takeAd(admin.id, id);
  }

  @Patch('ads/:id/margin')
  setAdMargin(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetOtcMarginDto) {
    return this.otc.setAdMargin(admin.id, id, dto);
  }

  @Patch('ads/:id/stage')
  setAdStage(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetStageDto) {
    return this.otc.setAdStage(admin.id, id, dto.stage);
  }

  @Post('deals/:id/take')
  takeDeal(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.otc.takeDeal(admin.id, id);
  }

  @Patch('deals/:id/margin')
  setDealMargin(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetOtcMarginDto) {
    return this.otc.setDealMargin(admin.id, id, dto);
  }

  @Patch('deals/:id/stage')
  setDealStage(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SetStageDto) {
    return this.otc.setDealStage(admin.id, id, dto.stage);
  }
}
