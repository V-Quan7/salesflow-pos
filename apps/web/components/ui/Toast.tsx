'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type ToastProps = {
  toastId: string;
  title: string;
  description: string;
  onClose: () => void;
  duration?: number;
};

export function Toast({ toastId, title, description, onClose, duration = 3600 }: ToastProps) {
  const [exiting, setExiting] = useState(false);
  const closing = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setExiting(true);
    exitTimer.current = window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    closing.current = false;
    setExiting(false);
    const timer = window.setTimeout(close, duration);
    return () => {
      window.clearTimeout(timer);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [toastId, duration, close]);

  return <div className={`toast-overlay${exiting ? ' is-exiting' : ''}`}>
    <div className="toast-notification" role="status" aria-live="polite" aria-atomic="true">
      <span className="toast-success-icon"><Icon name="check" size={22} /></span>
      <span className="toast-copy"><strong>{title}</strong><span>{description}</span></span>
      <button type="button" className="toast-close" aria-label="Đóng thông báo" onClick={close}>×</button>
    </div>
  </div>;
}
