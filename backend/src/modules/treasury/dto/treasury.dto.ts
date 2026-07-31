import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  currency!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  /** CARD_P2P | CRYPTO */
  @IsOptional()
  @IsString()
  method?: string;

  /** Crypto network id from /treasury/deposit-methods (e.g. usdt_trc20) */
  @IsOptional()
  @IsString()
  cryptoNetwork?: string;

  @IsOptional()
  @IsString()
  txHash?: string;

  @IsOptional()
  @IsString()
  proofUrl?: string;
}

export class CreateWithdrawalDto {
  @IsString()
  currency!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  /** CARD | CRYPTO */
  @IsOptional()
  @IsString()
  method?: string;

  @IsString()
  destination!: string;

  @IsOptional()
  @IsString()
  holderName?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdjustBalanceDto {
  @IsString()
  userId!: string;

  @IsString()
  currency!: string;

  // Positive = credit, negative = debit
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
