import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { resolve } from 'node:path';
import { createInterface as createPrompts } from 'node:readline/promises';
import process, { stdin, stdout } from 'node:process';

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const PHASE_TWO_PERMISSIONS = [
  ['users:read', 'Read users'], ['users:create', 'Create users'],
  ['users:update', 'Update users'], ['users:delete', 'Deactivate users'],
  ['roles:read', 'Read roles'], ['permissions:read', 'Read permissions'],
  ['auth:me', 'Read current authenticated user'],
  ['store:read', 'Read store configuration'], ['store:update', 'Update store configuration'],
  ['settings:read', 'Read store settings'], ['settings:update', 'Update store settings'],
  ['content:read', 'Read editable content blocks'], ['content:update', 'Update editable content blocks'],
  ['assets:upload', 'Upload store logo and favicon'], ['assets:delete', 'Delete store logo and favicon'],
  ['products:read', 'Read products'], ['products:create', 'Create products'],
  ['products:update', 'Update products'], ['products:delete', 'Delete or deactivate products'],
  ['categories:read', 'Read categories'], ['categories:create', 'Create categories'],
  ['categories:update', 'Update categories'], ['categories:delete', 'Delete or deactivate categories'],
  ['inventory:read', 'Read inventory'], ['inventory:adjust', 'Adjust inventory'],
  ['orders:create', 'Create orders at POS'], ['orders:read', 'Read orders'],
  ['orders:update', 'Update order state through allowed operations'], ['orders:cancel', 'Cancel pending orders'],
  ['orders:refund', 'Refund completed orders'], ['reports:read', 'Read store reports'],
];

const prisma = new PrismaClient();
const rl = createPrompts({ input: stdin, output: stdout });

async function hidden(prompt) {
  stdout.write(prompt);
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Owner bootstrap requires an interactive terminal for hidden password input.');
  return new Promise((resolve) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    const cleanup = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) { cleanup(); process.exit(130); }
        if (byte === 13 || byte === 10) { cleanup(); resolve(value); return; }
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const storeCode = (await rl.question('Store code: ')).trim();
  const email = (await rl.question('Owner email: ')).trim().toLowerCase();
  const name = (await rl.question('Owner name: ')).trim();
  rl.close();
  const password = await hidden('Owner password (hidden): ');
  if (password.length < 12) throw new Error('Password must be at least 12 characters');

  const store = await prisma.store.findUnique({ where: { code: storeCode } });
  if (!store) throw new Error('Store not found. Create the Store through the configured development seed first.');
  if (await prisma.user.findFirst({ where: { storeId: store.id, role: { name: 'OWNER', storeId: store.id } } })) {
    process.stdout.write('An Owner already exists for this store; no changes made.\n');
    return;
  }

  const definitions = await Promise.all(PHASE_TWO_PERMISSIONS.map(([code, description]) =>
    prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } }),
  ));
  const ownerRoleId = `10000000-0000-4000-8000-${store.id.slice(-12)}`;
  const existingOwnerRole = await prisma.role.findFirst({ where: { storeId: store.id, name: 'OWNER' } });
  const role = await prisma.role.upsert({
    where: { id: existingOwnerRole?.id ?? ownerRoleId },
    update: { storeId: store.id, name: 'OWNER' },
    create: { id: ownerRoleId, storeId: store.id, name: 'OWNER' },
  });
  for (const permission of definitions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  const adminCodes = new Set(['users:read', 'users:create', 'users:update', 'roles:read', 'permissions:read', 'auth:me',
    'store:read', 'store:update', 'settings:read', 'settings:update', 'content:read', 'content:update', 'assets:upload', 'assets:delete',
    'inventory:read', 'inventory:adjust', 'orders:create', 'orders:read', 'orders:update', 'orders:cancel', 'orders:refund', 'reports:read']);
  const roleDefinitions = [
    { name: 'ADMIN', permissions: definitions.filter(({ code }) => adminCodes.has(code)) },
    { name: 'STAFF', permissions: definitions.filter(({ code }) => ['auth:me', 'products:read', 'categories:read', 'inventory:read', 'orders:create', 'orders:read'].includes(code)) },
  ];
  for (const definition of roleDefinitions) {
    const existing = await prisma.role.findFirst({ where: { storeId: store.id, name: definition.name } });
    const deterministicId = `10000000-0000-4000-8001-${store.id.slice(-11)}${definition.name === 'ADMIN' ? '1' : '2'}`;
    const scopedRole = await prisma.role.upsert({
      where: { id: existing?.id ?? deterministicId },
      update: { storeId: store.id, name: definition.name },
      create: { id: deterministicId, storeId: store.id, name: definition.name },
    });
    for (const permission of definition.permissions) {
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: scopedRole.id, permissionId: permission.id } }, update: {}, create: { roleId: scopedRole.id, permissionId: permission.id } });
    }
  }
  const emailOwner = await prisma.user.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
  if (emailOwner) throw new Error('That email already belongs to a user in this store.');
  await prisma.user.create({ data: { storeId: store.id, roleId: role.id, name, email,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }), status: 'ACTIVE' } });
  process.stdout.write('Owner account created.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Owner bootstrap failed'}\n`);
  process.exitCode = 1;
}).finally(async () => {
  rl.close();
  await prisma.$disconnect();
});
