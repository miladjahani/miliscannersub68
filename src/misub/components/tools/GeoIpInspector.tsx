import { useState } from 'react'

interface GeoData {
  country?: string
  country_code?: string
  city?: string
  region?: string
  org?: string
  connection?: { isp?: string; asn?: string | number }
}

export default function GeoIpInspector() {
  const [targetIp, setTargetIp] = useState('104.16.1.1')
  const [loading, setLoading] = useState(false)
  const [geoData, setGeoData] = useState<GeoData | null>(null)

  const inspect = async () => {
    if (!targetIp.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`https://ipwho.is/${targetIp.trim()}`)
      setGeoData(await res.json())
    } catch (e) {
      alert('خطا در استعلام GeoIP: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="geoip-card card">
      <div className="geoip-header">
        <h4>📍 تحلیل موقعیت و ASN آی‌پی (GeoIP Inspector)</h4>
        <p className="desc">بررسی کشور، شهر، سازمان و شماره سیستم خودمختار (ASN) آی‌پی‌های تست‌شده</p>
      </div>

      <div className="form-group">
        <label>آدرس IP هدف:</label>
        <div className="input-with-btn">
          <input value={targetIp} onChange={(e) => setTargetIp(e.target.value)} placeholder="104.16.1.1" className="input-box font-mono" />
          <button onClick={inspect} disabled={loading || !targetIp.trim()} className="btn primary small">
            {loading ? '...' : 'استعلام'}
          </button>
        </div>
      </div>

      {geoData && (
        <div className="geo-details font-mono">
          <div><b>کشور:</b> {geoData.country || '-'} ({geoData.country_code || '-'})</div>
          <div><b>شهر / منطقه:</b> {geoData.city || '-'} / {geoData.region || '-'}</div>
          <div><b>سازمان / ISP:</b> {geoData.connection?.isp || geoData.org || '-'}</div>
          <div><b>ASN:</b> {geoData.connection?.asn || '-'}</div>
        </div>
      )}
    </div>
  )
}
