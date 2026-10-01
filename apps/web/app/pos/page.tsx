'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createOrder, currentUser, getCategories, getContentBlocks, getCustomers, getPosProductByBarcode, getPosProducts } from '../../lib/auth-client';
import type { CatalogCategory, CreatedOrder, CustomerRecord, PosProduct } from '../../lib/auth-client';
import { EmptyState, LoadingRows } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';
import { Dialog } from '../../components/ui/Dialog';
import { BarcodeCameraScanner } from '../../components/pos/BarcodeCameraScanner';
import type { BarcodeScanFeedback } from '../../components/pos/BarcodeCameraScanner';
import { PaymentDialog, type PaymentConfirmation } from '../../components/pos/PaymentDialog';
import { ThermalReceipt } from '../../components/orders/ThermalReceipt';
import { add, compare, displayMoney, isNonNegativeDecimal, multiply, percentageDiscount, subtract } from '../../lib/pos-money';

type CartLine = { product: PosProduct; quantity: number };
type DiscountType = 'FIXED' | 'PERCENTAGE';
const paymentLabels: Record<PaymentConfirmation['paymentMethod'], string> = {
  CASH: 'Tiền mặt', CARD: 'Thẻ', BANK_TRANSFER: 'Chuyển khoản', E_WALLET: 'Ví điện tử',
};

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
  const [discountType, setDiscountType] = useState<DiscountType>('FIXED');
  const [discountValue, setDiscountValue] = useState('0');
  const [search, setSearch] = useState('');
  const [activeResult, setActiveResult] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<CreatedOrder | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const searchQueryRef = useRef('');
  const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = add(cart.map(({ product, quantity }) => multiply(product.sellingPrice, quantity)));
  const discountValid = isNonNegativeDecimal(discountValue);
  const discountTooLarge = discountValid && (discountType === 'FIXED'
    ? compare(discountValue, subtotal) > 0 : compare(discountValue, '100') > 0);
  const calculatedDiscount = !discountValid || discountTooLarge ? '0'
    : discountType === 'FIXED' ? discountValue : percentageDiscount(subtotal, discountValue, currency);
  const total = discountValid && !discountTooLarge ? subtract(subtotal, calculatedDiscount) : '0';
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

  const addProduct = useCallback((product: PosProduct): 'added' | 'out-of-stock' | 'at-stock-limit' => {
    if (product.stockQuantity <= 0) { setError(`Sản phẩm ${product.sku} đã hết tồn kho.`); return 'out-of-stock'; }
    const existing = cart.find((line) => line.product.id === product.id);
    if (existing && existing.quantity >= product.stockQuantity) {
      setError(`Đã đạt số lượng tồn kho tối đa của ${product.name}.`);
      return 'at-stock-limit';
    }
    setError(''); setSuccess(null);
    setCart((current) => {
      const currentLine = current.find((line) => line.product.id === product.id);
      if (currentLine) return current.map((line) => line.product.id === product.id
        ? { ...line, quantity: Math.min(line.quantity + 1, product.stockQuantity) } : line);
      return [...current, { product, quantity: 1 }];
    });
    return 'added';
  }, [cart]);

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && visibleProducts.length) { event.preventDefault(); setActiveResult((index) => (index + 1) % visibleProducts.length); }
    if (event.key === 'ArrowUp' && visibleProducts.length) { event.preventDefault(); setActiveResult((index) => (index + visibleProducts.length - 1) % visibleProducts.length); }
    if (event.key === 'Enter' && visibleProducts[activeResult]) { event.preventDefault(); addProduct(visibleProducts[activeResult]); }
  }

  const handleBarcode = useCallback(async (barcode: string): Promise<BarcodeScanFeedback> => {
    try {
      const product = await getPosProductByBarcode(barcode);
      const addResult = addProduct(product);
      if (addResult === 'out-of-stock') return { kind: 'error', message: `${product.name} đã hết tồn kho. Mã: ${barcode}` };
      if (addResult === 'at-stock-limit') return { kind: 'error', message: `Đã đạt số lượng tồn kho tối đa của ${product.name}.` };
      return { kind: 'success', message: `Đã thêm ${product.name} vào giỏ · Mã: ${barcode}` };
    } catch (cause) {
      const status = causeStatus(cause);
      if (status === 404) return { kind: 'error', message: 'Không tìm thấy sản phẩm với mã vạch này.' };
      if (status === 409) return { kind: 'error', message: 'Sản phẩm đã ngừng hoạt động và không thể bán.' };
      if (status === 401) return { kind: 'error', message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' };
      if (status === 403) return { kind: 'error', message: 'Tài khoản không có quyền tra cứu sản phẩm.' };
      if (status === 400) return { kind: 'error', message: 'Mã vạch không hợp lệ.' };
      return { kind: 'error', message: 'Không tra cứu được mã vạch. Hãy kiểm tra kết nối rồi thử lại.' };
    }
  }, [addProduct]);

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

  function beginPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || cart.length === 0) return;
    if (!discountValid || discountTooLarge) {
      setError(discountType === 'PERCENTAGE' && discountValid
        ? 'Giảm giá phần trăm phải nằm trong khoảng 0–100%.'
        : discountType === 'FIXED' && discountValid
          ? 'Giảm giá không được vượt quá tiền hàng.' : 'Nhập giá trị giảm giá hợp lệ, không âm.');
      return;
    }
    setError('');
    setPaymentOpen(true);
  }

  async function checkout(payment: PaymentConfirmation) {
    if (saving || cart.length === 0 || !discountValid || discountTooLarge) return;
    setSaving(true); setError(''); setSuccess(null);
    try {
      const order = await createOrder({ ...(selectedCustomer ? { customerId: selectedCustomer } : {}),
        items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        discountType, discountValue, paymentMethod: payment.paymentMethod,
        ...(payment.amountReceived !== undefined ? { amountReceived: payment.amountReceived } : {}),
        ...(payment.manualPaymentConfirmed ? { manualPaymentConfirmed: true } : {}) });
      setSuccess(order); setPaymentOpen(false);
      setProducts((current) => current.map((product) => {
        const sold = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
        return sold ? { ...product, stockQuantity: Math.max(0, product.stockQuantity - sold) } : product;
      }));
      setCart([]); setDiscountValue('0'); setDiscountType('FIXED'); setSelectedCustomer(''); setSearch(''); setMobileCartOpen(false); inputRef.current?.focus();
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
    {success && <>
      <Dialog open onClose={dismissSuccess} onCancel={(event) => event.preventDefault()} closeOnBackdrop={false}
        className="pos-success-dialog" title="Thanh toán thành công"
        footer={<><button type="button" className="secondary-button" onClick={dismissSuccess}>Đóng</button>
          <button type="button" onClick={() => window.print()}><Icon name="receipt" size={17} />In hóa đơn</button></>}>
        <div className="pos-success-content">
          <span className="pos-success-mark"><Icon name="check" size={30} /></span>
          <strong className="pos-success-order">Đơn #{success.orderCode}</strong>
          <p className="pos-success-summary">{money(success.total)} · {paymentLabels[success.paymentMethod]}</p>
        </div>
      </Dialog>
      <ThermalReceipt order={success} />
    </>}
    {scannerOpen && <BarcodeCameraScanner onClose={() => { setScannerOpen(false); inputRef.current?.focus(); }} onBarcode={handleBarcode} />}
    {mobileCartOpen && <button type="button" className="pos-cart-scrim" aria-label="Đóng giỏ hàng" onClick={() => setMobileCartOpen(false)} />}
    <div className="pos-layout">
      <section className="admin-card pos-products" aria-label="Danh sách sản phẩm">
        <div className="pos-product-toolbar">
          <div className="pos-search-actions">
            <label className="pos-search-label">Tìm sản phẩm
              <span className="pos-search-field"><Icon name="search" /><input ref={inputRef} value={search} onChange={(event) => { const value = event.target.value; searchQueryRef.current = value.trim(); setSearch(value); }} onKeyDown={onSearchKey} placeholder="Tìm sản phẩm hoặc SKU..." aria-label="Tìm sản phẩm hoặc SKU" aria-autocomplete="list" aria-expanded={!loading && visibleProducts.length > 0} aria-controls="pos-product-results" aria-activedescendant={visibleProducts[activeResult] ? `pos-product-${visibleProducts[activeResult].id}` : undefined} role="combobox" /></span>
            </label>
            <button type="button" className="secondary-button pos-barcode-button" onClick={() => setScannerOpen(true)}><Icon name="barcode" size={17} />Quét mã</button>
          </div>
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
        <form onSubmit={beginPayment} className="pos-checkout-form">
          <div className="pos-checkout-fields">
            <label>Khách hàng<select ref={customerRef} value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}><option value="">Khách lẻ</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>
            <div className="pos-discount-fields">
              <label>Loại giảm giá<select value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountType)}><option value="FIXED">Số tiền</option><option value="PERCENTAGE">Phần trăm (%)</option></select></label>
              <label>Giá trị giảm<input type="text" inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} aria-invalid={!discountValid || discountTooLarge} /></label>
            </div>
          </div>
          <dl className="pos-totals"><div><dt>Tạm tính</dt><dd>{money(subtotal)}</dd></div><div><dt>Giảm giá{discountType === 'PERCENTAGE' && discountValid ? ` (${discountValue}%)` : ''}</dt><dd>− {money(calculatedDiscount)}</dd></div><div className="pos-grand-total"><dt>Tổng thanh toán</dt><dd>{money(total)}</dd></div></dl>
          {discountTooLarge && <p className="notice-error">{discountType === 'PERCENTAGE' ? 'Giảm giá phần trăm không được vượt quá 100%.' : 'Giảm giá không được vượt quá tiền hàng.'}</p>}
          {!discountValid && <p className="notice-error">Nhập giá trị giảm giá hợp lệ, không âm.</p>}
          <button className="pos-complete" type="submit" disabled={saving || cart.length === 0 || !discountValid || discountTooLarge}>{saving ? 'Đang xử lý…' : 'Thanh toán'}</button>
        </form>
      </aside>
    </div>
    <PaymentDialog open={paymentOpen} total={total} currency={currency} locale="vi-VN" saving={saving}
      onClose={() => setPaymentOpen(false)} onConfirm={(payment) => { void checkout(payment); }} />
    {cart.length > 0 && <button type="button" className="pos-mobile-cart-trigger" aria-controls="pos-checkout-panel" aria-expanded={mobileCartOpen} onClick={() => setMobileCartOpen((open) => !open)}><span><Icon name="cart" />Giỏ hàng ({totalQuantity})</span><strong>{money(total)}</strong></button>}
  </main>;
}

function causeStatus(cause: unknown): number | undefined {
  return typeof cause === 'object' && cause !== null && 'status' in cause && typeof cause.status === 'number' ? cause.status : undefined;
}
