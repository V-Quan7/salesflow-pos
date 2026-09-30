import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InventoryTransactionReferenceType, InventoryTransactionType, Prisma, ProductStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadedImageFile, validateImageSignature } from '../storage/image-validation';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ListPosProductsDto } from './dto/list-pos-products.dto';

const logger = new Logger('ProductsService');
const productInclude = { category: { select: { id: true, name: true, slug: true, status: true } } } as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async list(actor: AuthenticatedUser, query: ListProductsDto) {
    const where: Prisma.ProductWhereInput = {
      storeId: actor.storeId,
      ...(query.status ? { status: query.status as ProductStatus } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { sku: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: { [query.sortBy]: query.order }, include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async listForPos(actor: AuthenticatedUser, query: ListPosProductsDto) {
    const search = query.search?.trim();
    const store = await this.prisma.store.findUnique({ where: { id: actor.storeId }, select: { currency: true } });
    if (!store) throw new NotFoundException('Store not found');
    const where: Prisma.ProductWhereInput = {
      storeId: actor.storeId, status: ProductStatus.ACTIVE,
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ name: 'asc' }, { id: 'asc' }], select: {
          id: true, sku: true, name: true, sellingPrice: true, unit: true, stockQuantity: true,
          status: true, imageUrl: true, category: { select: { id: true, name: true } },
        } }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit, currency: store.currency };
  }

  async get(actor: AuthenticatedUser, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, storeId: actor.storeId }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(actor: AuthenticatedUser, dto: CreateProductDto, image?: UploadedImageFile) {
    await this.assertStoreCategory(actor.storeId, dto.categoryId);
    let imageUrl: string | null = null;
    let imageKey: string | undefined;
    if (image) {
      const extension = validateImageSignature(image);
      if (!extension) throw new BadRequestException('The uploaded file is not a supported image');
      const stored = await this.storage.upload(actor.storeId, 'product', image.buffer, image.mimetype, extension);
      imageUrl = stored.url;
      imageKey = stored.key;
    }
    try {
      const data: Prisma.ProductUncheckedCreateInput = {
          storeId: actor.storeId, categoryId: dto.categoryId,
          sku: dto.sku.trim().toUpperCase(), name: dto.name.trim(),
          description: dto.description?.trim() || null,
          costPrice: new Prisma.Decimal(dto.costPrice), sellingPrice: new Prisma.Decimal(dto.sellingPrice),
          unit: dto.unit.trim(), stockQuantity: dto.stockQuantity, minStock: dto.minStock,
          status: dto.status ?? 'ACTIVE', imageUrl,
      };
      if (dto.stockQuantity === 0) {
        return await this.prisma.product.create({ data, include: productInclude });
      }
      return await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.create({ data, include: productInclude });
        await transaction.inventoryTransaction.create({
          data: {
            storeId: actor.storeId, productId: product.id, type: InventoryTransactionType.ADJUSTMENT,
            quantity: dto.stockQuantity, beforeQuantity: 0, afterQuantity: dto.stockQuantity,
            referenceType: InventoryTransactionReferenceType.ADJUSTMENT, referenceId: randomUUID(),
            note: 'Opening stock', createdBy: actor.id,
          },
        });
        return product;
      });
    } catch (error) {
      if (imageKey) await this.storage.delete(imageKey).catch(() => undefined);
      if (this.isUniqueError(error)) throw new ConflictException('Product SKU already exists in this store');
      if (this.isForeignKeyError(error)) throw new BadRequestException('The selected category is unavailable');
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProductDto, image?: UploadedImageFile) {
    const existing = await this.get(actor, id);
    if (image && dto.removeImage) throw new BadRequestException('Upload an image or remove the current image, not both');
    if (dto.categoryId) await this.assertStoreCategory(actor.storeId, dto.categoryId);

    let nextImageUrl: string | undefined;
    let nextImageKey: string | undefined;
    if (image) {
      const extension = validateImageSignature(image);
      if (!extension) throw new BadRequestException('The uploaded file is not a supported image');
      const stored = await this.storage.upload(actor.storeId, 'product', image.buffer, image.mimetype, extension);
      nextImageUrl = stored.url;
      nextImageKey = stored.key;
    }

    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku.trim().toUpperCase() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.costPrice !== undefined ? { costPrice: new Prisma.Decimal(dto.costPrice) } : {}),
          ...(dto.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(dto.sellingPrice) } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
          ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(image ? { imageUrl: nextImageUrl! } : dto.removeImage ? { imageUrl: null } : {}),
        },
        include: productInclude,
      });
      if (existing.imageUrl && (image || dto.removeImage)) {
        await this.cleanupAsset(existing.imageUrl);
      }
      return updated;
    } catch (error) {
      if (nextImageKey) await this.storage.delete(nextImageKey).catch(() => undefined);
      if (this.isUniqueError(error)) throw new ConflictException('Product SKU already exists in this store');
      if (this.isForeignKeyError(error)) throw new BadRequestException('The selected category is unavailable');
      throw error;
    }
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, storeId: actor.storeId },
      include: { _count: { select: { orderItems: true, inventoryTransactions: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product._count.orderItems > 0 || product._count.inventoryTransactions > 0) {
      const deactivated = await this.prisma.product.update({ where: { id }, data: { status: 'INACTIVE' }, include: productInclude });
      return { ...deactivated, deactivated: true };
    }
    try {
      await this.prisma.product.delete({ where: { id } });
      if (product.imageUrl) await this.cleanupAsset(product.imageUrl);
      return { id, deleted: true };
    } catch (error) {
      if (this.isForeignKeyError(error)) {
        const deactivated = await this.prisma.product.update({ where: { id }, data: { status: 'INACTIVE' }, include: productInclude });
        return { ...deactivated, deactivated: true };
      }
      throw error;
    }
  }

  private async assertStoreCategory(storeId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, storeId }, select: { id: true } });
    if (!category) throw new BadRequestException('The selected category is unavailable for this store');
  }

  private async cleanupAsset(url: string) {
    await this.storage.delete(url).catch(() => logger.warn('Product was saved but its previous image could not be cleaned up.'));
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private isForeignKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
  }
}
