const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');

const { LocalStorageAdapter } = require('../dist/storage/local-storage.adapter');

test('local storage can upload, read, and safely delete a store asset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'salesflow-assets-'));
  process.env.LOCAL_STORAGE_DIR = root;
  process.env.API_PUBLIC_URL = 'http://localhost:3001';
  const adapter = new LocalStorageAdapter();
  const storeId = randomUUID();
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  try {
    const saved = await adapter.upload(storeId, 'logo', image, 'image/png', '.png');
    assert.match(saved.url, new RegExp(`/api/store/assets/${storeId}/logo-[0-9a-f-]+\\.png$`, 'i'));
    const filename = basename(new URL(saved.url).pathname);
    const loaded = await adapter.read(storeId, filename);
    assert.equal(loaded.contentType, 'image/png');
    assert.deepEqual(loaded.buffer, image);
    await adapter.delete(saved.key);
    await assert.rejects(() => adapter.read(storeId, filename), (error) => error.getStatus() === 404);

    const productImage = await adapter.upload(storeId, 'product', image, 'image/png', '.png');
    assert.match(productImage.url, new RegExp(`/api/store/assets/${storeId}/product-[0-9a-f-]+\\.png$`, 'i'));
    await adapter.delete(productImage.key);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
