import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import process from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try { process.loadEnvFile(envPath); break; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const definitions = [
  ['customers:read', 'Read customers'], ['customers:create', 'Create customers'],
  ['customers:update', 'Update customers'], ['customers:delete', 'Delete or deactivate customers'],
  ['orders:create', 'Create orders at POS'],
];
const grants = {
  OWNER: definitions.map(([code]) => code),
  ADMIN: definitions.map(([code]) => code),
  STAFF: ['customers:read', 'orders:create'],
};
const prisma = new PrismaClient();

async function main() {
  const rows = await Promise.all(definitions.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const byCode = new Map(rows.map((permission) => [permission.code, permission]));
  const roles = await prisma.role.findMany({ where: { storeId: { not: null }, name: { in: Object.keys(grants) } } });
  for (const role of roles) {
    if (role.name === 'STAFF') {
      const staffAllowed = new Set(grants.STAFF);
      const forbidden = rows.filter(({ code }) => !staffAllowed.has(code)).map(({ id }) => id);
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: forbidden } } });
    }
    for (const code of grants[role.name] ?? []) {
      const permission = byCode.get(code);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {}, create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  process.stdout.write(`Customer and POS permissions are ready for ${roles.length} store-scoped role(s).\n`);
}

main().catch((error) => {
  process.stderr.write('Customer and POS permission sync failed.\n');
  if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
