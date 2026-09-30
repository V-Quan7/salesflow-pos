import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class ListOrdersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']) status?: string;
  @IsOptional() @IsIn(['PENDING', 'PAID', 'REFUNDED']) paymentStatus?: string;
  @IsOptional() @IsIn(['CASH', 'CARD', 'BANK_TRANSFER', 'E_WALLET']) paymentMethod?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;
  @IsOptional() @IsIn(['createdAt', 'updatedAt', 'orderCode', 'total']) sort: 'createdAt' | 'updatedAt' | 'orderCode' | 'total' = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
}
