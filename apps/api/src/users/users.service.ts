import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { UserStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const publicUserSelect = {
  id: true, storeId: true, name: true, email: true, status: true,
  role: { select: { id: true, name: true, storeId: true } },
  store: { select: { id: true, code: true, name: true } },
  createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, page = 1, limit = 20, search?: string, status?: string) {
    const where = {
      ...(actor.roleStoreId === null ? {} : { storeId: actor.storeId }),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
      ...(status === 'ACTIVE' || status === 'INACTIVE' ? { status: status as UserStatus } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: publicUserSelect, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(actor: AuthenticatedUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...(actor.roleStoreId === null ? {} : { storeId: actor.storeId }) },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const storeId = actor.roleStoreId === null ? dto.storeId : actor.storeId;
    if (!storeId) throw new ForbiddenException('A store is required');
    await this.validateRole(actor, dto.roleId, storeId);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { storeId_email: { storeId, email } } });
    if (existing) throw new ConflictException('Email already exists in this store');
    return this.prisma.user.create({
      data: {
        storeId, name: dto.name.trim(), email,
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        roleId: dto.roleId, status: 'ACTIVE',
      },
      select: publicUserSelect,
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    await this.get(actor, id);
    if (id === actor.id && dto.status === 'INACTIVE') throw new ForbiddenException('You cannot deactivate your own account');
    if (dto.roleId) {
      const target = await this.get(actor, id);
      await this.validateRole(actor, dto.roleId, target.storeId);
    }
    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
      ...(dto.password !== undefined ? { passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }) } : {}),
      ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    try {
      const result = await this.prisma.user.update({
        where: { id, ...(actor.roleStoreId === null ? {} : { storeId: actor.storeId }) },
        data,
        select: publicUserSelect,
      });
      if (dto.status === 'INACTIVE' || dto.password !== undefined) await this.revokeSessions(id);
      return result;
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Email already exists in this store');
      throw error;
    }
  }

  async deactivate(actor: AuthenticatedUser, id: string) {
    await this.get(actor, id);
    if (id === actor.id) throw new ForbiddenException('You cannot deactivate your own account');
    const result = await this.prisma.user.update({
      where: { id, ...(actor.roleStoreId === null ? {} : { storeId: actor.storeId }) },
      data: { status: 'INACTIVE' },
      select: publicUserSelect,
    });
    await this.revokeSessions(id);
    return result;
  }

  private async validateRole(actor: AuthenticatedUser, roleId: string, storeId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { storeId: true, permissions: { select: { permission: { select: { code: true } } } } },
    });
    if (!role || (role.storeId !== null && role.storeId !== storeId)) throw new ForbiddenException('Role is not available to this store');
    if (role.storeId === null && actor.roleStoreId !== null) throw new ForbiddenException('Global roles cannot be assigned by store users');
    if (role.permissions && role.permissions.some(({ permission }) => !actor.permissions.includes(permission.code))) {
      throw new ForbiddenException('You cannot assign a role with permissions you do not hold');
    }
  }

  private async revokeSessions(userId: string) {
    await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
