import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class OpenFuturesPositionDto {
  @IsIn(['LONG', 'SHORT'])
  side!: 'LONG' | 'SHORT';

  @IsString()
  @MaxLength(24)
  symbol!: string;

  @IsString()
  quantity!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  leverage!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientOrderId!: string;
}
