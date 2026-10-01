'use client';

import { useEffect, useState } from 'react';

import {
  confirmProductImport,
  downloadProductImportTemplate,
  previewProductImport,
} from '../../lib/auth-client';
import type { ProductImportPreview, ProductImportRowError } from '../../lib/auth-client';
import { Dialog } from '../ui/Dialog';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function ProductImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (createdCount: number) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setError('');
    }
  }, [open]);

  function close() {
    if (downloading || checking || importing) return;
    onClose();
  }

  async function downloadTemplate() {
    setDownloading(true); setError('');
    try {
      const blob = await downloadProductImportTemplate();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'salesflow-products-template.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause, 'Không tải được file mẫu.'));
    } finally { setDownloading(false); }
  }

  async function selectFile(selected: File | null) {
    setFile(selected); setPreview(null); setError('');
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setError('Chỉ hỗ trợ file .xlsx.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('File Excel vượt quá giới hạn 5 MB.');
      return;
    }
    setChecking(true);
    try {
      setPreview(await previewProductImport(selected));
    } catch (cause) {
      setError(errorMessage(cause, 'Không đọc được file Excel.'));
    } finally { setChecking(false); }
  }

  async function confirmImport() {
    if (!file || !preview || preview.errorRows > 0 || preview.errors.length > 0 || preview.totalRows === 0) return;
    setImporting(true); setError('');
    try {
      const result = await confirmProductImport(file);
      await onImported(result.createdCount);
      onClose();
    } catch (cause) {
      const serverErrors = getServerErrors(cause);
      setError([
        errorMessage(cause, 'Không nhập được sản phẩm.'),
        ...serverErrors.map(formatRowError),
      ].join('\n'));
    } finally { setImporting(false); }
  }

  const canImport = Boolean(file && preview && preview.totalRows > 0 && preview.errorRows === 0 && preview.errors.length === 0 && !checking && !importing);
  return <Dialog open={open} onClose={close} onCancel={(event) => { if (downloading || checking || importing) event.preventDefault(); }} size="large" title="Nhập sản phẩm bằng Excel"
    description="Tải template, điền dữ liệu rồi xem trước lỗi trước khi xác nhận nhập. File tối đa 5 MB và 500 dòng."
    footer={<><button type="button" className="secondary-button" onClick={close} disabled={checking || importing || downloading}>Đóng</button><button type="button" onClick={() => void confirmImport()} disabled={!canImport}>{importing ? 'Đang nhập…' : 'Xác nhận nhập'}</button></>}>
    <div className="product-import-panel">
      <div className="product-import-toolbar">
        <button type="button" className="secondary-button" onClick={() => void downloadTemplate()} disabled={downloading || checking || importing}>
          {downloading ? 'Đang tải…' : 'Tải template Excel'}
        </button>
        <label className="product-import-file">Chọn file .xlsx
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={checking || importing || downloading}
            onChange={(event) => { const selected = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void selectFile(selected); }} />
        </label>
      </div>
      {file && <p className="muted product-import-file-name">File đã chọn: <strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB</p>}
      {checking && <p className="product-import-state" role="status">Đang kiểm tra file và dữ liệu theo cửa hàng hiện tại…</p>}
      {error && <div className="notice-error product-import-error" role="alert">{error}</div>}
      {preview && <>
        <div className="product-import-summary" aria-live="polite">
          <span><strong>{preview.totalRows}</strong> dòng</span>
          <span><strong>{preview.validRows}</strong> hợp lệ</span>
          <span className={preview.errorRows ? 'has-errors' : ''}><strong>{preview.errorRows}</strong> dòng lỗi</span>
        </div>
        {preview.errors.length > 0 && <ul className="product-import-errors">{preview.errors.map((item, index) => <li key={`${item.row}-${item.column}-${index}`}>{formatRowError(item)}</li>)}</ul>}
        {preview.rows.length > 0 && <div className="table-wrap product-import-table-wrap"><table className="data-table product-import-table">
          <thead><tr><th>Dòng</th><th>SKU</th><th>Barcode</th><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Trạng thái</th><th>Tồn đầu</th><th>Lỗi</th></tr></thead>
          <tbody>{preview.rows.map((row) => <tr key={row.row} className={row.errors.length ? 'product-import-invalid' : undefined}>
            <td>{row.row}</td><td><code>{row.sku || '—'}</code></td><td><code>{row.barcode || '—'}</code></td>
            <td>{row.name || '—'}</td><td>{row.categoryName || row.categorySlug || '—'}</td><td className="numeric">{row.sellingPrice}</td>
            <td>{row.status}</td><td className="numeric">{row.openingStock}</td>
            <td>{row.errors.length ? row.errors.map(formatRowError).join(' · ') : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
        {preview.errorRows === 0 && preview.errors.length === 0 && preview.totalRows > 0 && <p className="notice-success" role="status">Dữ liệu hợp lệ. Khi xác nhận, hệ thống sẽ kiểm tra lại trước khi ghi toàn bộ dữ liệu.</p>}
      </>}
    </div>
  </Dialog>;
}

function getServerErrors(cause: unknown): ProductImportRowError[] {
  if (typeof cause !== 'object' || cause === null || !('responseBody' in cause)) return [];
  const body = cause.responseBody;
  if (typeof body !== 'object' || body === null || !('errors' in body) || !Array.isArray(body.errors)) return [];
  return body.errors.filter((item): item is ProductImportRowError => typeof item === 'object' && item !== null
    && 'row' in item && typeof item.row === 'number' && 'column' in item && typeof item.column === 'string'
    && 'message' in item && typeof item.message === 'string');
}

function formatRowError(item: ProductImportRowError): string {
  return `Dòng ${item.row} · ${item.column}: ${item.message}`;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return fallback;
}
