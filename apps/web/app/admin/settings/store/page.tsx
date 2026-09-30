'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  currentUser, deleteStoreAsset, getContentBlocks, getStoreConfig, getStoreSettings,
  resetContentBlock, updateContentBlock, updateStoreConfig, updateStoreSettings, uploadStoreAsset,
} from '../../../../lib/auth-client';
import type { ContentBlock, CurrentUser, StoreConfig, StoreSetting } from '../../../../lib/auth-client';
import { LoadingRows } from '../../../../components/ui/Feedback';

const tabs = [
  ['profile', 'Thông tin cửa hàng'], ['branding', 'Logo & nhận diện'], ['contact', 'Liên hệ'],
  ['appearance', 'Giao diện'], ['content', 'Nội dung'], ['system', 'Cấu hình hệ thống'],
] as const;
const settingLabels: Record<string, string> = {
  'store.displayNameShort': 'Tên hiển thị ngắn', 'store.browserTitle': 'Tiêu đề trình duyệt',
  'store.operatingHours': 'Thời gian hoạt động', 'branding.accentColor': 'Màu nhấn',
  'terminology.customer': 'Thuật ngữ khách hàng', 'terminology.product': 'Thuật ngữ sản phẩm',
  'terminology.order': 'Thuật ngữ đơn hàng',
};

