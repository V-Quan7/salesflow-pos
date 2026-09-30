import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateContentBlockDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) content?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
