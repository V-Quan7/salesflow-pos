import { Controller, Get, UseGuards } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ALL_PERMISSIONS } from '../auth/auth.constants';

@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class AccessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  @RequirePermissions('roles:read')
  roles(@CurrentUser() actor: AuthenticatedUser) {
    return this.prisma.role.findMany({
      where: actor.roleStoreId === null ? {} : { OR: [{ storeId: actor.storeId }, { storeId: null }] },
      select: {
        id: true,
        storeId: true,
        name: true,
        permissions: {
          where: { permission: { code: { in: ALL_PERMISSIONS.map(([code]) => code) } } },
          select: { permission: { select: { code: true, description: true } } },
        },
      },
      orderBy: [{ storeId: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('permissions')
  @RequirePermissions('permissions:read')
  permissions() {
    return this.prisma.permission.findMany({
      where: { code: { in: ALL_PERMISSIONS.map(([code]) => code) } },
      select: { id: true, code: true, description: true },
      orderBy: { code: 'asc' },
    });
  }
}
