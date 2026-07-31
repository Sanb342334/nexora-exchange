import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BinaryOutcomeMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BINARY_CURRENCIES, BINARY_DURATIONS } from './binary.constants';
import { BinaryPriceService } from './binary-price.service';
import { BinaryTradeService } from './binary-trade.service';

class OpenBinaryDto {
  @IsString()
  pair!: string;

  @IsString()
  direction!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  stake!: number;

  @Type(() => Number)
  @IsNumber()
  duration_sec!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  leverage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take_profit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stop_loss?: number;
}

class AdminTradeLockDto {
  @IsBoolean()
  locked!: boolean;

  @IsOptional()
  @IsBoolean()
  kycRequired?: boolean;
}

class AdminWithdrawGateDto {
  @IsBoolean()
  required!: boolean;
}

class SetCurrencyDto {
  @IsString()
  currency!: string;
}

class AdminOutcomeDto {
  @IsEnum(BinaryOutcomeMode)
  mode!: BinaryOutcomeMode;
}

class AdminBalanceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

class AdminLoggingDto {
  @IsBoolean()
  enabled!: boolean;
}

class AdminForceDto {
  @IsString()
  result!: 'WIN' | 'LOSE';
}

class AdminSettingDto {
  @IsOptional()
  @IsString()
  requisites?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payout?: number;
}

@ApiTags('binary')
@ApiBearerAuth()
@Controller('binary')
export class BinaryController {
  constructor(
    private readonly trades: BinaryTradeService,
    private readonly prices: BinaryPriceService,
  ) {}

  @Public()
  @Get('pairs')
  pairs() {
    return { pairs: this.prices.list() };
  }

  @Public()
  @Get('price')
  price(@Query('pair') pair = 'EURUSD') {
    const tick = this.prices.tick(pair);
    return { pair, price: tick.price, ts: tick.ts };
  }

  @Get('chart')
  chart(@CurrentUser('id') userId: string, @Query('pair') pair = 'BTCUSDT') {
    return this.trades.chartQuote(userId, pair);
  }

  @Get('feed')
  feed(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.trades.tradeFeed(userId, limit ? parseInt(limit, 10) : 40);
  }

  @Public()
  @Get('durations')
  durations() {
    return { durations: BINARY_DURATIONS };
  }

  @Public()
  @Get('currencies')
  currencies() {
    return { currencies: BINARY_CURRENCIES };
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.trades.me(userId);
  }

  @Patch('currency')
  setCurrency(@CurrentUser('id') userId: string, @Body() dto: SetCurrencyDto) {
    return this.trades.setCurrency(userId, dto.currency);
  }

  @Get('deposit-info')
  async depositInfo() {
    return { requisites: await this.trades.getDepositRequisites() };
  }

  @Post('trade')
  open(@CurrentUser('id') userId: string, @Body() dto: OpenBinaryDto) {
    return this.trades.openTrade(userId, {
      pairId: dto.pair,
      direction: dto.direction as 'up' | 'down',
      stake: dto.stake,
      durationSec: dto.duration_sec,
      leverage: dto.leverage,
      takeProfit: dto.take_profit,
      stopLoss: dto.stop_loss,
    });
  }

  @Post('trades/:id/close')
  closeTrade(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.trades.closeTrade(userId, id);
  }

  @Get('trades')
  tradesList(
    @CurrentUser('id') userId: string,
    @Query('closed') closed?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.trades.listTrades(userId, {
      closedOnly: closed !== '0' && closed !== 'false',
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('open')
  openList(@CurrentUser('id') userId: string) {
    return this.trades.openTrades(userId);
  }

  // ---- Admin ----

  @Roles('ADMIN')
  @Get('admin/stats')
  adminStats() {
    return this.trades.adminStats();
  }

  @Roles('ADMIN')
  @Get('admin/users')
  adminUsers(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.trades.adminListUsers(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Roles('ADMIN')
  @Get('admin/open-trades')
  adminOpenTrades(@Query('limit') limit?: string) {
    return this.trades.adminOpenTrades(limit ? parseInt(limit, 10) : 50);
  }

  @Roles('ADMIN')
  @Post('admin/trades/:id/force')
  adminForce(@Param('id') id: string, @Body() dto: AdminForceDto) {
    if (dto.result !== 'WIN' && dto.result !== 'LOSE') {
      throw new BadRequestException('result must be WIN or LOSE');
    }
    return this.trades.adminForceSettle(id, dto.result);
  }

  @Roles('ADMIN')
  @Patch('admin/users/:id/outcome')
  adminOutcome(@Param('id') id: string, @Body() dto: AdminOutcomeDto) {
    return this.trades.adminSetOutcome(id, dto.mode);
  }

  @Roles('ADMIN')
  @Post('admin/users/:id/message')
  adminMessage(@Param('id') id: string, @Body() dto: { text: string }) {
    if (!dto.text?.trim()) throw new BadRequestException('Пустое сообщение');
    return this.trades.adminMessageUser(id, dto.text.trim());
  }

  @Roles('ADMIN')
  @Patch('admin/users/:id/logging')
  adminLogging(@Param('id') id: string, @Body() dto: AdminLoggingDto) {
    return this.trades.adminSetLogging(id, dto.enabled);
  }

  @Roles('ADMIN')
  @Patch('admin/users/:id/trade-lock')
  adminTradeLock(@Param('id') id: string, @Body() dto: AdminTradeLockDto) {
    return this.trades.adminSetTradeLock(id, dto.locked, dto.kycRequired);
  }

  @Roles('ADMIN')
  @Patch('admin/users/:id/withdraw-gate')
  adminWithdrawGate(@Param('id') id: string, @Body() dto: AdminWithdrawGateDto) {
    return this.trades.adminSetWithdrawCardGate(id, dto.required);
  }

  @Roles('ADMIN')
  @Get('admin/users/:id/stats')
  adminUserStats(@Param('id') id: string) {
    return this.trades.adminUserStats(id);
  }

  @Roles('ADMIN')
  @Post('admin/users/:id/balance')
  adminBalance(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminBalanceDto,
  ) {
    return this.trades.adminSetBalance(id, dto.amount, adminId);
  }

  @Roles('ADMIN')
  @Get('admin/users/:id/logs')
  adminLogs(@Param('id') id: string) {
    return this.trades.getLogs(id);
  }

  @Roles('ADMIN')
  @Patch('admin/settings')
  async adminSettings(@Body() dto: AdminSettingDto) {
    if (dto.requisites != null) await this.trades.setDepositRequisites(dto.requisites);
    if (dto.payout != null) await this.trades.setPayoutCoef(dto.payout);
    return {
      requisites: await this.trades.getDepositRequisites(),
      payout: await this.trades.getPayoutCoef(),
    };
  }

  /** Fill own account with ~6 months of fake deposits / withdrawals / trades. */
  @Roles('ADMIN')
  @Post('admin/seed-history')
  seedHistory(@CurrentUser('id') adminId: string) {
    return this.trades.adminSeedFakeHistory(adminId);
  }
}
