import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import process from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try { process.loadEnvFile(envPath); break; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const permissionDefinitions = [
  ['store:read', 'Read store configuration'], ['store:update', 'Update store configuration'],
  ['settings:read', 'Read store settings'], ['settings:update', 'Update store settings'],
  ['content:read', 'Read editable content blocks'], ['content:update', 'Update editable content blocks'],
  ['assets:upload', 'Upload store logo and favicon'], ['assets:delete', 'Delete store logo and favicon'],
];
const prisma = new PrismaClient();

async function main() {
  const permissions = await Promise.all(permissionDefinitions.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const roles = await prisma.role.findMany({ where: { storeId: { not: null }, name: { in: ['OWNER', 'ADMIN'] } }, select: { id: true } });
  for (const role of roles) {
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  process.stdout.write(`Store configuration permissions are ready for ${roles.length} OWNER/ADMIN role(s).\n`);
}

main().catch((error) => {
  process.stderr.write('Store configuration permission sync failed.\n');
  if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
