import { useMiSubStore } from '../store'
import IpScanner from '../components/scanner/IpScanner'

export default function ScannerView() {
  const s = useMiSubStore()

  const handleSelectCleanIp = (ip: string) => {
    s.setCleanIp(ip)
    s.setActiveTab('optimizer')
  }

  return (
    <div className="view-container">
      <IpScanner onSelectCleanIp={handleSelectCleanIp} />
    </div>
  )
}
