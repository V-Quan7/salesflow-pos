export type StoreAssetKind = 'logo' | 'favicon' | 'product';

export interface StoredAsset {
  url: string;
  key: string;
}

export interface StorageAdapter {
  upload(storeId: string, kind: StoreAssetKind, buffer: Buffer, contentType: string, extension: string): Promise<StoredAsset>;
  delete(keyOrUrl: string): Promise<void>;
}

export interface ReadableLocalAsset {
  buffer: Buffer;
  contentType: string;
}
