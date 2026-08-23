import { useMemo, useState } from 'react'
// @ts-ignore plain JS
import { fetchProxyFeed, probeProxyBatch, lookupProxyCountries, countryCodeToFlag, PROXY_FEEDS } from '../../lib/optimizer/proxySource.js'
// @ts-ignore plain JS
import { getWorkerUrl } from '../../lib/workerApi.js'

interface ProxyItem {
  ip: string
  port: number
  status: 'untested' | 'ok' | 'error'
  latency: number | null
  country: string | null
  countryCode: string | null
  [key: string]: unknown
}

export interface FrontProxy {
  name: string
  type: 'http' | 'socks5'
  tag: string
  sbType: 'http' | 'socks'
  socksVersion: '4' | '5'
  server: string
  port: number
  country: string | null
  countryCode: string | null
  username?: string
  password?: string
}

export default function ProxyInjector({ onChangeFrontProxy }: { onChangeFrontProxy: (v: FrontProxy | null) => void }) {
  const [enabled, setEnabled] = useState(false)
  const feeds = PROXY_FEEDS as Record<string, { label: string }>
  const [loadingFeed, setLoadingFeed] = useState<string | null>(null)
  const [feedMsg, setFeedMsg] = useState('')
  const [feedOk, setFeedOk] = useState(true)
  const [proxyList, setProxyList] = useState<ProxyItem[]>([])
  const [testingLive, setTestingLive] = useState(false)
  const [detectingGeo, setDetectingGeo] = useState(false)
  const [countryFilter, setCountryFilter] = useState('')
  const [selected, setSelected] = useState<{ ip: string; port: number; country: string | null; countryCode: string | null } | null>(null)
  const [selectedType, setSelectedType] = useState<'http' | 'socks5' | 'socks4'>('socks5')

  const [manualType, setManualType] = useState<'http' | 'socks5' | 'socks4'>('socks5')
  const [manualIp, setManualIp] = useState('')
  const [manualPort, setManualPort] = useState('')
  const [manualUser, setManualUser] = useState('')
  const [manualPass, setManualPass] = useState('')

  const hasWorker = !!getWorkerUrl()

  const countryOptions = useMemo(() => {
    const counts: Record<string, { code: string; name: string | null; flag: string; count: number }> = {}
    proxyList.forEach((p) => {
      if (!p.countryCode) return
      if (!counts[p.countryCode]) counts[p.countryCode] = { code: p.countryCode, name: p.country, flag: countryCodeToFlag(p.countryCode), count: 0 }
      counts[p.countryCode].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count)
  }, [proxyList])

  const displayList = useMemo(() => {
    const filtered = countryFilter ? proxyList.filter((p) => p.countryCode === countryFilter) : proxyList
    return filtered.slice(0, 80)
  }, [proxyList, countryFilter])

  const emitFrontProxy = (sel: typeof selected, type: typeof selectedType, user: string, pass: string) => {
    if (!sel) { onChangeFrontProxy(null); return }
    const clashType: 'http' | 'socks5' = type === 'socks5' || type === 'socks4' ? 'socks5' : 'http'
    const sbType: 'http' | 'socks' = type === 'http' ? 'http' : 'socks'
    const flag = sel.countryCode ? countryCodeToFlag(sel.countryCode) : '🌐'
    const label = sel.country || 'خروجی سفارشی'
    const displayName = `${flag} ${label} Exit`
    const safeTag = (sel.countryCode || 'XX') + '-' + sel.ip.replace(/\./g, '_')
    onChangeFrontProxy({
      name: displayName,
      type: clashType,
      tag: `exit-${safeTag}`,
      sbType,
      socksVersion: type === 'socks4' ? '4' : '5',
      server: sel.ip,
      port: sel.port,
      country: sel.country,
      countryCode: sel.countryCode,
      username: user.trim() || undefined,
      password: pass.trim() || undefined,
    })
  }

  const loadFeed = async (type: string) => {
    setLoadingFeed(type)
    setFeedMsg('')
    setCountryFilter('')
    try {
      const worker = getWorkerUrl()
      const { list, via } = await fetchProxyFeed(type, worker)
      const withDefaults: ProxyItem[] = list.map((p: Partial<ProxyItem>) => ({ ...p, status: 'untested', latency: null, country: null, countryCode: null } as ProxyItem))
      setProxyList(withDefaults)
      setSelectedType(type as typeof selectedType)
      setFeedOk(true)
      const viaLabel = via === 'worker' ? 'Worker' : via === 'direct' ? 'مستقیم از GitHub' : via
      setFeedMsg(`✅ ${list.length} پروکسی ${feeds[type].label} از roosterkid/openproxylist دریافت شد (${viaLabel})`)
    } catch (e) {
      setFeedOk(false)
      setFeedMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoadingFeed(null)
    }
  }

  const testAllLive = async () => {
    if (!proxyList.length) return
    setTestingLive(true)
    try {
      const worker = getWorkerUrl()
      const batch = proxyList.slice(0, 200)
      const results = await probeProxyBatch(batch, worker, { concurrency: 25 })
      const byKey: Record<string, { status: ProxyItem['status']; latency: number | null }> = {}
      results.forEach((r: { ip: string; port: number; status: ProxyItem['status']; latency: number | null }) => { byKey[`${r.ip}:${r.port}`] = r })
      const updated = proxyList.map((p) => {
        const r = byKey[`${p.ip}:${p.port}`]
        return r ? { ...p, status: r.status, latency: r.latency } : p
      }).sort((a, b) => {
        if (a.status === 'ok' && b.status !== 'ok') return -1
        if (b.status === 'ok' && a.status !== 'ok') return 1
        if (a.status === 'ok' && b.status === 'ok') return (a.latency || 9999) - (b.latency || 9999)
        return 0
      })
      setProxyList(updated)
    } catch (e) {
      setFeedOk(false)
      setFeedMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestingLive(false)
    }
  }

  const detectCountries = async () => {
    if (!proxyList.length) return
    setDetectingGeo(true)
    try {
      const worker = getWorkerUrl()
      const batch = proxyList.slice(0, 200)
      const withGeo: ProxyItem[] = await lookupProxyCountries(batch, worker)
      const byKey: Record<string, ProxyItem> = {}
      withGeo.forEach((p) => { byKey[`${p.ip}:${p.port}`] = p })
      setProxyList(proxyList.map((p) => byKey[`${p.ip}:${p.port}`] || p))
      const found = withGeo.filter((p) => p.countryCode).length
      setFeedOk(true)
      setFeedMsg(`🌍 کشور ${found} پروکسی از ${batch.length} پروکسی تشخیص داده شد.`)
    } catch (e) {
      setFeedOk(false)
      setFeedMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDetectingGeo(false)
    }
  }

  const selectProxy = (p: ProxyItem) => {
    const sel = { ip: p.ip, port: p.port, country: p.country, countryCode: p.countryCode }
    setSelected(sel)
    emitFrontProxy(sel, selectedType, manualUser, manualPass)
  }

  const applyManual = () => {
    if (!manualIp.trim() || !manualPort) return
    setSelectedType(manualType)
    const sel = { ip: manualIp.trim(), port: Number(manualPort), country: null, countryCode: null }
    setSelected(sel)
    emitFrontProxy(sel, manualType, manualUser, manualPass)
  }

  return (
    <div className="proxy-injector card">
      <label className="toggle-wrap">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>📌 تزریق پروکسی برای آی‌پی ثابت (Static IP via Proxy Chain — HTTP/SOCKS4/SOCKS5)</span>
      </label>

      {enabled && (
        <div className="body">
          <p className="desc">
            این پروکسی به‌عنوان <b>خروجی نهایی</b> کل ترافیک اینترنت شما تنظیم می‌شود و در کلاینت شما
            فقط به‌صورت <b>یک آیتم تمیز</b> (مثلاً «🇩🇪 Germany Exit») دیده می‌شود — نودهای VLESS/Trojan
            زیرین که واسطه رسیدن به این پروکسی هستند، از لیست مخفی می‌شوند.
            <br />
            <b>چرا کاملاً یکی نمی‌شود:</b> این پروکسی‌ها پروتکل VLESS/Trojan را نمی‌فهمند (برخلاف
            آی‌پی‌های تمیز کلودفلر که به‌خاطر شبکه Anycast کلودفلر مستقیماً جایگزین می‌شوند)، پس یک هاپ
            واقعی شبکه لازم است — اما این هاپ از دید شما پنهان شده و فقط یک کانفیگ نهایی می‌بینید.
            ⚠️ فقط روی خروجی <b>Clash Meta</b> و <b>Sing-box</b> اعمال می‌شود — لینک‌های خام
            (<code>vless://</code>, <code>trojan://</code>) استانداردی برای این زنجیره ندارند.
          </p>

          <div className="feed-row">
            {Object.entries(feeds).map(([key, feed]) => (
              <button
                key={key}
                onClick={() => loadFeed(key)}
                disabled={loadingFeed === key}
                className="btn small secondary"
              >
                {loadingFeed === key && <span className="spinner"></span>}
                {loadingFeed === key ? 'در حال دریافت...' : `📥 دریافت ${feed.label} از openproxylist`}
              </button>
            ))}
          </div>
          {feedMsg && <p className={`feed-msg ${feedOk ? 'text-green' : 'text-red'}`}>{feedMsg}</p>}

          {proxyList.length > 0 && (
            <div className="list-actions">
              <button onClick={testAllLive} disabled={testingLive || !hasWorker} className="btn small primary">
                {testingLive && <span className="spinner"></span>}
                {testingLive ? 'در حال تست زنده بودن...' : '🧪 تست واقعی زنده بودن (TCP)'}
              </button>
              <button onClick={detectCountries} disabled={detectingGeo || !hasWorker} className="btn small secondary">
                {detectingGeo && <span className="spinner"></span>}
                {detectingGeo ? 'در حال تشخیص کشور...' : '🌍 تشخیص کشور واقعی (GeoIP)'}
              </button>
              <span className="count-badge">{proxyList.length} پروکسی دریافت‌شده</span>
            </div>
          )}
          {!hasWorker && <p className="hint text-yellow">برای تست زنده بودن و تشخیص کشور، آدرس Worker را در تنظیمات وارد کنید.</p>}

          {countryOptions.length > 0 && (
            <div className="country-filter-row">
              <label>فیلتر بر اساس کشور:</label>
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="input-box font-mono">
                <option value="">همه کشورها ({proxyList.length})</option>
                {countryOptions.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.count})</option>
                ))}
              </select>
            </div>
          )}

          {proxyList.length > 0 && (
            <div className="proxy-table-wrap">
              <table className="proxy-table">
                <thead>
                  <tr><th></th><th>کشور</th><th>IP</th><th>Port</th><th>وضعیت</th></tr>
                </thead>
                <tbody>
                  {displayList.map((p) => (
                    <tr
                      key={`${p.ip}:${p.port}`}
                      onClick={() => selectProxy(p)}
                      className={selected && selected.ip === p.ip && selected.port === p.port ? 'active' : ''}
                    >
                      <td><input type="radio" checked={!!(selected && selected.ip === p.ip && selected.port === p.port)} readOnly /></td>
                      <td>
                        {p.countryCode ? <span>{countryCodeToFlag(p.countryCode)} {p.country}</span> : <span className="text-muted">-</span>}
                      </td>
                      <td className="font-mono">{p.ip}</td>
                      <td className="font-mono">{p.port}</td>
                      <td>
                        {p.status === 'ok' ? <span className="text-green">✓ زنده ({p.latency}ms)</span>
                          : p.status === 'error' ? <span className="text-red">✗ پاسخ‌نداد</span>
                          : <span className="text-muted">تست‌نشده</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="manual-entry">
            <label>یا آدرس پروکسی را دستی وارد کنید:</label>
            <div className="manual-row">
              <select value={manualType} onChange={(e) => setManualType(e.target.value as typeof manualType)} className="input-box font-mono small-select">
                <option value="http">HTTP</option>
                <option value="socks5">SOCKS5</option>
                <option value="socks4">SOCKS4</option>
              </select>
              <input value={manualIp} onChange={(e) => setManualIp(e.target.value)} placeholder="IP" className="input-box font-mono" />
              <input value={manualPort} onChange={(e) => setManualPort(e.target.value)} placeholder="Port" className="input-box font-mono small-input" />
              <button onClick={applyManual} className="btn small primary">اعمال</button>
            </div>
            <div className="manual-row">
              <input value={manualUser} onChange={(e) => setManualUser(e.target.value)} placeholder="یوزرنیم (اختیاری)" className="input-box font-mono" />
              <input value={manualPass} onChange={(e) => setManualPass(e.target.value)} placeholder="پسورد (اختیاری)" type="password" className="input-box font-mono" />
            </div>
          </div>

          {selected && (
            <div className="selected-summary">
              ✅ پروکسی انتخاب‌شده: <span className="font-mono">{selectedType}://{selected.ip}:{selected.port}</span>
              {selected.countryCode && <span>{countryCodeToFlag(selected.countryCode)} {selected.country}</span>}
              <br />در خروجی Clash/Sing-box، این پروکسی به‌عنوان <b>یک کانفیگ تمیز و مستقل</b> ظاهر می‌شود
              (نودهای واسط مخفی هستند) و کل ترافیک از این IP خارج خواهد شد.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
