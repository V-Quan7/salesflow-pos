import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { AUTH_COOKIE } from '../auth.constants';
import { AuthenticatedUser, JwtClaims } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = request.cookies?.[AUTH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();

    try {
      const claims = await this.jwt.verifyAsync<JwtClaims>(token);
      const session = await this.prisma.authSession.findUnique({
        where: { id: claims.sid },
        include: {
          user: {
            include: {
              store: { select: { id: true, code: true, name: true, timezone: true } },
              role: {
                include: {
                  permissions: { include: { permission: { select: { code: true } } } },
                },
              },
            },
          },
        },
      });

      if (
        !session ||
        session.userId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== 'ACTIVE'
      ) throw new UnauthorizedException();

      request.user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        status: session.user.status,
        storeId: session.user.storeId,
        roleId: session.user.role.id,
        roleName: session.user.role.name,
        roleStoreId: session.user.role.storeId,
        store: session.user.store,
        permissions: session.user.role.permissions.map(({ permission }) => permission.code),
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
