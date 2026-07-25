import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PlaceSpotOrderDto {
  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'])
  type!: 'MARKET' | 'LIMIT';

  @IsString()
  @MaxLength(24)
  symbol!: string;

  @IsString()
  quantity!: string;

  @IsOptional()
  @IsString()
  price?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientOrderId!: string;
}
