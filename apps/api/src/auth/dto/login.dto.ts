import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 100)
  storeCode!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
