import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthenticatedUser } from '../auth/auth.types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { imageUploadOptions, UploadedImageFile, validateImageSignature } from '../storage/image-validation';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ListPosProductsDto } from './dto/list-pos-products.dto';
import { LookupPosProductBarcodeDto } from './dto/lookup-pos-product-barcode.dto';
import { ProductImportService, PRODUCT_IMPORT_MAX_FILE_SIZE, PRODUCT_IMPORT_MIME_TYPE, ProductImportFile } from './product-import.service';

@Controller('products')
@UseGuards(AuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService, private readonly productImports: ProductImportService) {}

  @Get()
  @RequirePermissions('products:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListProductsDto) {
    return this.products.list(actor, query);
  }

  @Get('pos')
  @RequirePermissions('products:read')
  listPos(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListPosProductsDto) {
    return this.products.listForPos(actor, query);
  }

  @Get('pos/lookup')
  @RequirePermissions('products:read')
  lookupPosBarcode(@CurrentUser() actor: AuthenticatedUser, @Query() query: LookupPosProductBarcodeDto) {
    return this.products.lookupForPosByBarcode(actor, query.barcode);
  }

  @Get('import/template')
  @RequirePermissions('products:create')
  async downloadImportTemplate() {
    return new StreamableFile(await this.productImports.createTemplate(), {
      type: PRODUCT_IMPORT_MIME_TYPE,
      disposition: 'attachment; filename="salesflow-products-template.xlsx"',
    });
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', productImportUploadOptions()))
  @RequirePermissions('products:create')
  previewImport(@CurrentUser() actor: AuthenticatedUser, @UploadedFile() file?: ProductImportFile) {
    return this.productImports.preview(actor, file!);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', productImportUploadOptions()))
  @RequirePermissions('products:create')
  importProducts(@CurrentUser() actor: AuthenticatedUser, @UploadedFile() file?: ProductImportFile) {
    return this.productImports.import(actor, file!);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(actor, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions()))
  @RequirePermissions('products:create')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProductDto, @UploadedFile() image?: UploadedImageFile) {
    if (image && !validateImageSignature(image)) throw new BadRequestException('The uploaded file is not a supported image');
    return this.products.create(actor, dto, image);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions()))
  @RequirePermissions('products:update')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto, @UploadedFile() image?: UploadedImageFile) {
    if (image && !validateImageSignature(image)) throw new BadRequestException('The uploaded file is not a supported image');
    return this.products.update(actor, id, dto, image);
  }

  @Delete(':id')
  @RequirePermissions('products:delete')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(actor, id);
  }
}

function productImportUploadOptions() {
  return {
    limits: { fileSize: PRODUCT_IMPORT_MAX_FILE_SIZE, files: 1, fields: 0 },
  };
}
