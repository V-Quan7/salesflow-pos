import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 150)
  name?: string;

  @IsOptional() @IsEmail() @MaxLength(255)
  email?: string;

  @IsOptional() @IsString() @Length(12, 128)
  password?: string;

  @IsOptional() @IsUUID()
  roleId?: string;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
