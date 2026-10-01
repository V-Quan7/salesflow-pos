'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { getSetupStatus, setupProduction } from '../../lib/auth-client';
import { passwordConfirmationError, setupRequestError } from '../../lib/setup-form';

type StoreFields = { name: string; code: string; currency: string; timezone: string; locale: string };
type OwnerFields = { name: string; email: string; password: string; confirmPassword: string };

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [store, setStore] = useState<StoreFields>({ name: '', code: '', currency: '', timezone: '', locale: '' });
  const [owner, setOwner] = useState<OwnerFields>({ name: '', email: '', password: '', confirmPassword: '' });
  const [setupToken, setSetupToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkSetup() {
      try {
        const result = await getSetupStatus();
        if (cancelled) return;
        if (!result.setupRequired) { window.location.replace('/'); return; }
        setAvailable(true);
      } catch {
        if (!cancelled) setServiceUnavailable(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void checkSetup();
    return () => {
      cancelled = true;
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const passwordError = passwordConfirmationError(owner.password, owner.confirmPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setSubmitting(true);
    try {
      const result = await setupProduction({
        setupToken,
        store: { name: store.name, code: store.code, currency: store.currency, timezone: store.timezone, locale: store.locale },
        owner: { name: owner.name, email: owner.email, password: owner.password },
      });
      setSuccess(true);
      setSetupToken('');
      setOwner({ name: result.owner.name, email: result.owner.email, password: '', confirmPassword: '' });
      redirectTimer.current = window.setTimeout(() => {
        window.location.replace(`/?storeCode=${encodeURIComponent(result.store.code)}`);
      }, 1000);
    } catch (requestError) {
      const status = typeof requestError === 'object' && requestError !== null && 'status' in requestError ? requestError.status : undefined;
      setError(setupRequestError(status));
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <main className="center-screen"><p>Đang kiểm tra trạng thái hệ thống…</p></main>;
  if (serviceUnavailable) return <main className="center-screen"><section className="panel"><h1>Không thể kiểm tra hệ thống</h1><p className="muted">API hoặc cơ sở dữ liệu chưa phản hồi. Trang này không thể xác định hệ thống đã khởi tạo hay chưa.</p><button type="button" onClick={() => window.location.reload()}>Thử lại</button></section></main>;
  if (!available) return <main className="center-screen"><p>Đang chuyển đến đăng nhập…</p></main>;

  return <main className="center-screen">
    <section className="panel setup-panel">
      <p className="eyebrow">SalesFlow · Thiết lập lần đầu</p>
      <h1>Khởi tạo cửa hàng</h1>
      <p className="muted">Tạo cửa hàng và tài khoản Owner đầu tiên. Sau khi hoàn tất, hãy đăng nhập bằng mã cửa hàng và email Owner.</p>
      {success ? <div className="notice-success" role="status">Khởi tạo hệ thống thành công. Đang chuyển đến đăng nhập…</div> : <form className="form-grid" onSubmit={submit}>
        <h2 className="full">Thông tin cửa hàng</h2>
        <label className="full">Tên cửa hàng
          <input required maxLength={120} autoComplete="organization" value={store.name} onChange={(event) => setStore((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>Mã cửa hàng
          <input required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,49}" autoComplete="off" value={store.code} onChange={(event) => setStore((current) => ({ ...current, code: event.target.value }))} />
        </label>
        <label>Currency (ISO 4217)
          <input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" autoComplete="off" placeholder="VND" value={store.currency} onChange={(event) => setStore((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
        </label>
        <label>Timezone
          <input required maxLength={64} autoComplete="off" placeholder="Asia/Ho_Chi_Minh" value={store.timezone} onChange={(event) => setStore((current) => ({ ...current, timezone: event.target.value }))} />
        </label>
        <label>Locale
          <input required maxLength={35} autoComplete="off" placeholder="vi-VN" value={store.locale} onChange={(event) => setStore((current) => ({ ...current, locale: event.target.value }))} />
        </label>

        <h2 className="full">Tài khoản Owner</h2>
        <label>Tên Owner
          <input required maxLength={150} autoComplete="name" value={owner.name} onChange={(event) => setOwner((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>Email
          <input required type="email" maxLength={255} autoComplete="email" value={owner.email} onChange={(event) => setOwner((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label>Mật khẩu
          <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={owner.password} onChange={(event) => setOwner((current) => ({ ...current, password: event.target.value }))} />
          <small className="form-hint">Từ 12 đến 128 ký tự. Mật khẩu sẽ được băm bằng Argon2id.</small>
        </label>
        <label>Xác nhận mật khẩu
          <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={owner.confirmPassword} onChange={(event) => setOwner((current) => ({ ...current, confirmPassword: event.target.value }))} />
        </label>

        <h2 className="full">One-Time Setup Token</h2>
        <label className="full">Setup Token
          <input required type="password" minLength={32} maxLength={512} autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
          <small className="form-hint">Nhập token do người vận hành cấu hình trên môi trường API. Token không được lưu trên trình duyệt.</small>
        </label>
        {error && <p className="notice-error full" role="alert">{error}</p>}
        <button className="full" type="submit" disabled={submitting}>{submitting ? 'Đang khởi tạo…' : 'Khởi tạo hệ thống'}</button>
      </form>}
    </section>
  </main>;
}
