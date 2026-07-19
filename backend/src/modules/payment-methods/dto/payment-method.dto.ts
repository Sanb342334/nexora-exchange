import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PaymentMethodType } from '@prisma/client';

export class CreatePaymentMethodDto {
  @IsEnum(PaymentMethodType)
  type!: PaymentMethodType;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsString()
  @MinLength(2)
  holderName!: string;

  @IsString()
  @MinLength(2)
  details!: string;

  @IsOptional()
  @IsString()
  fiat?: string;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  holderName?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
