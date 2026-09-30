import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString() @Length(1, 150)
  name!: string;

  @IsEmail() @MaxLength(255)
  email!: string;

  @IsString() @Length(12, 128)
  password!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional() @IsUUID()
  storeId?: string;
}
