import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['COMPLETED', 'CANCELLED', 'REFUNDED'])
  status!: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000)
  reason?: string;
}
