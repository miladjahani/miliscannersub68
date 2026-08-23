import { useState } from 'react'
// @ts-ignore plain JS
import { resolveDoH } from '../../lib/scanner/doh.js'

export default function DohLab() {
  const [domain, setDomain] = useState('speed.cloudflare.com')
  const [provider, setProvider] = useState('https://cloudflare-dns.com/dns-query')
  const [loading, setLoading] = useState(false)
  const [resolvedIps, setResolvedIps] = useState<string[]>([])
  const [statusMsg, setStatusMsg] = useState('')
  const [statusType, setStatusType] = useState<'ok' | 'err'>('ok')

  const resolve = async () => {
    if (!domain.trim()) return
    setLoading(true)
    setStatusMsg('')
    setResolvedIps([])
    try {
      const ips = await resolveDoH(domain.trim(), provider)
      setResolvedIps(ips)
      if (ips.length > 0) {
        setStatusMsg(`✅ تعداد ${ips.length} آی‌پی با موفقیت دریافت شد.`)
        setStatusType('ok')
      } else {
        setStatusMsg('⚠️ پاسخی از سرور DoH دریافت نشد.')
        setStatusType('err')
      }
    } catch (err) {
      setStatusMsg(`❌ خطا: ${err instanceof Error ? err.message : String(err)}`)
      setStatusType('err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="doh-card card">
      <div className="doh-header">
        <h4>🌐 آزمایشگاه DNS-over-HTTPS (DoH Lab)</h4>
        <p className="desc">تست تفکیک نام دامنه از طریق سرورهای رمزنگاری‌شده DoH کلودفلر و گوگل</p>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>نام دامنه هدف:</label>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="speed.cloudflare.com" className="input-box font-mono" />
        </div>
        <div className="form-group">
          <label>ارائه‌دهنده DoH:</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input-box font-mono">
            <option value="https://cloudflare-dns.com/dns-query">Cloudflare (1.1.1.1)</option>
            <option value="https://dns.google/resolve">Google (8.8.8.8)</option>
            <option value="https://dns.quad9.net/dns-query">Quad9 (9.9.9.9)</option>
          </select>
        </div>
      </div>

      <button onClick={resolve} disabled={loading || !domain.trim()} className="btn primary small">
        {loading && <span className="spinner"></span>}
        {loading ? 'در حال حل دامنه...' : '🔍 حل نام دامنه (Resolve)'}
      </button>

      {statusMsg && <div className={`status-box ${statusType}`}>{statusMsg}</div>}

      {resolvedIps.length > 0 && (
        <div className="resolved-results">
          <span className="label">آی‌پی‌های پاسخ داده شده:</span>
          <div className="ip-chips">
            {resolvedIps.map((ip) => <span key={ip} className="chip font-mono text-cyan">{ip}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
