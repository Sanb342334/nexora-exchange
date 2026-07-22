import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { AdSide, AdStatus } from '@prisma/client';

export class CreateAdvertisementDto {
  @IsEnum(AdSide)
  side!: AdSide;

  @IsOptional()
  @IsString()
  asset?: string;

  @IsOptional()
  @IsString()
  fiat?: string;

  @IsOptional()
  @IsBoolean()
  isFloating?: boolean;

  // Fixed price (fiat per asset) when isFloating = false
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  // Margin over market when isFloating = true (e.g. 0.02 = +2%)
  @IsOptional()
  @IsNumber()
  floatingMargin?: number;

  @IsNumber()
  @IsPositive()
  totalAmount!: number; // in fiat

  @IsNumber()
  @IsPositive()
  minFiat!: number;

  @IsNumber()
  @IsPositive()
  maxFiat!: number;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsNumber()
  paymentWindowMin?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethodIds?: string[];
}

export class UpdateAdvertisementDto {
  @IsOptional()
  @IsEnum(AdStatus)
  status?: AdStatus;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsNumber()
  floatingMargin?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  minFiat?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxFiat?: number;

  @IsOptional()
  @IsString()
  terms?: string;
}
