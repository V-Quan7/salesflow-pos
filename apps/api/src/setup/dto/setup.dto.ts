import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEmail, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

import { STORE_CODE_PATTERN } from '../../store/store.constants';

export class SetupStoreDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 120)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Matches(STORE_CODE_PATTERN)
  code!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(64)
  timezone!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(35)
  locale!: string;
}

export class SetupOwnerDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 150)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(255)
  email!: string;

  @IsString() @Length(12, 128)
  password!: string;
}

export class SetupDto {
  @IsString() @Length(32, 512)
  setupToken!: string;

  @IsDefined() @ValidateNested() @Type(() => SetupStoreDto)
  store!: SetupStoreDto;

  @IsDefined() @ValidateNested() @Type(() => SetupOwnerDto)
  owner!: SetupOwnerDto;
}
