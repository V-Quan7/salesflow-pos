'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createOrder, currentUser, getCategories, getContentBlocks, getCustomers, getPosProducts } from '../../lib/auth-client';
import type { CatalogCategory, CreatedOrder, CustomerRecord, PosProduct } from '../../lib/auth-client';
import { EmptyState, LoadingRows } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';
import { Toast } from '../../components/ui/Toast';

type CartLine = { product: PosProduct; quantity: number };
type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'E_WALLET';
const payments: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Tiền mặt' }, { value: 'CARD', label: 'Thẻ' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' }, { value: 'E_WALLET', label: 'Ví điện tử' },
];

function parts(value: string): [bigint, number] {
  const [whole, fraction = ''] = value.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  return [BigInt(digits || '0'), fraction.length];
}
function scaled(value: string, scale: number) { const [digits, ownScale] = parts(value); return digits * (BigInt(10) ** BigInt(scale - ownScale)); }
function decimal(value: bigint, scale: number) {
  if (!scale) return value.toString();
  const negative = value < BigInt(0); const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}
function add(values: string[]) {
  const scale = Math.max(0, ...values.map((value) => parts(value)[1]));
  return decimal(values.reduce((sum, value) => sum + scaled(value, scale), BigInt(0)), scale);
}
function multiply(value: string, quantity: number) { const [digits, scale] = parts(value); return decimal(digits * BigInt(quantity), scale); }
function subtract(left: string, right: string) {
  const scale = Math.max(parts(left)[1], parts(right)[1]);
  return decimal(scaled(left, scale) - scaled(right, scale), scale);
}
function compare(left: string, right: string) {
  const scale = Math.max(parts(left)[1], parts(right)[1]); const a = scaled(left, scale); const b = scaled(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}
function displayMoney(value: string, currency: string | null) {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(undefined, currency
      ? { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } catch {
    formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const formattedParts = formatter.formatToParts(BigInt(`${negative ? '-' : ''}${integer || '0'}`));
  if (!fraction) return formattedParts.map((part) => part.value).join('');
  const decimalSeparator = new Intl.NumberFormat().formatToParts(1.1).find((part) => part.type === 'decimal')?.value || '.';
  let inserted = false;
  return formattedParts.map((part, index) => {
    const result = part.value;
    const lastIntegerPart = index === formattedParts.length - 1 || !['integer', 'group'].includes(formattedParts[index + 1].type);
    if (!inserted && ['integer', 'group'].includes(part.type) && lastIntegerPart) {
      inserted = true;
      return `${result}${decimalSeparator}${fraction}`;
    }
    return result;
  }).join('');
}

export default function PosPage() {
  const [currency, setCurrency] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [discount, setDiscount] = useState('0');
  const [search, setSearch] = useState('');
  const [activeResult, setActiveResult] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<CreatedOrder | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const searchQueryRef = useRef('');
  const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = add(cart.map(({ product, quantity }) => multiply(product.sellingPrice, quantity)));
  const validDiscount = /^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/.test(discount) ? discount : '0';
  const discountTooLarge = compare(validDiscount, subtotal) > 0;
  const total = discountTooLarge ? '0' : subtract(subtotal, validDiscount);
  const visibleProducts = selectedCategory === 'all'
    ? products
    : products.filter((product) => product.category.id === selectedCategory);
  const hasMoreProducts = products.length < productTotal;

  useEffect(() => {
    currentUser().then((current) => {
      if (current.role.name === 'OWNER' || current.role.name === 'ADMIN') {
        getContentBlocks().then((blocks) => setContent(Object.fromEntries(blocks.filter((block) => block.isActive).map((block) => [block.key, block.content])))).catch(() => undefined);
      }
    })
      .catch(() => undefined);
  }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    let cancelled = false;
    const searchTerm = search.trim();
    searchQueryRef.current = searchTerm;
    setLoading(true);
    setLoadingMore(false);
    setError('');
    setProducts([]);
    setProductTotal(0);
    setProductPage(1);
    const timer = window.setTimeout(() => {
      getPosProducts({ page: 1, limit: 100, search: searchTerm || undefined })
        .then((result) => { if (!cancelled) { setProducts(result.items); setProductTotal(result.total); setProductPage(result.page); setCurrency(result.currency); setActiveResult(0); } })
        .catch((cause) => { if (!cancelled) setError(causeStatus(cause) === 403 ? 'Tài khoản không có quyền tra cứu sản phẩm.' : 'Không tải được sản phẩm.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search]);
  useEffect(() => {
    getCategories({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'name', order: 'asc' })
      .then((result) => setCategories(result.items))
      .catch(() => setError((current) => current || 'Không tải được danh mục sản phẩm.'));
  }, []);
  useEffect(() => {
    getCustomers({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'name', order: 'asc' })
      .then((result) => setCustomers(result.items)).catch(() => setCustomers([]));
  }, []);

  const addProduct = useCallback((product: PosProduct) => {
    if (product.stockQuantity <= 0) { setError(`Sản phẩm ${product.sku} đã hết tồn kho.`); return; }
    setError(''); setSuccess(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id
        ? { ...line, quantity: Math.min(line.quantity + 1, product.stockQuantity) } : line);
      return [...current, { product, quantity: 1 }];
    });
  }, []);

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && visibleProducts.length) { event.preventDefault(); setActiveResult((index) => (index + 1) % visibleProducts.length); }
    if (event.key === 'ArrowUp' && visibleProducts.length) { event.preventDefault(); setActiveResult((index) => (index + visibleProducts.length - 1) % visibleProducts.length); }
    if (event.key === 'Enter' && visibleProducts[activeResult]) { event.preventDefault(); addProduct(visibleProducts[activeResult]); }
  }

  async function loadMoreProducts() {
    if (loadingMore || loading || !hasMoreProducts) return;
    const searchTerm = searchQueryRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const result = await getPosProducts({ page: productPage + 1, limit: 100, search: searchTerm || undefined });
      if (searchQueryRef.current !== searchTerm) return;
      setProducts((current) => [...current, ...result.items]);
      setProductTotal(result.total);
      setProductPage(result.page);
      setCurrency(result.currency);
    } catch (cause) {
      if (searchQueryRef.current !== searchTerm) return;
      setError(causeStatus(cause) === 403 ? 'Tài khoản không có quyền tra cứu sản phẩm.' : 'Không tải được thêm sản phẩm.');
    } finally {
      setLoadingMore(false);
    }
  }

  function changeQuantity(id: string, quantity: number) {
    if (quantity <= 0) { setCart((current) => current.filter((line) => line.product.id !== id)); return; }
    setCart((current) => current.map((line) => line.product.id === id
      ? { ...line, quantity: Math.min(quantity, line.product.stockQuantity) } : line));
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || cart.length === 0 || discountTooLarge || !/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/.test(discount)) return;
    setSaving(true); setError(''); setSuccess(null);
    try {
      const order = await createOrder({ ...(selectedCustomer ? { customerId: selectedCustomer } : {}),
        items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })), discount,
        paymentMethod });
      setSuccess(order); setCart([]); setDiscount('0'); setSelectedCustomer(''); setSearch(''); setMobileCartOpen(false); inputRef.current?.focus();
    } catch (cause) {
      const status = causeStatus(cause);
      const message = cause instanceof Error ? cause.message : '';
      setError(status === 409 ? 'Tồn kho vừa thay đổi hoặc không đủ. Hãy kiểm tra giỏ hàng và thử lại.'
        : status === 404 ? 'Khách hàng hoặc một sản phẩm không còn thuộc cửa hàng này.'
          : status === 400 ? message || 'Kiểm tra số lượng, khách hàng và giảm giá.'
            : status === 403 ? 'Tài khoản không có quyền tạo đơn tại POS.' : 'Không hoàn tất được đơn hàng.');
    } finally { setSaving(false); }
  }

  const money = (value: string) => displayMoney(value, currency);
  const dismissSuccess = useCallback(() => setSuccess(null), []);
  return <main className="admin-shell pos-shell">
    {error && <p role="alert" className="notice-error pos-notice">{error}</p>}
    {success && <Toast key={success.id} toastId={success.id} title="Thanh toán thành công" description={`Đơn #${success.orderCode} · ${money(success.total)} · ${payments.find((item) => item.value === success.paymentMethod)?.label || success.paymentMethod}`} onClose={dismissSuccess} />}
    {mobileCartOpen && <button type="button" className="pos-cart-scrim" aria-label="Đóng giỏ hàng" onClick={() => setMobileCartOpen(false)} />}
    <div className="pos-layout">
      <section className="admin-card pos-products" aria-label="Danh sách sản phẩm">
        <div className="pos-product-toolbar">
          <label className="pos-search-label">Tìm sản phẩm
            <span className="pos-search-field"><Icon name="search" /><input ref={inputRef} value={search} onChange={(event) => { const value = event.target.value; searchQueryRef.current = value.trim(); setSearch(value); }} onKeyDown={onSearchKey} placeholder="Tìm sản phẩm hoặc SKU..." aria-label="Tìm sản phẩm hoặc SKU" aria-autocomplete="list" aria-expanded={!loading && visibleProducts.length > 0} aria-controls="pos-product-results" aria-activedescendant={visibleProducts[activeResult] ? `pos-product-${visibleProducts[activeResult].id}` : undefined} role="combobox" /></span>
          </label>
          <span className="pos-product-count" aria-live="polite">{loading ? 'Đang tải sản phẩm…' : selectedCategory === 'all' ? `${products.length} / ${productTotal} sản phẩm` : `${visibleProducts.length} phù hợp · ${products.length} / ${productTotal} đã tải`}</span>
        </div>
        <nav className="pos-category-tabs" aria-label="Lọc theo danh mục">
          <button type="button" className={selectedCategory === 'all' ? 'pos-category-tab active' : 'pos-category-tab'} aria-pressed={selectedCategory === 'all'} onClick={() => { setSelectedCategory('all'); setActiveResult(0); }}>Tất cả</button>
          {categories.map((category) => <button type="button" key={category.id} className={selectedCategory === category.id ? 'pos-category-tab active' : 'pos-category-tab'} aria-pressed={selectedCategory === category.id} onClick={() => { setSelectedCategory(category.id); setActiveResult(0); }}>{category.name}</button>)}
        </nav>
        <p className="pos-keyboard-hint muted" aria-live="polite">Dùng ↑ ↓ để chọn, Enter để thêm vào giỏ.</p>
        <div className="pos-catalog-scroll">
          {loading ? <div className="pos-product-grid-loading"><LoadingRows count={8} /></div> : visibleProducts.length === 0
            ? <EmptyState title={products.length === 0 ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm trong danh mục này'} description={products.length === 0 ? 'Sản phẩm đang hoạt động sẽ xuất hiện theo nội dung tìm kiếm.' : 'Tải thêm sản phẩm để tìm các mặt hàng thuộc danh mục này.'} />
            : <ul id="pos-product-results" className="pos-product-grid" role="listbox" aria-label="Sản phẩm">
              {visibleProducts.map((product, index) => <li key={product.id}>
                <button id={`pos-product-${product.id}`} type="button" role="option" aria-selected={index === activeResult} disabled={product.stockQuantity <= 0} className={`pos-product-card${index === activeResult ? ' active-result' : ''}${product.stockQuantity <= 0 ? ' out-of-stock' : ''}`} onMouseEnter={() => setActiveResult(index)} onClick={() => addProduct(product)}>
                  <span className="pos-product-image">
                    {product.imageUrl ? <Image src={product.imageUrl} alt="" width={260} height={170} unoptimized className="pos-product-image-content" /> : <span className="pos-product-image-placeholder"><Icon name="box" size={32} /><small>Chưa có ảnh</small></span>}
                    {product.stockQuantity <= 0 && <span className="pos-out-of-stock-label">Hết hàng</span>}
                  </span>
                  <span className="pos-product-info"><strong title={product.name}>{product.name}</strong><code>{product.sku}</code>
                    <span className="pos-product-card-footer"><strong>{money(product.sellingPrice)}</strong><small>{product.stockQuantity > 0 ? `Còn ${product.stockQuantity} ${product.unit}` : product.unit}</small></span>
                  </span>
                </button>
              </li>)}
            </ul>}
          {!loading && hasMoreProducts && <div className="pos-load-more"><button type="button" className="secondary-button" disabled={loadingMore} onClick={() => void loadMoreProducts()}>{loadingMore ? 'Đang tải…' : 'Tải thêm sản phẩm'}</button></div>}
        </div>
      </section>

      <aside id="pos-checkout-panel" className={`admin-card pos-checkout${mobileCartOpen ? ' mobile-cart-open' : ''}`} aria-label="Giỏ hàng và thanh toán">
        <div className="pos-cart-heading"><div><h2>Giỏ hàng <span>({totalQuantity})</span></h2><p>{cart.length} mặt hàng</p></div><button type="button" className="pos-cart-close" onClick={() => setMobileCartOpen(false)}><Icon name="close" size={17} /><span>Tiếp tục bán hàng</span></button></div>
        <div className="pos-cart-items" aria-live="polite">
          {cart.length === 0 ? <div className="pos-empty-cart"><span className="pos-empty-cart-icon"><Icon name="cart" size={28} /></span><strong>Chưa có sản phẩm</strong><p>{content['pos.empty_cart'] || 'Chọn sản phẩm để bắt đầu đơn hàng.'}</p></div> : <ul className="pos-cart-list">
            {cart.map(({ product, quantity }) => <li className="pos-cart-item" key={product.id}>
              <div className="pos-cart-item-main">
                {product.imageUrl ? <Image src={product.imageUrl} alt="" width={52} height={52} unoptimized className="pos-cart-thumb" /> : <span className="pos-cart-thumb pos-cart-thumb-placeholder"><Icon name="box" size={21} /></span>}
                <span className="pos-cart-item-info"><strong title={product.name}>{product.name}</strong><small>{product.sku} · {money(product.sellingPrice)}</small></span>
                <button type="button" className="icon-button pos-remove-item" aria-label={`Xóa ${product.name} khỏi giỏ`} onClick={() => changeQuantity(product.id, 0)}><Icon name="trash" size={17} /></button>
              </div>
              <div className="pos-cart-item-bottom">
                <div className="quantity-controls"><button type="button" className="secondary-button" aria-label={`Giảm số lượng ${product.name}`} onClick={() => changeQuantity(product.id, quantity - 1)}><Icon name="minus" size={15} /></button><span aria-label={`Số lượng ${quantity}`}>{quantity}</span><button type="button" className="secondary-button" aria-label={`Tăng số lượng ${product.name}`} disabled={quantity >= product.stockQuantity} onClick={() => changeQuantity(product.id, quantity + 1)}><Icon name="plus" size={15} /></button></div>
                <strong className="pos-cart-line-total">{money(multiply(product.sellingPrice, quantity))}</strong>
              </div>
            </li>)}
          </ul>}
        </div>
        <form onSubmit={checkout} className="pos-checkout-form">
          <div className="pos-checkout-fields">
            <label>Khách hàng<select ref={customerRef} value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}><option value="">Khách lẻ</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>
            <label>Phương thức thanh toán<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>{payments.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
            <label>Giảm giá cố định<input type="text" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} aria-invalid={discountTooLarge || !/^\d+(\.\d{1,30})?$/.test(discount)} /></label>
          </div>
          <dl className="pos-totals"><div><dt>Tạm tính</dt><dd>{money(subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>− {money(validDiscount)}</dd></div><div className="pos-grand-total"><dt>Tổng thanh toán</dt><dd>{money(total)}</dd></div></dl>
          {discountTooLarge && <p className="notice-error">Giảm giá không được vượt quá tiền hàng.</p>}
          <button className="pos-complete" type="submit" disabled={saving || cart.length === 0 || discountTooLarge || !/^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/.test(discount)}>{saving ? 'Đang hoàn tất…' : 'Hoàn tất đơn hàng'}</button>
        </form>
      </aside>
    </div>
    {cart.length > 0 && <button type="button" className="pos-mobile-cart-trigger" aria-controls="pos-checkout-panel" aria-expanded={mobileCartOpen} onClick={() => setMobileCartOpen((open) => !open)}><span><Icon name="cart" />Giỏ hàng ({totalQuantity})</span><strong>{money(total)}</strong></button>}
  </main>;
}

function causeStatus(cause: unknown): number | undefined {
  return typeof cause === 'object' && cause !== null && 'status' in cause && typeof cause.status === 'number' ? cause.status : undefined;
}
