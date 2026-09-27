import type { ReactNode } from "react";

export function Modal({ title, onClose, children, width = 460 }: { title: string; onClose?: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
