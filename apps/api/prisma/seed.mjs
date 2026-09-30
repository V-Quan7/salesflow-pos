import { PrismaClient } from '@prisma/client';
import process from 'node:process';

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      name: 'Development Store',
      currency: 'VND',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Development Store',
      code: 'dev-store',
      currency: 'VND',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const settings = [
    {
      key: 'store.displayNameShort',
      value: 'Development Store',
      valueType: 'STRING',
      description: 'Development-only short display name.',
    },
    {
      key: 'store.browserTitle',
      value: 'Development Store',
      valueType: 'STRING',
      description: 'Development-only browser title.',
    },
    {
      key: 'store.operatingHours',
      value: 'Development environment',
      valueType: 'STRING',
      description: 'Placeholder for development; no real business hours.',
    },
    {
      key: 'branding.accentColor',
      value: '#475569',
      valueType: 'STRING',
      description: 'Neutral development-only accent color.',
    },
    {
      key: 'terminology.customer',
      value: 'Customer',
      valueType: 'STRING',
      description: 'Generic development terminology fallback.',
    },
    {
      key: 'terminology.product',
      value: 'Product',
      valueType: 'STRING',
      description: 'Generic development terminology fallback.',
    },
    {
      key: 'terminology.order',
      value: 'Order',
      valueType: 'STRING',
      description: 'Generic development terminology fallback.',
    },
  ];

  for (const setting of settings) {
    await prisma.storeSetting.upsert({
      where: { storeId_key: { storeId: store.id, key: setting.key } },
      update: {
        value: setting.value,
        valueType: setting.valueType,
        description: setting.description,
      },
      create: { storeId: store.id, ...setting },
    });
  }

  const contentBlocks = [
    ['app.login.title', 'Login title', 'Sign in'],
    ['app.login.description', 'Login description', 'Development environment'],
    ['dashboard.welcome', 'Dashboard welcome', 'Welcome'],
    ['dashboard.subtitle', 'Dashboard subtitle', 'Development dashboard'],
    ['pos.empty_cart', 'Empty cart', 'No items in cart'],
    ['pos.payment_success', 'Payment success', 'Payment recorded in development environment'],
    ['order.success', 'Order success', 'Order created in development environment'],
    ['inventory.low_stock_message', 'Low stock message', 'Stock is below the configured minimum'],
    ['footer.about', 'Footer about', 'Development environment'],
    ['footer.notice', 'Footer notice', 'Development data only'],
  ];

  for (const [key, title, content] of contentBlocks) {
    await prisma.contentBlock.upsert({
      where: { storeId_key: { storeId: store.id, key } },
      update: { title, content, type: 'text', isActive: true },
      create: { storeId: store.id, key, title, content, type: 'text', isActive: true },
    });
  }
}

main()
  .catch((error) => {
    process.stderr.write('Development seed failed.\n');
    if (error?.code) process.stderr.write(`Database error code: ${error.code}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
