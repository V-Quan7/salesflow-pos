'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { currentUser, logout, publicStoreConfig } from '../../lib/auth-client';
import type { CurrentUser, PublicStoreConfig } from '../../lib/auth-client';
import { Icon, type IconName } from '../ui/Icon';

type Entry = { label: string; href: string; permission: string; icon: IconName };
const groups: { label: string; items: Entry[] }[] = [
  { label: 'Tổng quan', items: [
    { label: 'Bảng điều khiển', href: '/admin', permission: 'reports:read', icon: 'dashboard' },
    { label: 'Báo cáo', href: '/admin/reports', permission: 'reports:read', icon: 'reports' },
  ] },
  { label: 'Bán hàng', items: [
    { label: 'POS', href: '/pos', permission: 'orders:create', icon: 'pos' },
    { label: 'Đơn hàng', href: '/admin/orders', permission: 'orders:read', icon: 'orders' },
    { label: 'Khách hàng', href: '/admin/customers', permission: 'customers:read', icon: 'customers' },
  ] },
  { label: 'Danh mục & kho', items: [
    { label: 'Sản phẩm', href: '/admin/products', permission: 'products:read', icon: 'products' },
    { label: 'Danh mục', href: '/admin/categories', permission: 'categories:read', icon: 'categories' },
    { label: 'Tồn kho', href: '/admin/inventory', permission: 'inventory:read', icon: 'inventory' },
  ] },
  { label: 'Cửa hàng', items: [
    { label: 'Cấu hình', href: '/admin/settings/store', permission: 'store:read', icon: 'settings' },
  ] },
  { label: 'Quản trị', items: [
    { label: 'Người dùng', href: '/admin/users', permission: 'users:read', icon: 'user' },
  ] },
];
const titles: Record<string, string> = {
  '/admin': 'Bảng điều khiển', '/admin/reports': 'Báo cáo', '/admin/orders': 'Đơn hàng', '/admin/customers': 'Khách hàng', '/admin/users': 'Người dùng & phân quyền',
  '/admin/products': 'Sản phẩm', '/admin/categories': 'Danh mục', '/admin/inventory': 'Tồn kho', '/admin/settings/store': 'Cấu hình cửa hàng', '/pos': 'Bán hàng tại quầy',
};

export function AdminShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [brand, setBrand] = useState<PublicStoreConfig | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(compact);

  useEffect(() => {
    let cancelled = false;
    currentUser().then(async (current) => {
      if (cancelled) return;
      setUser(current);
      try { const config = await publicStoreConfig(current.store.code); if (!cancelled) setBrand(config); } catch { /* keep neutral identity fallback */ }
    }).catch(() => { if (!cancelled) setUser(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  async function signOut() {
    try { await logout(); } finally { setUser(null); router.push('/'); }
  }

  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => user?.permissions.includes(item.permission)) })).filter((group) => group.items.length > 0);
  const title = titles[pathname] ?? 'SalesFlow';
  const storeTitle = brand?.store.shortName || user?.store.name || 'SalesFlow';
  const configuredColor = brand?.store.primaryColor;
  const primaryColor = configuredColor && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(configuredColor) ? configuredColor : undefined;

  return <div className={`admin-frame${collapsed ? ' sidebar-collapsed' : ''}`} style={primaryColor ? ({ '--primary': primaryColor } as CSSProperties) : undefined}>
    {mobileOpen && <button className="mobile-scrim" aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)} />}
    <aside id="primary-navigation" className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <Link className="brand-lockup" href={visibleGroups[0]?.items[0]?.href ?? '/'} aria-label={`${storeTitle}, trang chính`}>
        {brand?.store.logoUrl ? <Image src={brand.store.logoUrl} alt="" width={36} height={36} unoptimized className="brand-logo" /> : <span className="brand-mark"><Icon name="store" size={19} /></span>}
        <span className="brand-copy"><strong>{storeTitle}</strong><small>Quản lý cửa hàng</small></span>
      </Link>
      <nav className="sidebar-nav" aria-label="Điều hướng chính">
        {visibleGroups.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-title">{group.label}</p>{group.items.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
          return <Link className={`nav-link${active ? ' active' : ''}`} href={item.href} key={item.href} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>;
        })}</div>)}
      </nav>
      <div className="sidebar-bottom"><span className="online-indicator" /><span>Hệ thống hoạt động</span></div>
    </aside>
    <div className="admin-workspace">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu-button" aria-label="Mở điều hướng" aria-controls="primary-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Icon name="menu" /></button><button className="icon-button collapse-button" aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><Icon name="menu" /></button><span className="topbar-context">{title}</span></div>
        <div className="topbar-right"><span className="store-context"><Icon name="store" size={16} />{storeTitle}</span><div className="user-chip"><span className="avatar"><Icon name="user" size={16} /></span><span className="user-details"><strong>{user?.name ?? 'Tài khoản'}</strong><small>{user?.role.name ?? ''}</small></span></div><button className="icon-button signout-button" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => void signOut()}><Icon name="logout" /></button></div>
      </header>
      <div className="admin-content">{children}</div>
    </div>
  </div>;
}
