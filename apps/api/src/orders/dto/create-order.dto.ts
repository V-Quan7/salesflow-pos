import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested, IsIn } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2_147_483_647) quantity!: number;
}

export class CreateOrderDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
  @IsOptional() @Transform(({ value }) => value === undefined ? undefined : String(value)) @IsString() @Matches(/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/)
  discount?: string;
  @IsIn(['CASH', 'CARD', 'BANK_TRANSFER', 'E_WALLET']) paymentMethod!: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
}
