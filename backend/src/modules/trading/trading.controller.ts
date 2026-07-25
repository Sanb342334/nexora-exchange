import { Controller, Delete, Get, Param, Post, Body, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TradingService } from './trading.service';
import { SpotOrderService } from './spot-order.service';
import { FuturesPositionService } from './futures-position.service';
import { OpenFuturesPositionDto } from './dto/futures.dto';
import { PlaceSpotOrderDto } from './dto/spot.dto';

@Controller('trading')
export class TradingController {
  constructor(
    private readonly trading: TradingService,
    private readonly spotOrders: SpotOrderService,
    private readonly futures: FuturesPositionService,
  ) {}

  @Public()
  @Get('pairs')
  pairs(@Query('type') type?: 'spot' | 'futures') {
    return this.trading.listPairs(type);
  }

  @Public()
  @Get('orderbook/:symbol')
  orderBook(@Param('symbol') symbol: string) {
    return this.trading.orderBook(symbol);
  }

  @Public()
  @Get('trades/recent/:symbol')
  recentTrades(@Param('symbol') symbol: string) {
    return this.trading.recentTrades(symbol);
  }

  @Get('orders')
  myOrders(@CurrentUser() user: AuthUser) {
    return this.spotOrders.list(user.id);
  }

  @Get('trades')
  myTrades(@CurrentUser() user: AuthUser) {
    return this.spotOrders.listTrades(user.id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('orders')
  placeOrder(@CurrentUser() user: AuthUser, @Body() dto: PlaceSpotOrderDto) {
    return this.spotOrders.place(user.id, dto);
  }

  @Delete('orders/:id')
  cancelOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.spotOrders.cancel(user.id, id);
  }

  @Get('futures/positions')
  listFutures(@CurrentUser() user: AuthUser, @Query('symbol') symbol?: string) {
    return this.futures.list(user.id, symbol, true);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('futures/positions')
  openFutures(@CurrentUser() user: AuthUser, @Body() dto: OpenFuturesPositionDto) {
    return this.futures.open(user.id, dto);
  }

  @Post('futures/positions/:id/close')
  closeFutures(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.futures.close(user.id, id);
  }
}
