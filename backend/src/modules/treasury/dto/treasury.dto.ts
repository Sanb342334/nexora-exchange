import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  currency!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  method?: string;

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

  @IsString()
  destination!: string;
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
