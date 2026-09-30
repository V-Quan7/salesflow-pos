import { ConflictException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { StoreSettingValueType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CONTENT_BLOCK_DEFAULTS, PUBLIC_CONTENT_KEYS, STORE_SETTING_DEFAULTS } from './store.constants';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

const storeSelect = {
  id: true, name: true, code: true, logoUrl: true, faviconUrl: true, slogan: true,
  description: true, phone: true, email: true, address: true, website: true,
  currency: true, timezone: true, locale: true, primaryColor: true, secondaryColor: true,
  createdAt: true, updatedAt: true,
} as const;

const settingKeySet = new Set<string>(STORE_SETTING_DEFAULTS.map(({ key }) => key));
const contentDefaults = new Map<string, (typeof CONTENT_BLOCK_DEFAULTS)[number]>(CONTENT_BLOCK_DEFAULTS.map((block) => [block.key, block]));
const contentKeySet = new Set<string>(CONTENT_BLOCK_DEFAULTS.map(({ key }) => key));
const logger = new Logger('StoreService');

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async getStore(actor: AuthenticatedUser) {
    return this.prisma.store.findUniqueOrThrow({ where: { id: actor.storeId }, select: storeSelect });
  }

  async updateStore(actor: AuthenticatedUser, dto: UpdateStoreDto) {
    if ((dto.name as unknown) === null || (dto.code as unknown) === null || (dto.currency as unknown) === null ||
        (dto.locale as unknown) === null || (dto.timezone as unknown) === null) {
      throw new BadRequestException('Required store fields cannot be null');
    }
    if (dto.name !== undefined && dto.name.trim().length === 0) throw new BadRequestException('Store name cannot be empty');
    if (dto.code !== undefined && dto.code.trim().length === 0) throw new BadRequestException('Store code cannot be empty');
    if (dto.locale !== undefined) {
      try { Intl.getCanonicalLocales(dto.locale); } catch { throw new BadRequestException('Locale is invalid'); }
    }
    if (dto.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone }).format(); }
      catch { throw new BadRequestException('Timezone is invalid'); }
    }
    const data = {
      ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
      ...(dto.website !== undefined ? { website: dto.website?.trim() || null } : {}),
    };
    try {
      return await this.prisma.store.update({ where: { id: actor.storeId }, data, select: storeSelect });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Store code already exists');
      throw error;
    }
  }

  async listSettings(actor: AuthenticatedUser) {
    const stored = await this.prisma.storeSetting.findMany({ where: { storeId: actor.storeId } });
    const byKey = new Map(stored.map((row) => [row.key, row]));
    return STORE_SETTING_DEFAULTS.map((fallback) => {
      const row = byKey.get(fallback.key);
      return {
        key: fallback.key,
        value: row?.value ?? fallback.value,
        valueType: row?.valueType ?? fallback.valueType,
        description: row?.description ?? fallback.description,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async updateSettings(actor: AuthenticatedUser, dto: UpdateSettingsDto) {
    const entries = Object.entries(dto.settings);
    if (entries.length === 0) throw new BadRequestException('At least one setting is required');
    for (const [key, value] of entries) {
      if (!settingKeySet.has(key)) throw new BadRequestException(`Unsupported setting: ${key}`);
      this.serializeSettingValue(key, value);
    }
    for (const [key, value] of entries) {
      const fallback = STORE_SETTING_DEFAULTS.find((item) => item.key === key)!;
      const valueType = fallback.valueType as StoreSettingValueType;
      await this.prisma.storeSetting.upsert({
        where: { storeId_key: { storeId: actor.storeId, key } },
        update: { value: this.serializeSettingValue(key, value) },
        create: { storeId: actor.storeId, key, value: this.serializeSettingValue(key, value), valueType, description: fallback.description },
      });
    }
    return this.listSettings(actor);
  }

  async listContent(actor: AuthenticatedUser) {
    const stored = await this.prisma.contentBlock.findMany({ where: { storeId: actor.storeId } });
    const byKey = new Map(stored.map((row) => [row.key, row]));
    return CONTENT_BLOCK_DEFAULTS.map((fallback) => {
      const row = byKey.get(fallback.key);
      return row ? { key: row.key, title: row.title, content: row.content, type: row.type, isActive: row.isActive, updatedAt: row.updatedAt }
        : { ...fallback, updatedAt: null };
    });
  }

  async getContent(actor: AuthenticatedUser, key: string) {
    if (!contentKeySet.has(key)) throw new NotFoundException('Content block not found');
    const row = await this.prisma.contentBlock.findUnique({ where: { storeId_key: { storeId: actor.storeId, key } } });
    const fallback = contentDefaults.get(key)!;
    return row ? { key: row.key, title: row.title, content: row.content, type: row.type, isActive: row.isActive, updatedAt: row.updatedAt }
      : { ...fallback, updatedAt: null };
  }

  async updateContent(actor: AuthenticatedUser, key: string, dto: UpdateContentBlockDto) {
    if (!contentKeySet.has(key)) throw new NotFoundException('Content block not found');
    const fallback = contentDefaults.get(key)!;
    const existing = await this.prisma.contentBlock.findUnique({ where: { storeId_key: { storeId: actor.storeId, key } } });
    const data = {
      title: dto.title ?? existing?.title ?? fallback.title,
      content: dto.content ?? existing?.content ?? fallback.content,
      isActive: dto.isActive ?? existing?.isActive ?? fallback.isActive,
      type: existing?.type ?? fallback.type,
    };
    const result = await this.prisma.contentBlock.upsert({
      where: { storeId_key: { storeId: actor.storeId, key } },
      update: data,
      create: { storeId: actor.storeId, key, ...data },
    });
    return { key: result.key, title: result.title, content: result.content, type: result.type, isActive: result.isActive, updatedAt: result.updatedAt };
  }

  async resetContent(actor: AuthenticatedUser, key: string) {
    if (!contentKeySet.has(key)) throw new NotFoundException('Content block not found');
    const fallback = contentDefaults.get(key)!;
    const result = await this.prisma.contentBlock.upsert({
      where: { storeId_key: { storeId: actor.storeId, key } },
      update: { title: fallback.title, content: fallback.content, type: fallback.type, isActive: fallback.isActive },
      create: { storeId: actor.storeId, ...fallback },
    });
    return { key: result.key, title: result.title, content: result.content, type: result.type, isActive: result.isActive, updatedAt: result.updatedAt };
  }

  async publicConfig(storeCode: string) {
    const store = await this.prisma.store.findUnique({
      where: { code: storeCode },
      select: { id: true, code: true, name: true, locale: true, logoUrl: true, faviconUrl: true, primaryColor: true, secondaryColor: true },
    });
    if (!store) throw new NotFoundException('Store not found');
    const [settings, blocks] = await Promise.all([
      this.prisma.storeSetting.findMany({ where: { storeId: store.id, key: { in: ['store.browserTitle', 'store.displayNameShort'] } }, select: { key: true, value: true } }),
      this.prisma.contentBlock.findMany({ where: { storeId: store.id, key: { in: [...PUBLIC_CONTENT_KEYS] }, isActive: true }, select: { key: true, title: true, content: true } }),
    ]);
    const blockMap = new Map(blocks.map((block) => [block.key, block]));
    return {
      store: {
        code: store.code, name: store.name, locale: store.locale,
        shortName: settings.find((setting) => setting.key === 'store.displayNameShort')?.value ?? store.name,
        logoUrl: store.logoUrl, faviconUrl: store.faviconUrl, primaryColor: store.primaryColor, secondaryColor: store.secondaryColor,
      },
      browserTitle: settings.find((setting) => setting.key === 'store.browserTitle')?.value ?? store.name,
      content: PUBLIC_CONTENT_KEYS.map((key) => {
        const block = blockMap.get(key);
        const fallback = contentDefaults.get(key)!;
        return { key, title: block?.title ?? fallback.title, content: block?.content ?? fallback.content };
      }),
    };
  }

  async replaceAsset(actor: AuthenticatedUser, kind: 'logo' | 'favicon', buffer: Buffer, contentType: string, extension: string) {
    const asset = await this.storage.upload(actor.storeId, kind, buffer, contentType, extension);
    const field = kind === 'logo' ? 'logoUrl' : 'faviconUrl';
    let previousUrl: string | null;
    try {
      const current = await this.prisma.store.findUniqueOrThrow({ where: { id: actor.storeId }, select: { logoUrl: true, faviconUrl: true } });
      previousUrl = kind === 'logo' ? current.logoUrl : current.faviconUrl;
      await this.prisma.store.update({ where: { id: actor.storeId }, data: kind === 'logo' ? { logoUrl: asset.url } : { faviconUrl: asset.url } });
    } catch (error) {
      await this.storage.delete(asset.key).catch(() => undefined);
      if (this.isUniqueError(error)) throw new ConflictException('Unable to update store asset');
      throw error;
    }
    if (previousUrl && previousUrl !== asset.url) {
      await this.storage.delete(previousUrl).catch(() => logger.warn('Previous store asset could not be removed after replacement.'));
    }
    return { [field]: asset.url };
  }

  async removeAsset(actor: AuthenticatedUser, kind: 'logo' | 'favicon') {
    const field = kind === 'logo' ? 'logoUrl' : 'faviconUrl';
    const current = await this.prisma.store.findUniqueOrThrow({ where: { id: actor.storeId }, select: { logoUrl: true, faviconUrl: true } });
    const previousUrl: string | null = kind === 'logo' ? current.logoUrl : current.faviconUrl;
    if (previousUrl) {
      await this.prisma.store.update({ where: { id: actor.storeId }, data: kind === 'logo' ? { logoUrl: null } : { faviconUrl: null } });
      await this.storage.delete(previousUrl).catch(() => logger.warn('Store asset reference was removed but asset cleanup failed.'));
    }
    return { [field]: null };
  }

  private serializeSettingValue(key: string, value: unknown): string {
    if (typeof value !== 'string') throw new BadRequestException(`Setting ${key} must be a string`);
    if (value.length > 5000) throw new BadRequestException(`Setting ${key} is too long`);
    return value;
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
