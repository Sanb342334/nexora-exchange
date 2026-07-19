import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { CreateHedgeDto } from './dto/hedge.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Roles('ADMIN')
@Controller('admin/hedge')
export class ExchangeController {
  constructor(private readonly exchange: ExchangeService) {}

  @Get('adapter')
  adapter() {
    return { adapter: this.exchange.adapterName };
  }

  @Get('ticker')
  ticker(@Query('symbol') symbol: string) {
    return this.exchange.getTicker(symbol || 'USDTUSDT');
  }

  @Get()
  list(@Query('dealId') dealId?: string) {
    return this.exchange.list(dealId);
  }

  @Post()
  create(@Body() dto: CreateHedgeDto, @CurrentUser() admin: AuthUser) {
    return this.exchange.createHedge(dto, admin.id);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string) {
    return this.exchange.submitHedge(id);
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.exchange.syncHedge(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.exchange.cancelHedge(id);
  }
}
