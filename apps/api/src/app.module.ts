import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccessModule } from './access/access.module';
import { StoreModule } from './store/store.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  controllers: [HealthController],
  imports: [PrismaModule, AuthModule, UsersModule, AccessModule, StoreModule, CategoriesModule, ProductsModule, InventoryModule, CustomersModule, OrdersModule, ReportsModule],
})
export class AppModule {}
