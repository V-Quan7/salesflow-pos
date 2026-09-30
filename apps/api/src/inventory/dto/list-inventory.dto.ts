import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListInventoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional() @IsIn(['sku', 'name', 'stockQuantity', 'minStock', 'updatedAt'])
  sortBy: 'sku' | 'name' | 'stockQuantity' | 'minStock' | 'updatedAt' = 'name';

  @IsOptional() @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}
