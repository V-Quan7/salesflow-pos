'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuaggaJSResultCallbackFunction, QuaggaJSStatic } from '@ericblade/quagga2';

import { Dialog } from '../ui/Dialog';
import { createBarcodeScanGate, includeScannedBarcode } from '../../lib/barcode-scan-gate';
import { cleanupBarcodeScanner } from '../../lib/barcode-scanner-lifecycle';
import type { BarcodeScanCandidate, BarcodeScanSnapshot } from '../../lib/barcode-scan-gate';

const REQUIRED_MATCHES = 3;
const SCAN_WINDOW_SIZE = 5;

export type BarcodeScanFeedback = { kind: 'success' | 'error'; message: string };

export function BarcodeCameraScanner({ onClose, onBarcode, mode = 'lookup' }: {
  onClose: () => void;
  onBarcode: (barcode: string) => Promise<BarcodeScanFeedback>;
  mode?: 'lookup' | 'capture';
}) {
  const cameraTarget = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);
  const onBarcodeRef = useRef(onBarcode);
  const scanGate = useRef(createBarcodeScanGate({
    windowSize: SCAN_WINDOW_SIZE,
    requiredMatches: REQUIRED_MATCHES,
  }));
  const lastDetectedLogKeyRef = useRef('');
  const lastCandidateLogKeyRef = useRef('');
  const lastLogAtRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'starting' | 'scanning' | 'processing' | 'error'>('starting');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<BarcodeScanFeedback | null>(null);
  const [lastDecoded, setLastDecoded] = useState<BarcodeScanCandidate | null>(null);
  const [confirmation, setConfirmation] = useState<BarcodeScanSnapshot>({
    candidate: null,
    matchCount: 0,
    requiredMatches: REQUIRED_MATCHES,
    confirmed: null,
    locked: false,
  });
  const [confirmed, setConfirmed] = useState<BarcodeScanCandidate | null>(null);
  onBarcodeRef.current = onBarcode;

  useEffect(() => {
    let cancelled = false;
    let scanner: QuaggaJSStatic | null = null;
    let listenerAttached = false;
    const gate = scanGate.current;
    gate.reset();
    processingRef.current = false;
    lastDetectedLogKeyRef.current = '';
    lastCandidateLogKeyRef.current = '';
    lastLogAtRef.current = 0;
    setState('starting');
    setError('');
    setFeedback(null);
    setLastDecoded(null);
    setConfirmed(null);
    setConfirmation({ candidate: null, matchCount: 0, requiredMatches: REQUIRED_MATCHES, confirmed: null, locked: false });

    const detachProcessed = () => {
      if (scanner && listenerAttached) {
        scanner.offProcessed(handleProcessed);
        listenerAttached = false;
      }
    };

    const lookupConfirmedBarcode = (candidate: BarcodeScanCandidate) => {
      if (processingRef.current || cancelled) return;
      processingRef.current = true;
      setConfirmed(candidate);
      setFeedback(null);
      setState('processing');
      if (process.env.NODE_ENV === 'development') {
        console.info('[BarcodeScanner] confirmed', { code: candidate.code, format: candidate.format });
        if (mode === 'lookup') console.info('[BarcodeScanner] lookup', { barcode: candidate.code });
      }

      void onBarcodeRef.current(candidate.code)
        .then((result) => {
          if (!cancelled) setFeedback({
            ...result,
            message: includeScannedBarcode(result.message, candidate.code),
          });
        })
        .catch(() => {
          if (!cancelled) setFeedback({
            kind: 'error',
            message: includeScannedBarcode('Không tra cứu được mã vạch. Hãy kiểm tra kết nối rồi thử lại.', candidate.code),
          });
        })
        .finally(() => {
          processingRef.current = false;
          if (!cancelled) setState('scanning');
        });
    };

    const handleProcessed: QuaggaJSResultCallbackFunction = (result) => {
      const rawCode = result.codeResult?.code?.trim() ?? '';
      const rawFormat = result.codeResult?.format?.trim() ?? '';
      const decoded = rawCode && rawFormat ? { code: rawCode, format: rawFormat } : null;
      const snapshot = gate.observe(decoded);

      if (decoded) {
        setLastDecoded((current) => current?.code === decoded.code && current.format === decoded.format ? current : decoded);
        const key = JSON.stringify([decoded.format, decoded.code]);
        const now = Date.now();
        if (process.env.NODE_ENV === 'development' && key !== lastDetectedLogKeyRef.current && now - lastLogAtRef.current >= 500) {
          console.info('[BarcodeScanner] detected', { code: decoded.code, format: decoded.format });
          lastDetectedLogKeyRef.current = key;
          lastLogAtRef.current = now;
        }
      }

      setConfirmation((current) => current.candidate?.code === snapshot.candidate?.code
        && current.candidate?.format === snapshot.candidate?.format
        && current.matchCount === snapshot.matchCount
        && current.locked === snapshot.locked
          ? current
          : snapshot);

      if (process.env.NODE_ENV === 'development' && snapshot.candidate && snapshot.matchCount > 0) {
        const candidateKey = JSON.stringify([snapshot.candidate.format, snapshot.candidate.code, snapshot.matchCount]);
        if (candidateKey !== lastCandidateLogKeyRef.current) {
          console.info('[BarcodeScanner] candidate', { code: snapshot.candidate.code, format: snapshot.candidate.format, count: snapshot.matchCount, required: snapshot.requiredMatches });
          lastCandidateLogKeyRef.current = candidateKey;
        }
      }

      if (snapshot.confirmed) lookupConfirmedBarcode(snapshot.confirmed);
      else if (!snapshot.locked && decoded && snapshot.matchCount === 1) setFeedback(null);
    };

    async function startCamera() {
      try {
        if (!window.isSecureContext) {
          throw Object.assign(new Error('Camera requires a secure connection'), { name: 'InsecureContextError' });
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('Camera API is unavailable'), { name: 'CameraUnavailableError' });
        }
        const { default: quagga } = await import('@ericblade/quagga2');
        if (cancelled || !cameraTarget.current) return;
        scanner = quagga;
        await scanner.init({
          inputStream: {
            type: 'LiveStream',
            target: cameraTarget.current,
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            area: { top: '24%', right: '8%', left: '8%', bottom: '24%' },
          },
          locator: { halfSample: true, patchSize: 'medium' },
          decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader'] },
          locate: true,
          numOfWorkers: 0,
          frequency: 8,
          canvas: { createOverlay: false },
        });
        if (cancelled) {
          await scanner.stop();
          return;
        }
        scanner.onProcessed(handleProcessed);
        listenerAttached = true;
        scanner.start();
        setState('scanning');
      } catch (cause) {
        if (scanner) {
          detachProcessed();
          await scanner.stop().catch(() => undefined);
        }
        if (cancelled) return;
        setState('error');
        setError(cameraErrorMessage(cause));
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      processingRef.current = false;
      gate.reset();
      // Quagga2 stop() also aborts an initialization that is still pending.
      cleanupBarcodeScanner(scanner, handleProcessed, listenerAttached);
      listenerAttached = false;
    };
  }, [attempt, mode]);

  function retryCamera() {
    setAttempt((current) => current + 1);
  }

  return <Dialog open onClose={onClose} title="Quét mã vạch" description="Giữ mã trong khung hình cho đến khi scanner xác nhận ổn định." footer={<button type="button" className="secondary-button" onClick={onClose}>Đóng máy quét</button>}>
    <div className="barcode-scanner">
      <div className="barcode-camera-preview" ref={cameraTarget} aria-label="Hình ảnh camera">
        <span className="barcode-scan-frame" aria-hidden="true" />
        {state === 'starting' && <span className="barcode-camera-overlay">Đang mở camera…</span>}
        {state === 'processing' && <span className="barcode-camera-overlay">{mode === 'capture' ? 'Đang nhận mã vạch…' : 'Đang tra cứu sản phẩm…'}</span>}
        {state === 'error' && <span className="barcode-camera-overlay barcode-camera-error">{error}</span>}
      </div>
      <p className="barcode-scanner-status" role="status" aria-live="polite">
        {state === 'scanning' ? 'Đang quét…' : state === 'processing' ? mode === 'capture' ? 'Đã xác nhận mã. Đang điền vào biểu mẫu…' : 'Đã xác nhận mã. Đang tra cứu sản phẩm…' : state === 'starting' ? 'Đang khởi động camera…' : 'Camera chưa sẵn sàng.'}
      </p>
      <div className="barcode-scanner-debug" aria-live="polite">
        <p>Mã nhận diện gần nhất: <code>{lastDecoded?.code ?? '—'}</code></p>
        <p>Loại: <strong>{lastDecoded ? barcodeFormatLabel(lastDecoded.format) : '—'}</strong></p>
        {confirmation.candidate && <p>Ứng viên đang xác nhận: <code>{confirmation.candidate.code}</code> · {barcodeFormatLabel(confirmation.candidate.format)}</p>}
        <p>Đang xác nhận: <strong>{confirmation.matchCount}/{confirmation.requiredMatches}</strong> kết quả khớp trong {SCAN_WINDOW_SIZE} frame gần nhất</p>
        {confirmed && <p className="barcode-scanner-confirmed">Đã nhận diện: <code>{confirmed.code}</code> · {barcodeFormatLabel(confirmed.format)}</p>}
      </div>
      {state === 'error' && <div className="barcode-scanner-actions"><p className="muted">Bạn có thể cấp quyền camera trong cài đặt trang, kiểm tra webcam, hoặc {mode === 'capture' ? 'nhập barcode thủ công.' : 'tiếp tục tìm sản phẩm bằng tên/SKU.'}</p><button type="button" className="secondary-button" onClick={retryCamera}>Thử mở lại camera</button></div>}
      {feedback && <p className={`barcode-scanner-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
    </div>
  </Dialog>;
}

function barcodeFormatLabel(format: string): string {
  const labels: Record<string, string> = {
    ean_13: 'EAN-13',
    ean_8: 'EAN-8',
    upc_a: 'UPC-A',
    upc_e: 'UPC-E',
    code_128: 'Code 128',
  };
  return labels[format] ?? format;
}

function cameraErrorMessage(cause: unknown): string {
  const name = typeof cause === 'object' && cause !== null && 'name' in cause && typeof cause.name === 'string' ? cause.name : '';
  if (name === 'InsecureContextError') return 'Camera chỉ hoạt động trên HTTPS hoặc localhost. Hãy mở POS bằng kết nối bảo mật.';
  if (name === 'CameraUnavailableError' || name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Không tìm thấy camera. Hãy kết nối webcam rồi thử lại.';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'Bạn chưa cấp quyền camera. Hãy cho phép camera trong cài đặt quyền của trình duyệt rồi thử lại.';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'Camera đang được ứng dụng khác sử dụng hoặc không thể khởi động. Hãy đóng ứng dụng đó rồi thử lại.';
  return 'Không khởi động được camera. Hãy kiểm tra quyền truy cập và webcam, hoặc dùng tìm kiếm tên/SKU.';
}
