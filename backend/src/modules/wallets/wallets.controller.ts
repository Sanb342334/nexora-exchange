import { Controller, Get } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('balances')
  balances(@CurrentUser() user: AuthUser) {
    return this.wallets.getBalances(user.id);
  }

  @Get('ledger')
  ledger(@CurrentUser() user: AuthUser) {
    return this.wallets.getLedger(user.id);
  }
}
