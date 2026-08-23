import Modal from './Modal'

export default function QrCodeModal({ isOpen, title, content, onClose }: { isOpen: boolean; title: string; content: string; onClose: () => void }) {
  const copyText = async () => {
    await navigator.clipboard.writeText(content || '')
    alert('لینک کانفیگ کپی شد.')
  }

  return (
    <Modal isOpen={isOpen} title="بارکد QR کانفیگ" onClose={onClose}>
      <div className="qr-container">
        <p className="qr-title">{title}</p>
        <div className="qr-image-wrap">
          <img
            src={'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(content)}
            alt="QR Code"
            className="qr-img"
          />
        </div>
        <div className="qr-actions">
          <button onClick={copyText} className="btn primary small">کپی لینک کانفیگ</button>
        </div>
      </div>
    </Modal>
  )
}
