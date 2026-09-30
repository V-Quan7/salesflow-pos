import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedUser } from '../auth.types';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(), context.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
    if (!required.every((permission) => user.permissions.includes(permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
