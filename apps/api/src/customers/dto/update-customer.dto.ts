import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @Transform(({ value }) => typeof value === 'string' ? (value.trim() || null) : value)
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @Transform(({ value }) => typeof value === 'string' ? (value.trim() || null) : value)
  @IsOptional() @IsEmail() @MaxLength(255) email?: string | null;
  @Transform(({ value }) => typeof value === 'string' ? (value.trim() || null) : value)
  @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @Transform(({ value }) => typeof value === 'string' ? (value.trim() || null) : value)
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
