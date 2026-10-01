import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma, StoreSettingValueType } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, timingSafeEqual } from 'node:crypto';

import { ALL_PERMISSIONS } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import { SetupDto } from './dto/setup.dto';

const ADVISORY_LOCK_KEY = 7_419_252_601n;
const STAFF_PERMISSION_CODES = new Set([
  'auth:me', 'products:read', 'categories:read', 'inventory:read',
  'customers:read', 'orders:create', 'orders:read',
]);

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<{ setupRequired: boolean }> {
    const storeCount = await this.prisma.store.count();
    return { setupRequired: storeCount === 0 };
  }

  async create(dto: SetupDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY}) IS NULL AS locked`;

        if (await tx.store.count() > 0) {
          throw new ConflictException('System is already initialized.');
        }

        const configuredToken = process.env.INITIAL_SETUP_TOKEN;
        if (!configuredToken || configuredToken.trim() !== configuredToken || configuredToken.length < 32 || configuredToken.length > 512) {
          throw new ServiceUnavailableException('Initial setup is not configured.');
        }
        if (!this.matchesToken(dto.setupToken, configuredToken)) {
          throw new UnauthorizedException('Invalid setup token.');
        }

        const storeName = dto.store.name.trim();
        const storeCode = dto.store.code.trim();
        const ownerName = dto.owner.name.trim();
        const ownerEmail = dto.owner.email.trim().toLowerCase();
        try { Intl.getCanonicalLocales(dto.store.locale.trim()); }
        catch { throw new BadRequestException('Store locale is invalid.'); }
        try { new Intl.DateTimeFormat('en-US', { timeZone: dto.store.timezone.trim() }).format(); }
        catch { throw new BadRequestException('Store timezone is invalid.'); }

        const passwordHash = await argon2.hash(dto.owner.password, { type: argon2.argon2id });
        const store = await tx.store.create({
          data: {
            name: storeName,
            code: storeCode,
            currency: dto.store.currency.trim().toUpperCase(),
            timezone: dto.store.timezone.trim(),
            locale: dto.store.locale.trim(),
          },
        });

        const permissions = new Map<string, { id: string }>();
        for (const [code, description] of ALL_PERMISSIONS) {
          const permission = await tx.permission.upsert({
            where: { code },
            update: { description },
            create: { code, description },
            select: { id: true },
          });
          permissions.set(code, permission);
        }

        const roles = new Map<string, { id: string }>();
        for (const name of ['OWNER', 'ADMIN', 'STAFF'] as const) {
          roles.set(name, await tx.role.create({ data: { storeId: store.id, name }, select: { id: true } }));
        }

        for (const roleName of ['OWNER', 'ADMIN', 'STAFF'] as const) {
          const role = roles.get(roleName)!;
          const allowed = this.permissionsForRole(roleName);
          const links = [...allowed]
            .map((code) => ({ permissionId: permissions.get(code)?.id, roleId: role.id }))
            .filter((row): row is { permissionId: string; roleId: string } => Boolean(row.permissionId));
          await tx.rolePermission.createMany({ data: links, skipDuplicates: true });
        }

        await tx.user.create({
          data: {
            storeId: store.id,
            roleId: roles.get('OWNER')!.id,
            name: ownerName,
            email: ownerEmail,
            passwordHash,
            status: 'ACTIVE',
          },
        });

        // These override only development-specific fallbacks; generic settings remain application defaults.
        await tx.storeSetting.createMany({
          data: [
            { storeId: store.id, key: 'store.displayNameShort', value: store.name, valueType: StoreSettingValueType.STRING, description: 'Store short display name.' },
            { storeId: store.id, key: 'store.browserTitle', value: store.name, valueType: StoreSettingValueType.STRING, description: 'Browser title for this store.' },
            { storeId: store.id, key: 'store.operatingHours', value: '', valueType: StoreSettingValueType.STRING, description: 'Operating hours; blank until configured.' },
          ],
        });

        return { store: { name: store.name, code: store.code }, owner: { name: ownerName, email: ownerEmail } };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Store code or Owner email already exists.');
      throw error;
    }
  }

  private permissionsForRole(roleName: 'OWNER' | 'ADMIN' | 'STAFF') {
    if (roleName === 'OWNER') return ALL_PERMISSIONS.map(([code]) => code);
    if (roleName === 'ADMIN') return ALL_PERMISSIONS.map(([code]) => code).filter((code) => code !== 'users:delete');
    return ALL_PERMISSIONS.map(([code]) => code).filter((code) => STAFF_PERMISSION_CODES.has(code));
  }

  private matchesToken(supplied: string, configured: string): boolean {
    const suppliedDigest = createHash('sha256').update(supplied).digest();
    const configuredDigest = createHash('sha256').update(configured).digest();
    return timingSafeEqual(suppliedDigest, configuredDigest);
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
