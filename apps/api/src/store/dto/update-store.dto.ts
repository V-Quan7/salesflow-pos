import { IsEmail, IsHexColor, IsOptional, IsString, MaxLength, Matches, IsUrl, ValidateIf } from 'class-validator';

import { STORE_CODE_PATTERN } from '../store.constants';

export class UpdateStoreDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(STORE_CODE_PATTERN) code?: string;
  @IsOptional() @IsString() @MaxLength(240) slogan?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '') @IsEmail() @MaxLength(254) email?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '') @IsUrl({ require_protocol: true }) @MaxLength(2048) website?: string | null;
  @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @IsHexColor() primaryColor?: string | null;
  @IsOptional() @IsHexColor() secondaryColor?: string | null;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(35) locale?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}
