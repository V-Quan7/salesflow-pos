import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { StoreController } from './store.controller';
import { StorePublicController } from './store-public.controller';
import { StoreService } from './store.service';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [StoreController, StorePublicController], providers: [StoreService] })
export class StoreModule {}
