import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { TreasuryService } from './treasury.service';
import {
  AdjustBalanceDto,
  CreateDepositDto,
  CreateWithdrawalDto,
  ReviewDto,
} from './dto/treasury.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class AttachProofDto {
  @IsString()
  proofUrl!: string;
}

class AssignRequisitesDto {
  @IsString()
  @MinLength(3)
  requisites!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('deposit-methods')
  depositMethods() {
    return this.treasury.depositMethods();
  }

  @Post('deposits')
  requestDeposit(@CurrentUser() user: AuthUser, @Body() dto: CreateDepositDto) {
    return this.treasury.requestDeposit(user.id, dto);
  }

  @Get('deposits/active')
  activeDeposit(@CurrentUser() user: AuthUser) {
    return this.treasury.getMyActiveDeposit(user.id);
  }

  @Patch('deposits/:id/proof')
  attachProof(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AttachProofDto,
  ) {
    return this.treasury.attachDepositProof(user.id, id, dto.proofUrl);
  }

  @Post('deposits/:id/cancel')
  cancelDeposit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.treasury.cancelDeposit(user.id, id);
  }

  @Get('deposits')
  myDeposits(@CurrentUser() user: AuthUser) {
    return this.treasury.listMyDeposits(user.id);
  }

  @Get('withdrawals')
  myWithdrawals(@CurrentUser() user: AuthUser) {
    return this.treasury.listMyWithdrawals(user.id);
  }

  @Get('withdrawals/eligibility')
  withdrawalEligibility(@CurrentUser() user: AuthUser) {
    return this.treasury.withdrawalEligibility(user.id);
  }

  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: CreateWithdrawalDto) {
    return this.treasury.requestWithdrawal(user.id, dto);
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

  @Post('deposits/:id/requisites')
  assignRequisites(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignRequisitesDto,
  ) {
    return this.treasury.assignRequisites(admin.id, id, dto.requisites, dto.comment);
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
