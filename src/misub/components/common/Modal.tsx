import type { ReactNode } from 'react'

export default function Modal({ isOpen, title, onClose, children }: { isOpen: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!isOpen) return null
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-dialog card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
