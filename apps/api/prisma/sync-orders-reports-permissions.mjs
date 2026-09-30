import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import process from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try { process.loadEnvFile(envPath); break; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const definitions = [
  ['orders:create', 'Create orders at POS'], ['orders:read', 'Read orders'],
  ['orders:update', 'Update order state through allowed operations'], ['orders:cancel', 'Cancel pending orders'],
  ['orders:refund', 'Refund completed orders'], ['reports:read', 'Read store reports'],
];
const grants = {
  OWNER: definitions.map(([code]) => code),
  ADMIN: definitions.map(([code]) => code),
  STAFF: ['orders:create', 'orders:read'],
};
const prisma = new PrismaClient();

async function main() {
  const permissions = await Promise.all(definitions.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const byCode = new Map(permissions.map((permission) => [permission.code, permission]));
  const roles = await prisma.role.findMany({ where: { storeId: { not: null }, name: { in: Object.keys(grants) } } });
  for (const role of roles) {
    const allowed = new Set(grants[role.name] ?? []);
    const disallowedIds = permissions.filter(({ code }) => !allowed.has(code)).map(({ id }) => id);
    if (disallowedIds.length) await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: disallowedIds } } });
    for (const code of allowed) {
      const permission = byCode.get(code);
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  process.stdout.write(`Order and report permissions are ready for ${roles.length} store-scoped role(s).\n`);
}

main().catch((error) => {
  process.stderr.write('Order and report permission sync failed.\n');
  if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
