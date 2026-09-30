import { Module } from '@nestjs/common';

import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { StorageService } from './storage.service';

@Module({ providers: [CloudinaryStorageAdapter, LocalStorageAdapter, StorageService], exports: [StorageService] })
export class StorageModule {}
