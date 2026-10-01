import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const decimalPattern = /^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/;
const decimalString = ({ value }: { value: unknown }) => typeof value === 'number' ? String(value) : value;
const normalizeBarcode = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;

export class UpdateProductDto {
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Length(1, 100)
  sku?: string;

  @IsOptional() @Transform(normalizeBarcode) @IsString() @Length(1, 128)
  barcode?: string | null;

  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 160)
  name?: string;

  @IsOptional() @IsString() @Length(0, 5000)
  description?: string | null;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @Transform(decimalString) @IsString() @Matches(decimalPattern)
  costPrice?: string;

  @IsOptional() @Transform(decimalString) @IsString() @Matches(decimalPattern)
  sellingPrice?: string;

  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 40)
  unit?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647)
  minStock?: number;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  removeImage?: boolean;
}
