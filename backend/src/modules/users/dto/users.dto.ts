import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTraderDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsNumber()
  takerFee?: number;

  @IsOptional()
  @IsNumber()
  makerFee?: number;

  @IsOptional()
  @IsNumber()
  spread?: number;

  @IsOptional()
  @IsNumber()
  dailyTradeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxOpenDeals?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsNumber()
  takerFee?: number;

  @IsOptional()
  @IsNumber()
  makerFee?: number;

  @IsOptional()
  @IsNumber()
  spread?: number;

  @IsOptional()
  @IsNumber()
  dailyTradeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxOpenDeals?: number;

  @IsOptional()
  @IsBoolean()
  blocked?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
