'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

import { currentUser, login, logout, publicStoreConfig } from '../lib/auth-client';
import type { CurrentUser, PublicStoreConfig } from '../lib/auth-client';
import { Icon } from '../components/ui/Icon';

const fallback = {
  store: { code: '', name: 'SalesFlow', shortName: 'SalesFlow', locale: 'vi-VN', logoUrl: null, faviconUrl: null, primaryColor: '#334155', secondaryColor: '#475569' },
  browserTitle: 'SalesFlow',
  content: [
    { key: 'app.login.title', title: 'Login title', content: 'Đăng nhập' },
    { key: 'app.login.description', title: 'Login description', content: 'Đăng nhập vào tài khoản cửa hàng của bạn.' },
  ],
} satisfies PublicStoreConfig;

export default function Home() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [storeCode, setStoreCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState<PublicStoreConfig>(fallback);

  useEffect(() => {
    currentUser().then((current) => { setUser(current); setStoreCode(current.store.code); }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const code = storeCode.trim();
    if (!code) { setConfig(fallback); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      publicStoreConfig(code).then((value) => { if (!cancelled) setConfig(value); })
        .catch(() => { if (!cancelled) setConfig(fallback); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [storeCode]);

  useEffect(() => {
    document.title = config.browserTitle || config.store.name || fallback.browserTitle;
    document.documentElement.lang = config.store.locale || 'vi';
    if (config.store.faviconUrl) {
      let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
      icon.href = config.store.faviconUrl;
    } else {
      document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.remove();
    }
  }, [config]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try { const current = await login({ storeCode, email, password }); setUser(current); setStoreCode(current.store.code); setPassword(''); }
    catch { setError('Không thể đăng nhập. Hãy kiểm tra thông tin và thử lại.'); }
    finally { setSubmitting(false); }
  }

  async function signOut() { try { await logout(); } finally { setUser(null); } }
  const content = (key: string) => config.content.find((item) => item.key === key)?.content || fallback.content.find((item) => item.key === key)?.content || '';
  const primary = config.store.primaryColor || '#334155';

  if (loading) return <main className="center-screen"><p>Đang kiểm tra phiên đăng nhập…</p></main>;
  if (user) {
    const canManageStore = user.permissions.includes('store:read');
    return <main className="center-screen"><section className="panel home-panel">
      <span className="welcome-mark"><Icon name="store" size={22} /></span>
      <p className="eyebrow">{config.store.shortName || user.store.name}</p><h1>Xin chào, {user.name}</h1><p className="muted">Chọn khu vực bạn muốn mở.</p>
      <div className="home-nav-grid">
        {user.permissions.includes('reports:read') && <Link className="home-nav-card" href="/admin"><Icon name="dashboard" /><span><strong>Bảng điều khiển</strong><small>Tình hình hôm nay</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('orders:create') && <Link className="home-nav-card" href="/pos"><Icon name="pos" /><span><strong>POS</strong><small>Tạo đơn bán hàng</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('orders:read') && <Link className="home-nav-card" href="/admin/orders"><Icon name="orders" /><span><strong>Đơn hàng</strong><small>Tra cứu giao dịch</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('reports:read') && <Link className="home-nav-card" href="/admin/reports"><Icon name="reports" /><span><strong>Báo cáo</strong><small>Doanh thu và tồn kho</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('products:read') && <Link className="home-nav-card" href="/admin/products"><Icon name="products" /><span><strong>Sản phẩm</strong><small>Danh mục hàng hóa</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('categories:read') && <Link className="home-nav-card" href="/admin/categories"><Icon name="categories" /><span><strong>Danh mục</strong><small>Nhóm sản phẩm</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('inventory:read') && <Link className="home-nav-card" href="/admin/inventory"><Icon name="inventory" /><span><strong>Tồn kho</strong><small>Số lượng và điều chỉnh</small></span><Icon name="chevron" /></Link>}
        {user.permissions.includes('customers:read') && <Link className="home-nav-card" href="/admin/customers"><Icon name="customers" /><span><strong>Khách hàng</strong><small>Hồ sơ và lịch sử mua</small></span><Icon name="chevron" /></Link>}
        {canManageStore && <Link className="home-nav-card" href="/admin/settings/store"><Icon name="settings" /><span><strong>Cấu hình cửa hàng</strong><small>Nhận diện và nội dung</small></span><Icon name="chevron" /></Link>}
      </div>
      <button type="button" className="secondary-button home-signout" onClick={signOut}><Icon name="logout" size={16} />Đăng xuất</button>
    </section></main>;
  }

  return <main className="center-screen">
    <section className="panel login-panel">
      {config.store.logoUrl && <Image className="login-logo" src={config.store.logoUrl} alt={`Logo ${config.store.name}`} width={180} height={90} unoptimized />}
      <h1>{content('app.login.title')}</h1>
      <p className="muted">{content('app.login.description')}</p>
      <form onSubmit={submit}>
        <label>Mã cửa hàng<input required autoComplete="organization" value={storeCode} onChange={(event) => setStoreCode(event.target.value)} /></label>
        <label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p role="alert" className="error-message">{error}</p>}
        <button type="submit" style={{ backgroundColor: primary }} disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </section>
  </main>;
}
