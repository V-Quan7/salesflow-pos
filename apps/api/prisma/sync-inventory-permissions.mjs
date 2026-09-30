import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import process from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try { process.loadEnvFile(envPath); break; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const definitions = [
  ['inventory:read', 'Read inventory'],
  ['inventory:adjust', 'Adjust inventory'],
];
const permissionsByRole = {
  OWNER: ['inventory:read', 'inventory:adjust'],
  ADMIN: ['inventory:read', 'inventory:adjust'],
  STAFF: ['inventory:read'],
};
const prisma = new PrismaClient();

async function main() {
  const rows = await Promise.all(definitions.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const byCode = new Map(rows.map((permission) => [permission.code, permission]));
  const roles = await prisma.role.findMany({ where: { storeId: { not: null }, name: { in: Object.keys(permissionsByRole) } } });
  for (const role of roles) {
    if (role.name === 'STAFF') {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: byCode.get('inventory:adjust').id } });
    }
    for (const code of permissionsByRole[role.name] ?? []) {
      const permission = byCode.get(code);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  process.stdout.write(`Inventory permissions are ready for ${roles.length} store-scoped role(s).\n`);
}

main().catch((error) => {
  process.stderr.write('Inventory permission sync failed.\n');
  if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
