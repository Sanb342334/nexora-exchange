import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { RatesService } from './rates.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

class SetRateDto {
  @IsOptional() @IsString() asset?: string;
  @IsOptional() @IsString() fiat?: string;
  @IsNumber() price!: number;
}

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Public()
  @Get('market')
  market(@Query('asset') asset?: string, @Query('fiat') fiat?: string) {
    return this.rates.getMarketPrice(asset, fiat);
  }

  @Public()
  @Get('quote')
  quote(
    @Query('side') side: 'BUY' | 'SELL',
    @Query('asset') asset?: string,
    @Query('fiat') fiat?: string,
  ) {
    return this.rates.quote(side ?? 'BUY', asset, fiat);
  }

  @Public()
  @Get('history')
  history(@Query('asset') asset?: string, @Query('fiat') fiat?: string) {
    return this.rates.history(asset, fiat);
  }

  @Roles('ADMIN')
  @Post('manual')
  setManual(@Body() dto: SetRateDto) {
    return this.rates.setManualRate(dto.asset ?? 'USDT', dto.fiat ?? 'KZT', dto.price);
  }

  @Roles('ADMIN')
  @Delete('manual')
  clearManual(@Query('asset') asset?: string, @Query('fiat') fiat?: string) {
    return this.rates.clearManualRate(asset ?? 'USDT', fiat ?? 'KZT');
  }
}
