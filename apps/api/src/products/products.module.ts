import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductImportService } from './product-import.service';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [ProductsController], providers: [ProductsService, ProductImportService] })
export class ProductsModule {}
