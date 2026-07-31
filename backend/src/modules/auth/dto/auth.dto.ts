import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class Enable2faDto {
  @IsString()
  totpCode!: string;
}

export class TelegramAuthDto {
  @IsString()
  @MinLength(10)
  initData!: string;
}

export class RegisterDto {
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

  @IsString()
  countryCode!: string;

  @IsString()
  preferredFiat!: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
