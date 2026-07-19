import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { TreasuryService } from './treasury.service';
import {
  AdjustBalanceDto,
  CreateDepositDto,
  CreateWithdrawalDto,
  ReviewDto,
} from './dto/treasury.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Post('deposits')
  requestDeposit(@CurrentUser() user: AuthUser, @Body() dto: CreateDepositDto) {
    return this.treasury.requestDeposit(user.id, dto);
  }

  @Get('deposits')
  myDeposits(@CurrentUser() user: AuthUser) {
    return this.treasury.listMyDeposits(user.id);
  }

  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: CreateWithdrawalDto) {
    return this.treasury.requestWithdrawal(user.id, dto);
  }

  @Get('withdrawals')
  myWithdrawals(@CurrentUser() user: AuthUser) {
    return this.treasury.listMyWithdrawals(user.id);
  }
}

@Roles('ADMIN')
@Controller('admin/treasury')
export class AdminTreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('deposits')
  deposits(@Query('status') status?: RequestStatus) {
    return this.treasury.listDeposits(status);
  }

  @Post('deposits/:id/approve')
  approveDeposit(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.treasury.approveDeposit(admin.id, id, dto.note);
  }

  @Post('deposits/:id/reject')
  rejectDeposit(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.treasury.rejectDeposit(admin.id, id, dto.note);
  }

  @Get('withdrawals')
  withdrawals(@Query('status') status?: RequestStatus) {
    return this.treasury.listWithdrawals(status);
  }

  @Post('withdrawals/:id/approve')
  approveWithdrawal(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.treasury.approveWithdrawal(admin.id, id, dto.note);
  }

  @Post('withdrawals/:id/reject')
  rejectWithdrawal(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.treasury.rejectWithdrawal(admin.id, id, dto.note);
  }

  @Post('adjust')
  adjust(@CurrentUser() admin: AuthUser, @Body() dto: AdjustBalanceDto) {
    return this.treasury.adjustBalance(admin.id, dto);
  }
}
