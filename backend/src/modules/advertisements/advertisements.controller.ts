import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdSide, AdStatus } from '@prisma/client';
import { AdvertisementsService } from './advertisements.service';
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
} from './dto/advertisement.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly ads: AdvertisementsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdvertisementDto) {
    return this.ads.create(user.id, dto);
  }

  @Get()
  list(
    @Query('side') side?: AdSide,
    @Query('asset') asset?: string,
    @Query('fiat') fiat?: string,
    @Query('status') status?: AdStatus,
  ) {
    return this.ads.list({ side, asset, fiat, status });
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.ads.listMine(user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ads.getById(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdvertisementDto,
  ) {
    return this.ads.update(user.id, user.role === 'ADMIN', id, dto);
  }
}
