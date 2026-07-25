import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DealStatus } from '@prisma/client';
import { DealsService } from './deals.service';
import {
  CancelDealDto,
  CreateDealDto,
  MarkPaidDto,
  OpenDisputeDto,
  SendMessageDto,
} from './dto/deal.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDealDto) {
    return this.deals.createFromAd(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.deals.listMine(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.getById(user.id, user.role === 'ADMIN', id);
  }

  @Post(':id/paid')
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.deals.markPaid(user.id, id, dto.proofUrl);
  }

  @Post(':id/release')
  release(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.release(user.id, user.role === 'ADMIN', id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelDealDto) {
    return this.deals.cancel(user.id, user.role === 'ADMIN', id, dto.reason);
  }

  @Post(':id/dispute')
  dispute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpenDisputeDto) {
    return this.deals.openDispute(user.id, id, dto.reason);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.getById(user.id, user.role === 'ADMIN', id).then((d: any) => d.chatMessages);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.deals.sendMessage(user.id, user.role === 'ADMIN', id, dto.body, dto.attachmentUrl);
  }
}

class ResolveDisputeDto {
  winner!: 'BUYER' | 'SELLER';
  resolution!: string;
}

@Roles('ADMIN')
@Controller('admin/deals')
export class AdminDealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  list(@Query('status') status?: DealStatus) {
    return this.deals.listAll(status);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.getById(user.id, true, id);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.deals.resolveDispute(admin.id, id, dto.winner, dto.resolution);
  }

  @Post(':id/cancel')
  forceCancel(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: CancelDealDto) {
    return this.deals.cancel(admin.id, true, id, dto.reason);
  }
}
