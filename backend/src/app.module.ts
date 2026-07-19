import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { AdvertisementsModule } from './modules/advertisements/advertisements.module';
import { DealsModule } from './modules/deals/deals.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { RatesModule } from './modules/rates/rates.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RealtimeModule,
    NotificationsModule,
    WalletsModule,
    ExchangeModule,
    RatesModule,
    AuthModule,
    UsersModule,
    PaymentMethodsModule,
    AdvertisementsModule,
    DealsModule,
    TreasuryModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
