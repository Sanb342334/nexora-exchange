import { Injectable } from '@nestjs/common';

export type CryptoNetwork = {
  id: string;
  asset: string;
  network: string;
  address: string;
};

/** Crypto deposit addresses from env (admin-configured). */
@Injectable()
export class DepositCryptoConfig {
  list(): CryptoNetwork[] {
    const rows: CryptoNetwork[] = [];
    const push = (id: string, asset: string, network: string, envKey: string) => {
      const address = (process.env[envKey] || '').trim();
      if (address) rows.push({ id, asset, network, address });
    };
    push('usdt_trc20', 'USDT', 'TRC20', 'DEPOSIT_CRYPTO_USDT_TRC20');
    push('usdt_erc20', 'USDT', 'ERC20', 'DEPOSIT_CRYPTO_USDT_ERC20');
    push('usdt_bep20', 'USDT', 'BEP20', 'DEPOSIT_CRYPTO_USDT_BEP20');
    push('btc', 'BTC', 'Bitcoin', 'DEPOSIT_CRYPTO_BTC');
    push('eth', 'ETH', 'ERC20', 'DEPOSIT_CRYPTO_ETH');
    return rows;
  }

  get(id: string) {
    return this.list().find((x) => x.id === id) ?? null;
  }
}
