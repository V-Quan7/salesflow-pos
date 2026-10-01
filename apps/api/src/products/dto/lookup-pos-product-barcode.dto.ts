import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LookupPosProductBarcodeDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 128)
  barcode!: string;
}
