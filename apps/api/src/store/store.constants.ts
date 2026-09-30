export const STORE_SETTING_DEFAULTS = [
  { key: 'store.displayNameShort', value: 'Development Store', valueType: 'STRING', description: 'Development-only short display name.' },
  { key: 'store.browserTitle', value: 'Development Store', valueType: 'STRING', description: 'Development-only browser title.' },
  { key: 'store.operatingHours', value: 'Development environment', valueType: 'STRING', description: 'Placeholder for development; no real business hours.' },
  { key: 'branding.accentColor', value: '#475569', valueType: 'STRING', description: 'Neutral development-only accent color.' },
  { key: 'terminology.customer', value: 'Customer', valueType: 'STRING', description: 'Generic development terminology fallback.' },
  { key: 'terminology.product', value: 'Product', valueType: 'STRING', description: 'Generic development terminology fallback.' },
  { key: 'terminology.order', value: 'Order', valueType: 'STRING', description: 'Generic development terminology fallback.' },
] as const;

export const CONTENT_BLOCK_DEFAULTS = [
  { key: 'app.login.title', title: 'Login title', content: 'Sign in', type: 'text', isActive: true },
  { key: 'app.login.description', title: 'Login description', content: 'Sign in to continue.', type: 'text', isActive: true },
  { key: 'dashboard.welcome', title: 'Dashboard welcome', content: 'Welcome', type: 'text', isActive: true },
  { key: 'dashboard.subtitle', title: 'Dashboard subtitle', content: 'Manage your store.', type: 'text', isActive: true },
  { key: 'pos.empty_cart', title: 'Empty cart', content: 'Your cart is empty.', type: 'text', isActive: true },
  { key: 'pos.payment_success', title: 'Payment success', content: 'Payment received.', type: 'text', isActive: true },
  { key: 'order.success', title: 'Order success', content: 'Order created successfully.', type: 'text', isActive: true },
  { key: 'inventory.low_stock_message', title: 'Low stock message', content: 'Stock is running low.', type: 'text', isActive: true },
  { key: 'footer.about', title: 'Footer about', content: 'About this store.', type: 'text', isActive: true },
  { key: 'footer.notice', title: 'Footer notice', content: 'Store information.', type: 'text', isActive: true },
] as const;

export const PUBLIC_CONTENT_KEYS = ['app.login.title', 'app.login.description'] as const;
export const STORE_CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,49}$/;
