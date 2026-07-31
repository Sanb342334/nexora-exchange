import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { KycService } from './kyc.service';

class SubmitKycDto {
  @IsString()
  @MinLength(3)
  passportPage1Url!: string;

  @IsString()
  @MinLength(3)
  passportPage2Url!: string;

  @IsString()
  @MinLength(3)
  selfieUrl!: string;
}

class ReviewDto {
  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.kyc.getStatus(user.id);
  }

  @Post('submit')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(user.id, dto);
  }
}

@Roles('ADMIN')
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Post('submissions/:id/approve')
  approve(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.kyc.approve(admin.id, id, dto.note);
  }

  @Post('submissions/:id/reject')
  reject(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.kyc.reject(admin.id, id, dto.note);
  }

  @Post('users/:id/grant')
  grant(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.kyc.grant(admin.id, id);
  }
}
