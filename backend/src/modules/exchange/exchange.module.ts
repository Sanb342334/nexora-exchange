import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeService } from './exchange.service';
import { ExchangeController } from './exchange.controller';
import { EXCHANGE_ADAPTER, IExchangeAdapter } from './exchange-adapter.interface';
import { MockExchangeAdapter } from './adapters/mock.adapter';
import { BybitExchangeAdapter } from './adapters/bybit.adapter';
import { MOCK_USDT_FIAT_RATES } from '../../common/mock-fiat-rates';

@Global()
@Module({
  controllers: [ExchangeController],
  providers: [
    ExchangeService,
    {
      provide: EXCHANGE_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IExchangeAdapter => {
        const adapter = config.get<string>('exchange.adapter');
        if (adapter === 'bybit') {
          return new BybitExchangeAdapter({
            apiKey: config.get<string>('exchange.bybitApiKey') ?? '',
            apiSecret: config.get<string>('exchange.bybitApiSecret') ?? '',
            testnet: config.get<boolean>('exchange.bybitTestnet') ?? true,
          });
        }
        const kzt = config.get<number>('rates.staticUsdtKzt') ?? 470;
        return new MockExchangeAdapter({ ...MOCK_USDT_FIAT_RATES, USDTKZT: kzt });
      },
    },
  ],
  exports: [ExchangeService, EXCHANGE_ADAPTER],
})
export class ExchangeModule {}
