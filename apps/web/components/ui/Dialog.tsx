'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ open, onClose, title, description, children, footer, size = 'medium' }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'medium' | 'large' | 'drawer';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return <dialog ref={dialog} className={`dialog dialog-${size}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onClose={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <header className="dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className="muted">{description}</p>}</div><button type="button" className="icon-button" aria-label="Đóng cửa sổ" onClick={onClose}><Icon name="close" /></button></header>
    <div className="dialog-content">{children}</div>
    {footer && <footer className="dialog-footer">{footer}</footer>}
  </dialog>;
}
