import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const decimalPattern = /^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/;
const decimalString = ({ value }: { value: unknown }) => typeof value === 'number' ? String(value) : value;
const normalizeBarcode = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;

export class CreateProductDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Length(1, 100)
  sku!: string;

  @Transform(normalizeBarcode) @IsOptional() @IsString() @Length(1, 128)
  barcode?: string | null;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 160)
  name!: string;

  @IsOptional() @IsString() @Length(0, 5000)
  description?: string | null;

  @IsUUID()
  categoryId!: string;

  @Transform(decimalString) @IsString() @Matches(decimalPattern)
  costPrice!: string;

  @Transform(decimalString) @IsString() @Matches(decimalPattern)
  sellingPrice!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 40)
  unit!: string;

  @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647)
  stockQuantity!: number;

  @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647)
  minStock!: number;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
