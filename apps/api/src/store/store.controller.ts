import { Body, Controller, Delete, Get, Param, Patch, Put, UploadedFile, UseGuards, UseInterceptors, BadRequestException, Post } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthenticatedUser } from '../auth/auth.types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { imageUploadOptions, UploadedImageFile, validateImageSignature } from '../storage/image-validation';
import { StoreService } from './store.service';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Controller('store')
@UseGuards(AuthGuard, PermissionsGuard)
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  @RequirePermissions('store:read')
  getStore(@CurrentUser() actor: AuthenticatedUser) { return this.store.getStore(actor); }

  @Patch()
  @RequirePermissions('store:update')
  updateStore(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateStoreDto) { return this.store.updateStore(actor, dto); }

  @Get('settings')
  @RequirePermissions('settings:read')
  settings(@CurrentUser() actor: AuthenticatedUser) { return this.store.listSettings(actor); }

  @Patch('settings')
  @RequirePermissions('settings:update')
  updateSettings(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateSettingsDto) { return this.store.updateSettings(actor, dto); }

  @Get('content')
  @RequirePermissions('content:read')
  content(@CurrentUser() actor: AuthenticatedUser) { return this.store.listContent(actor); }

  @Get('content/:key')
  @RequirePermissions('content:read')
  contentByKey(@CurrentUser() actor: AuthenticatedUser, @Param('key') key: string) { return this.store.getContent(actor, key); }

  @Put('content/:key')
  @RequirePermissions('content:update')
  updateContent(@CurrentUser() actor: AuthenticatedUser, @Param('key') key: string, @Body() dto: UpdateContentBlockDto) {
    return this.store.updateContent(actor, key, dto);
  }

  @Post('content/:key/reset')
  @RequirePermissions('content:update')
  resetContent(@CurrentUser() actor: AuthenticatedUser, @Param('key') key: string) { return this.store.resetContent(actor, key); }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions()))
  @RequirePermissions('store:update', 'assets:upload')
  uploadLogo(@CurrentUser() actor: AuthenticatedUser, @UploadedFile() file?: UploadedImageFile) { return this.upload(actor, 'logo', file); }

  @Delete('logo')
  @RequirePermissions('store:update', 'assets:delete')
  deleteLogo(@CurrentUser() actor: AuthenticatedUser) { return this.store.removeAsset(actor, 'logo'); }

  @Post('favicon')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions()))
  @RequirePermissions('store:update', 'assets:upload')
  uploadFavicon(@CurrentUser() actor: AuthenticatedUser, @UploadedFile() file?: UploadedImageFile) { return this.upload(actor, 'favicon', file); }

  @Delete('favicon')
  @RequirePermissions('store:update', 'assets:delete')
  deleteFavicon(@CurrentUser() actor: AuthenticatedUser) { return this.store.removeAsset(actor, 'favicon'); }

  private async upload(actor: AuthenticatedUser, kind: 'logo' | 'favicon', file?: UploadedImageFile) {
    if (!file) throw new BadRequestException('An image file is required');
    const extension = validateImageSignature(file);
    if (!extension) throw new BadRequestException('The uploaded file is not a supported image');
    return this.store.replaceAsset(actor, kind, file.buffer, file.mimetype, extension);
  }
}
