import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2_147_483_647) quantity!: number;
}

export class CreateOrderDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
  @IsOptional() @Transform(({ value }) => value === undefined ? undefined : String(value)) @IsString() @Matches(/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/)
  /** Legacy fixed-discount input retained for existing clients. */
  discount?: string;
  @IsOptional() @IsIn(['FIXED', 'PERCENTAGE']) discountType?: 'FIXED' | 'PERCENTAGE';
  @IsOptional() @Transform(({ value }) => value === undefined ? undefined : String(value)) @IsString() @Matches(/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/)
  discountValue?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' && value.trim() === '' ? undefined : value === null || value === undefined ? value : String(value)) @IsString() @Matches(/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/)
  amountReceived?: string | null;
  /** Explicit staff attestation for non-cash methods; this is not a gateway verification. */
  @IsOptional() @IsBoolean() manualPaymentConfirmed?: boolean;
  @IsIn(['CASH', 'CARD', 'BANK_TRANSFER', 'E_WALLET']) paymentMethod!: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
}
