import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryStatus, Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListCategoriesDto) {
    const where: Prisma.CategoryWhereInput = {
      storeId: actor.storeId,
      ...(query.status ? { status: query.status as CategoryStatus } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { slug: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: { [query.sortBy]: query.order },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async create(actor: AuthenticatedUser, dto: CreateCategoryDto) {
    const slug = dto.slug.trim().toLowerCase();
    const duplicate = await this.prisma.category.findFirst({ where: { storeId: actor.storeId, slug }, select: { id: true } });
    if (duplicate) throw new ConflictException('Category slug already exists in this store');
    try {
      return await this.prisma.category.create({ data: {
        storeId: actor.storeId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        status: dto.status ?? 'ACTIVE',
      } });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Category slug already exists in this store');
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCategoryDto) {
    const existing = await this.getExisting(actor, id);
    const slug = dto.slug?.trim().toLowerCase();
    if (slug !== undefined) {
      const duplicate = await this.prisma.category.findFirst({ where: { storeId: existing.storeId, slug, id: { not: id } }, select: { id: true } });
      if (duplicate) throw new ConflictException('Category slug already exists in this store');
    }
    try {
      return await this.prisma.category.update({ where: { id }, data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      } });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Category slug already exists in this store');
      throw error;
    }
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, storeId: actor.storeId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0) {
      const deactivated = await this.prisma.category.update({ where: { id }, data: { status: 'INACTIVE' } });
      return { ...deactivated, deactivated: true };
    }
    try {
      await this.prisma.category.delete({ where: { id } });
      return { id, deleted: true };
    } catch (error) {
      if (this.isForeignKeyError(error)) {
        const deactivated = await this.prisma.category.update({ where: { id }, data: { status: 'INACTIVE' } });
        return { ...deactivated, deactivated: true };
      }
      throw error;
    }
  }

  private async getExisting(actor: AuthenticatedUser, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, storeId: actor.storeId } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private isForeignKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
  }
}
