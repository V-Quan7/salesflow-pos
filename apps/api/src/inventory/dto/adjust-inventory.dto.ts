import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, NotEquals } from 'class-validator';

export class AdjustInventoryDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number) @IsInt() @Min(-2_147_483_648) @Max(2_147_483_647) @NotEquals(0)
  quantity!: number;

  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(1000)
  note?: string;
}