export default function StoreSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [settings, setSettings] = useState<StoreSetting[]>([]);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>('profile');
  const [selectedKey, setSelectedKey] = useState('app.login.title');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedBlock = useMemo(() => blocks.find((block) => block.key === selectedKey) ?? null, [blocks, selectedKey]);

  useEffect(() => {
    let cancelled = false;
    currentUser().then(async (current) => {
      if (cancelled) return;
      setUser(current);
      if (!['OWNER', 'ADMIN'].includes(current.role.name.toUpperCase())) { router.replace('/'); return; }
      const [storeData, settingData, blockData] = await Promise.all([getStoreConfig(), getStoreSettings(), getContentBlocks()]);
      if (!cancelled) {
        setStore(storeData); setSettings(settingData); setBlocks(blockData);
        if (blockData[0]) setSelectedKey(blockData[0].key);
      }
    }).catch((cause: unknown) => {
      if (cancelled) return;
      const status = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      if (status === 401) router.replace('/');
      else setError(status === 403 ? 'Bạn không có quyền truy cập cấu hình cửa hàng.' : 'Không tải được cấu hình. Hãy thử tải lại trang.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  const runSave = useCallback(async (action: () => Promise<void>) => {
    setSaving(true); setMessage(''); setError('');
    try { await action(); setMessage('Đã lưu thay đổi.'); }
    catch (cause) {
      const status = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined;
      setError(status === 409 ? 'Mã cửa hàng đã được sử dụng.' : status === 403 ? 'Bạn không có quyền thực hiện thay đổi này.' : 'Không lưu được thay đổi. Kiểm tra dữ liệu rồi thử lại.');
    } finally { setSaving(false); }
  }, []);

  async function submitStore(event: FormEvent<HTMLFormElement>, fields: (keyof StoreConfig)[]) {
    event.preventDefault(); if (!store) return;
    const patch = Object.fromEntries(fields.map((field) => [field, store[field]]));
    await runSave(async () => { const updated = await updateStoreConfig(patch); setStore(updated); });
  }

  function updateField(field: keyof StoreConfig, value: string) {
    setStore((previous) => previous ? { ...previous, [field]: value } : previous);
  }

  async function handleAsset(kind: 'logo' | 'favicon', file?: File) {
    if (!file || !store) return;
    await runSave(async () => {
      const result = await uploadStoreAsset(kind, file);
      setStore((previous) => previous ? { ...previous, ...(kind === 'logo' ? { logoUrl: result.logoUrl ?? null } : { faviconUrl: result.faviconUrl ?? null }) } : previous);
    });
  }

  async function removeAsset(kind: 'logo' | 'favicon') {
    if (!store) return;
    await runSave(async () => {
      await deleteStoreAsset(kind);
      setStore((previous) => previous ? { ...previous, ...(kind === 'logo' ? { logoUrl: null } : { faviconUrl: null }) } : previous);
    });
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSave(async () => setSettings(await updateStoreSettings(Object.fromEntries(settings.map(({ key, value }) => [key, value])))));
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedBlock) return;
    await runSave(async () => {
      const result = await updateContentBlock(selectedBlock.key, selectedBlock);
      setBlocks((previous) => previous.map((block) => block.key === result.key ? result : block));
    });
  }

  async function resetBlock() {
    if (!selectedBlock) return;
    await runSave(async () => {
      const result = await resetContentBlock(selectedBlock.key);
      setBlocks((previous) => previous.map((block) => block.key === result.key ? result : block));
    });
  }

  if (loading) return <main className="admin-shell"><section className="admin-card"><LoadingRows count={6} /></section></main>;
  if (!store || !user) return <main className="admin-shell"><p role="alert" className="notice-error">{error || 'Không thể mở cấu hình cửa hàng.'}</p><Link href="/">Quay lại</Link></main>;

  return <main className="admin-shell">
    <nav className="tab-list" aria-label="Nhóm cấu hình">
      {tabs.map(([id, label]) => <button key={id} type="button" aria-selected={activeTab === id} onClick={() => { setActiveTab(id); setMessage(''); setError(''); }}>{label}</button>)}
    </nav>
    <section className="admin-card">
      {message && <p role="status" className="notice-success">{message}</p>}
      {error && <p role="alert" className="notice-error">{error}</p>}

      {activeTab === 'profile' && <form className="form-grid" onSubmit={(event) => submitStore(event, ['name', 'code', 'slogan', 'description'])}>
        <label>Tên cửa hàng<input required maxLength={120} value={store.name} onChange={(event) => updateField('name', event.target.value)} /></label>
        <label>Mã cửa hàng<input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,49}" value={store.code} onChange={(event) => updateField('code', event.target.value)} /></label>
        <label className="full">Slogan<input maxLength={240} value={store.slogan ?? ''} onChange={(event) => updateField('slogan', event.target.value)} /></label>
        <label className="full">Mô tả<textarea maxLength={5000} value={store.description ?? ''} onChange={(event) => updateField('description', event.target.value)} /></label>
        <div className="full"><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</button></div>
      </form>}

      {activeTab === 'branding' && <div className="form-grid">
        {(['logo', 'favicon'] as const).map((kind) => {
          const url = kind === 'logo' ? store.logoUrl : store.faviconUrl;
          return <div className="full" key={kind}>
            <h2>{kind === 'logo' ? 'Logo cửa hàng' : 'Favicon'}</h2>
            <div className="asset-row">
              <div>{url ? <Image className="asset-preview" src={url} alt={kind === 'logo' ? `Logo ${store.name}` : 'Favicon cửa hàng'} width={200} height={100} unoptimized /> : <p className="muted">Chưa có ảnh. Giao diện sẽ dùng fallback.</p>}</div>
              <div className="button-row">
                <label className="button-link">Tải ảnh lên<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" disabled={saving} onChange={(event) => { void handleAsset(kind, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
                {url && <button type="button" disabled={saving} onClick={() => void removeAsset(kind)}>Xóa ảnh</button>}
              </div>
            </div>
          </div>;
        })}
        <label>Màu chính<input type="color" value={store.primaryColor ?? '#334155'} onChange={(event) => updateField('primaryColor', event.target.value)} /></label>
        <label>Màu phụ<input type="color" value={store.secondaryColor ?? '#475569'} onChange={(event) => updateField('secondaryColor', event.target.value)} /></label>
        <div className="full"><button disabled={saving} onClick={() => void runSave(async () => { setStore(await updateStoreConfig({ primaryColor: store.primaryColor, secondaryColor: store.secondaryColor })); })}>{saving ? 'Đang lưu…' : 'Lưu màu sắc'}</button></div>
      </div>}

      {activeTab === 'contact' && <form className="form-grid" onSubmit={(event) => submitStore(event, ['phone', 'email', 'website', 'address'])}>
        <label>Điện thoại<input maxLength={40} value={store.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} /></label>
        <label>Email<input type="email" maxLength={254} value={store.email ?? ''} onChange={(event) => updateField('email', event.target.value)} /></label>
        <label>Website<input type="url" maxLength={2048} value={store.website ?? ''} onChange={(event) => updateField('website', event.target.value)} /></label>
        <label>Địa chỉ<input maxLength={500} value={store.address ?? ''} onChange={(event) => updateField('address', event.target.value)} /></label>
        <div className="full"><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu liên hệ'}</button></div>
      </form>}

      {activeTab === 'appearance' && <form className="form-grid" onSubmit={(event) => submitStore(event, ['currency', 'locale', 'timezone'])}>
        <label>Currency<input required pattern="[A-Z]{3}" maxLength={3} value={store.currency} onChange={(event) => updateField('currency', event.target.value.toUpperCase())} /></label>
        <label>Locale<input required maxLength={35} value={store.locale} onChange={(event) => updateField('locale', event.target.value)} /></label>
        <label>Timezone<input required maxLength={64} value={store.timezone} onChange={(event) => updateField('timezone', event.target.value)} /></label>
        <div className="full"><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu giao diện'}</button></div>
      </form>}

      {activeTab === 'content' && <div className="content-layout">
        <div className="block-list" aria-label="ContentBlock">
          {blocks.map((block) => <button key={block.key} type="button" aria-pressed={selectedKey === block.key} onClick={() => setSelectedKey(block.key)}>{block.title}<small><br />{block.key}</small></button>)}
        </div>
        {selectedBlock ? <form className="form-grid" onSubmit={saveBlock}>
          <p className="full muted">Key cố định: <code>{selectedBlock.key}</code></p>
          <label className="full">Tiêu đề<input required maxLength={160} value={selectedBlock.title} onChange={(event) => setBlocks((previous) => previous.map((block) => block.key === selectedKey ? { ...block, title: event.target.value } : block))} /></label>
          <label className="full">Nội dung<textarea required maxLength={10000} value={selectedBlock.content} onChange={(event) => setBlocks((previous) => previous.map((block) => block.key === selectedKey ? { ...block, content: event.target.value } : block))} /></label>
          <label className="full"><span><input type="checkbox" checked={selectedBlock.isActive} onChange={(event) => setBlocks((previous) => previous.map((block) => block.key === selectedKey ? { ...block, isActive: event.target.checked } : block))} /> Hiển thị nội dung</span></label>
          <div className="full"><strong>Xem trước</strong><div className="content-preview">{selectedBlock.content || 'Nội dung trống'}</div></div>
          <div className="full button-row"><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nội dung'}</button><button type="button" disabled={saving} onClick={() => void resetBlock()}>Khôi phục mặc định</button></div>
        </form> : <p className="muted">Không có nội dung để chỉnh sửa.</p>}
      </div>}

      {activeTab === 'system' && <form className="form-grid" onSubmit={saveSettings}>
        <p className="full muted">Chỉ các StoreSetting đã được định nghĩa mới có thể chỉnh sửa.</p>
        {settings.map((setting) => <label className="full inline-fields" key={setting.key}>
          <span>{settingLabels[setting.key] ?? setting.key}<small><br />{setting.key}</small></span>
          <input value={setting.value} onChange={(event) => setSettings((previous) => previous.map((item) => item.key === setting.key ? { ...item, value: event.target.value } : item))} />
        </label>)}
        <div className="full"><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>
      </form>}
    </section>
  </main>;
}
