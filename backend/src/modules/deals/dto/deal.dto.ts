import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateDealDto {
  @IsString()
  advertisementId!: string;

  // Amount in fiat the taker wants to trade.
  @IsNumber()
  @IsPositive()
  fiatAmount!: number;

  // Taker's payment method (required when taker is the one receiving fiat).
  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}

export class CancelDealDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class OpenDisputeDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
