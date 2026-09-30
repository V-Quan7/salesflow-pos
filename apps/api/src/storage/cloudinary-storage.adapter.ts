import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { StorageAdapter, StoredAsset, StoreAssetKind } from './storage.adapter';

@Injectable()
export class CloudinaryStorageAdapter implements StorageAdapter {
  async upload(storeId: string, kind: StoreAssetKind, buffer: Buffer, contentType: string, extension: string): Promise<StoredAsset> {
    const config = this.config();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = `salesflow/${storeId}/${kind === 'product' ? 'products' : 'store-config'}`;
    const publicId = `${kind}-${randomUUID()}`;
    const signature = this.signature({ folder, public_id: publicId, timestamp }, config.apiSecret);
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(buffer)], { type: contentType }), `${publicId}${extension}`);
    form.set('api_key', config.apiKey);
    form.set('timestamp', timestamp);
    form.set('folder', folder);
    form.set('public_id', publicId);
    form.set('signature', signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, { method: 'POST', body: form });
    if (!response.ok) throw new ServiceUnavailableException('Asset storage is unavailable');
    const result = await response.json() as { secure_url?: string; public_id?: string };
    if (!result.secure_url || !result.public_id) throw new ServiceUnavailableException('Asset storage returned an invalid response');
    return { url: result.secure_url, key: result.secure_url };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const publicId = this.publicIdFromUrl(keyOrUrl);
    if (!publicId) return;
    const config = this.config();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.signature({ public_id: publicId, timestamp }, config.apiSecret);
    const form = new FormData();
    form.set('public_id', publicId);
    form.set('api_key', config.apiKey);
    form.set('timestamp', timestamp);
    form.set('signature', signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, { method: 'POST', body: form });
    if (!response.ok) throw new ServiceUnavailableException('Asset storage is unavailable');
    const result = await response.json() as { result?: string };
    if (result.result !== 'ok' && result.result !== 'not found') throw new ServiceUnavailableException('Asset cleanup failed');
  }

  private config() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new ServiceUnavailableException('Cloud asset storage is not configured');
    return { cloudName, apiKey, apiSecret };
  }

  private signature(parameters: Record<string, string>, secret: string): string {
    const canonical = Object.keys(parameters).sort().map((key) => `${key}=${parameters[key]}`).join('&');
    return createHash('sha1').update(`${canonical}${secret}`).digest('hex');
  }

  private publicIdFromUrl(value: string): string | undefined {
    try {
      const path = new URL(value).pathname;
      const marker = '/image/upload/';
      const index = path.indexOf(marker);
      if (index < 0) return undefined;
      const parts = path.slice(index + marker.length).split('/');
      if (/^v\d+$/.test(parts[0])) parts.shift();
      const assetPath = parts.join('/');
      if (!assetPath.startsWith('salesflow/') || !/\.(?:png|jpg|webp|ico)$/i.test(assetPath)) return undefined;
      return assetPath.replace(/\.(?:png|jpg|webp|ico)$/i, '');
    } catch { return undefined; }
  }
}
