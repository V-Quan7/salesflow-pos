import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { ReadableLocalAsset, StorageAdapter, StoredAsset, StoreAssetKind } from './storage.adapter';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root = resolve(process.env.LOCAL_STORAGE_DIR ?? resolve(process.cwd(), 'uploads'));

  async upload(storeId: string, kind: StoreAssetKind, buffer: Buffer, contentType: string, extension: string): Promise<StoredAsset> {
    const filename = `${kind}-${randomUUID()}${extension}`;
    const target = this.resolvePath(storeId, filename);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
    const origin = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`;
    const url = `${origin.replace(/\/$/, '')}/api/store/assets/${storeId}/${filename}`;
    return { url, key: url };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const parsed = this.parseKey(keyOrUrl);
    if (!parsed) return;
    try { await unlink(this.resolvePath(parsed.storeId, parsed.filename)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  async read(storeId: string, filename: string): Promise<ReadableLocalAsset> {
    const extension = extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) throw new NotFoundException();
    try {
      return { buffer: await readFile(this.resolvePath(storeId, filename)), contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException();
      throw error;
    }
  }

  private parseKey(url: string): { storeId: string; filename: string } | undefined {
    try {
      const path = new URL(url).pathname;
      const match = /^\/api\/store\/assets\/([0-9a-f-]{36})\/([a-z]+-[0-9a-f-]{36}\.(?:png|jpg|webp|ico))$/i.exec(path);
      return match ? { storeId: match[1], filename: match[2] } : undefined;
    } catch { return undefined; }
  }

  private resolvePath(storeId: string, filename: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(storeId) || filename !== filename.split(/[\\/]/).at(-1)) {
      throw new NotFoundException();
    }
    const target = resolve(this.root, storeId, filename);
    if (!target.startsWith(`${this.root}${sep}`)) throw new NotFoundException();
    return target;
  }
}
