import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';

import { StoreService } from './store.service';
import { StorageService } from '../storage/storage.service';

@Controller('store')
export class StorePublicController {
  constructor(private readonly store: StoreService, private readonly storage: StorageService) {}

  @Get('public-config/:storeCode')
  publicConfig(@Param('storeCode') storeCode: string) { return this.store.publicConfig(storeCode); }

  @Get('assets/:storeId/:filename')
  async asset(@Param('storeId') storeId: string, @Param('filename') filename: string, @Res({ passthrough: true }) response: Response) {
    const asset = await this.storage.readLocal(storeId, filename);
    response.setHeader('Content-Type', asset.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(asset.buffer);
  }
}
