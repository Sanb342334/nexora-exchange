import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { HedgeSide } from '@prisma/client';

export class CreateHedgeDto {
  @IsOptional()
  @IsString()
  dealId?: string;

  @IsEnum(HedgeSide)
  side!: HedgeSide;

  @IsString()
  symbol!: string;

  @IsNumber()
  @IsPositive()
  qty!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsString()
  payoutRequisite?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
