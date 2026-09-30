import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE, AUTH_TOKEN_TTL_SECONDS } from './auth.constants';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto, response: Response) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase(), store: { code: dto.storeCode.trim() } },
      include: { store: true, role: { include: { permissions: { include: { permission: { select: { code: true } } } } } } },
    });
    const hashToCheck = user?.passwordHash ?? await this.getDummyHash();
    const validPassword = await argon2.verify(hashToCheck, dto.password).catch(() => false);
    if (!user || user.status !== 'ACTIVE' || !validPassword || !user.role) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_SECONDS * 1000);
    const session = await this.prisma.authSession.create({
      data: { userId: user.id, expiresAt },
    });
    const token = await this.jwt.signAsync({ sub: user.id, sid: session.id });
    response.cookie(AUTH_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
    return this.safeLoginUser(user);
  }

  async logout(token: string | undefined, response: Response): Promise<{ success: true }> {
    if (token) {
      try {
        const claims = await this.jwt.verifyAsync<{ sid?: string }>(token);
        if (claims.sid) {
          await this.prisma.authSession.updateMany({
            where: { id: claims.sid, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      } catch {
        // Clearing an invalid or expired cookie is intentionally idempotent.
      }
    }
    response.clearCookie(AUTH_COOKIE, this.cookieOptions());
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { store: true, role: { include: { permissions: { include: { permission: { select: { code: true } } } } } } },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    return this.safeLoginUser(user);
  }

  private safeLoginUser(user: {
    id: string; name: string; email: string; status: string;
    role: { id: string; name: string; permissions: { permission: { code: string } }[] };
    store: { id: string; code: string; name: string };
  }) {
    return {
      id: user.id, name: user.name, email: user.email, status: user.status,
      role: { id: user.role.id, name: user.role.name },
      permissions: user.role.permissions.map(({ permission }) => permission.code), store: user.store,
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api',
      maxAge: AUTH_TOKEN_TTL_SECONDS * 1000,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomBytes(32), { type: argon2.argon2id });
    return this.dummyHash;
  }
}
