import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import process from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try { process.loadEnvFile(envPath); break; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const permissionsByRole = {
  OWNER: ['products:read', 'products:create', 'products:update', 'products:delete', 'categories:read', 'categories:create', 'categories:update', 'categories:delete'],
  ADMIN: ['products:read', 'products:create', 'products:update', 'products:delete', 'categories:read', 'categories:create', 'categories:update', 'categories:delete'],
  STAFF: ['products:read', 'categories:read'],
};
const definitions = [
  ['products:read', 'Read products'], ['products:create', 'Create products'],
  ['products:update', 'Update products'], ['products:delete', 'Delete or deactivate products'],
  ['categories:read', 'Read categories'], ['categories:create', 'Create categories'],
  ['categories:update', 'Update categories'], ['categories:delete', 'Delete or deactivate categories'],
];
const prisma = new PrismaClient();

async function main() {
  const permissionRows = await Promise.all(definitions.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const byCode = new Map(permissionRows.map((permission) => [permission.code, permission]));
  const roles = await prisma.role.findMany({ where: { storeId: { not: null }, name: { in: Object.keys(permissionsByRole) } } });
  for (const role of roles) {
    for (const code of permissionsByRole[role.name] ?? []) {
      const permission = byCode.get(code);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  process.stdout.write(`Catalog permissions are ready for ${roles.length} store-scoped role(s).\n`);
}

main().catch((error) => {
  process.stderr.write('Catalog permission sync failed.\n');
  if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
