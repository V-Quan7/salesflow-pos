import { Injectable, NotFoundException } from '@nestjs/common';

import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { ReadableLocalAsset, StorageAdapter, StoredAsset, StoreAssetKind } from './storage.adapter';

@Injectable()
export class StorageService {
  private readonly adapter: StorageAdapter;
  readonly isLocal: boolean;

  constructor(local: LocalStorageAdapter, cloudinary: CloudinaryStorageAdapter) {
    const provider = process.env.STORAGE_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'cloudinary' : 'local');
    if (provider !== 'local' && provider !== 'cloudinary') throw new Error('STORAGE_PROVIDER must be local or cloudinary');
    this.isLocal = provider === 'local';
    this.adapter = this.isLocal ? local : cloudinary;
  }

  upload(storeId: string, kind: StoreAssetKind, buffer: Buffer, contentType: string, extension: string): Promise<StoredAsset> {
    return this.adapter.upload(storeId, kind, buffer, contentType, extension);
  }

  delete(keyOrUrl: string): Promise<void> { return this.adapter.delete(keyOrUrl); }

  readLocal(storeId: string, filename: string): Promise<ReadableLocalAsset> {
    if (!this.isLocal) throw new NotFoundException();
    return (this.adapter as LocalStorageAdapter).read(storeId, filename);
  }
}
