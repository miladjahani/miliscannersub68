import { useEffect, useMemo, useState } from 'react'
import { useScanner } from '../../hooks/useScanner'
// @ts-ignore plain JS
import { generateRandomCloudflareIps } from '../../lib/scanner/ipPool.js'
// @ts-ignore plain JS
import { getWorkerUrl } from '../../lib/workerApi.js'
import type { ScanResult } from '../../store'

interface OperatorPreset { name: string; ips: string[] }
interface LiveLog { time: string; message: string; type: 'info' | 'success' | 'error' }

const DEFAULT_PRESETS: Record<string, OperatorPreset> = {
  mci: { name: 'همراه اول (MCI)', ips: ['104.16.1.1', '104.16.12.1', '172.64.80.1'] },
  mtn: { name: 'ایرانسل (MTN Irancell)', ips: ['104.16.2.1', '104.17.3.1', '172.67.1.1'] },
  rightel: { name: 'رایتل (Rightel)', ips: ['104.16.5.1', '104.17.8.1', '172.64.120.1'] },
  tci: { name: 'مخابرات و شاتل', ips: ['104.16.100.1', '104.17.150.1', '172.67.150.1'] },
}

export default function IpScanner({ onSelectCleanIp }: { onSelectCleanIp: (ip: string) => void }) {
  const {
    rawIpsInput, setRawIpsInput,
    concurrency, setConcurrency,
    timeoutMs, setTimeoutMs,
    isScanning,
    results,
    scanProgress,
    healthyCount,
    failedCount,
    displayResults,
    startScan,
    stopScan,
    runSpeed,
  } = useScanner()

  const [largePoolIps, setLargePoolIps] = useState<string[]>([])
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([])
  const [operatorPresets, setOperatorPresets] = useState<Record<string, OperatorPreset>>(DEFAULT_PRESETS)
  const hasWorker = !!getWorkerUrl()

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/misub-data/cloudflare-ips.json')
        const data = await res.json()
        setLargePoolIps(data.ips || [])
      } catch {
        setLargePoolIps(generateRandomCloudflareIps(500))
      }
      try {
        const opRes = await fetch('/misub-data/operator-presets.json')
        setOperatorPresets(await opRes.json())
      } catch { /* keep defaults */ }
    })()
  }, [])

  const currentPoolCount = useMemo(
    () => rawIpsInput.split('\n').filter((i) => i.trim().length > 0).length,
    [rawIpsInput]
  )

  const progressPercent = scanProgress.total ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0

  const loadLargePool = () => setRawIpsInput(largePoolIps.slice(0, 1000).join('\n'))
  const generateRandomSample = (count: number) => setRawIpsInput(generateRandomCloudflareIps(count).join('\n'))
  const loadOperatorPreset = (key: string) => {
    if (operatorPresets[key]?.ips) setRawIpsInput(operatorPresets[key].ips.join('\n'))
  }

  const handleStartScan = async () => {
    setLiveLogs([])
    const nowStr = () => new Date().toTimeString().split(' ')[0]
    const modeMsg = hasWorker
      ? 'شروع اسکن دسته‌ای واقعی در Edge (هندشیک TCP + تایید Colo)...'
      : `شروع اسکن محلی از مرورگر با ${concurrency} تِرد موازی (بدون ورکر، بدون Colo)...`
    setLiveLogs([{ time: nowStr(), message: modeMsg, type: 'info' }])

    const finalResults = (await startScan()) ?? []

    const ok = finalResults.filter((r) => r && r.status === 'ok')
    const withColo = finalResults.filter((r) => r && r.colo).length
    setLiveLogs((prev) => [...prev, {
      time: nowStr(),
      message: `اسکن کامل شد. ${ok.length} آی‌پی تمیز تایید شدند${withColo ? ` (${withColo} با تایید Colo واقعی)` : ''}.`,
      type: 'success',
    }])
  }

  const exportResultsCsv = () => {
    const rows: (string | number)[][] = [['IP', 'Latency (ms)', 'Colo', 'City', 'Source', 'Status', 'Speed (MB/s)']]
    displayResults.forEach((r: ScanResult) => {
      rows.push([r.ip, r.latency || '', r.colo || '', r.city || '', (r as { source?: string }).source || '', r.status, r.speedMbps || ''])
    })
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `cloudflare_clean_ips_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getLatencyClass = (lat: number) => {
    if (lat < 130) return 'text-green font-bold'
    if (lat < 220) return 'text-yellow'
    return 'text-red'
  }

  return (
    <div className="scanner-module">
      <div className="card-header">
        <h3>🧪 اسکنر پیشرفته آی‌پی کلودفلر (Clean IP Scanner Pro)</h3>
        <p className="desc">مخزن بیش از ۳,۸۰۰ آی‌پی واقعی کلودفلر؛ اسکنر موازی PBP (Parallel Batch Probe) با هندشیک واقعی TCP و تایید Colo/دیتاسنتر از طریق ورکر، به‌همراه پروب محلی از مرورگر شما</p>
      </div>

      {!hasWorker ? (
        <div className="notice-box card">
          ⚠️ برای فعال‌سازی اسکن دسته‌ای واقعی در Edge (هندشیک TCP واقعی + تشخیص Colo) آدرس Cloudflare Worker خود را در تب «تنظیمات» وارد کنید. بدون آن، اسکن فقط با پروب محلی مرورگر (کندتر و بدون اطلاعات Colo) انجام می‌شود.
        </div>
      ) : (
        <div className="notice-box ok card">
          ✅ اسکن دسته‌ای Edge فعال است — هندشیک TCP واقعی + تایید Colo/دیتاسنتر برای هر آی‌پی از طریق ورکر شما انجام می‌شود.
        </div>
      )}

      <div className="pool-selector card">
        <div className="selector-header">
          <span>مخزن و رنج‌های انتخابی:</span>
          <span className="pool-count font-mono text-cyan">{currentPoolCount.toLocaleString()} آی‌پی آماده</span>
        </div>
        <div className="chip-row">
          <button onClick={loadLargePool} className="chip-btn highlight">🌐 بارگذاری مخزن ۳,۸۰۰+ آی‌پی</button>
          <button onClick={() => generateRandomSample(100)} className="chip-btn">🎲 تولید ۱۰۰ آی‌پی تصادفی</button>
          <button onClick={() => generateRandomSample(500)} className="chip-btn">🎲 تولید ۵۰۰ آی‌پی تصادفی</button>
          <button onClick={() => generateRandomSample(1500)} className="chip-btn">🎲 تولید ۱,۵۰۰ آی‌پی تصادفی</button>
          <button onClick={() => loadOperatorPreset('mci')} className="chip-btn">همراه اول (MCI)</button>
          <button onClick={() => loadOperatorPreset('mtn')} className="chip-btn">ایرانسل (MTN)</button>
          <button onClick={() => loadOperatorPreset('rightel')} className="chip-btn">رایتل (Rightel)</button>
          <button onClick={() => loadOperatorPreset('tci')} className="chip-btn">مخابرات و شاتل</button>
        </div>
      </div>

      <div className="scanner-controls-grid">
        <div className="form-group card">
          <label>لیست آی‌پی‌های هدف برای اسکن:</label>
          <textarea
            value={rawIpsInput}
            onChange={(e) => setRawIpsInput(e.target.value)}
            rows={5}
            className="textarea-box font-mono"
            placeholder={'104.16.1.1\n172.64.1.1\n162.158.1.1'}
          />
        </div>

        <div className="config-side card">
          <div className="grid-2">
            <div className="form-group">
              <label>تعداد تِردهای موازی:</label>
              <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} className="input-box">
                <option value={4}>4 تِرد (پایدار)</option>
                <option value={8}>8 تِرد (پیش‌فرض)</option>
                <option value={16}>16 تِرد (سریع)</option>
                <option value={32}>32 تِرد (فوق‌سریع)</option>
              </select>
            </div>
            <div className="form-group">
              <label>تایم‌اوت پینگ (میلی‌ثانیه):</label>
              <select value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} className="input-box">
                <option value={1500}>1.5 ثانیه</option>
                <option value={2500}>2.5 ثانیه</option>
                <option value={4000}>4.0 ثانیه</option>
              </select>
            </div>
          </div>

          <div className="action-btn-row">
            <button onClick={handleStartScan} disabled={isScanning} className="btn primary">
              {isScanning && <span className="spinner"></span>}
              {isScanning ? `در حال اسکن (${scanProgress.current}/${scanProgress.total})...` : '🚀 شروع اسکن موازی'}
            </button>
            {isScanning && <button onClick={stopScan} className="btn danger">توقف</button>}
            {results.length > 0 && <button onClick={exportResultsCsv} className="btn secondary">دانلود خروجی CSV</button>}
          </div>
        </div>
      </div>

      {isScanning && (
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width: progressPercent + '%' }}></div>
        </div>
      )}

      {liveLogs.length > 0 && (
        <div className="terminal-log-box card">
          <div className="terminal-header">
            <span className="terminal-title">📟 کنسول زنده اسکنر (Live Scan Logs)</span>
            <button onClick={() => setLiveLogs([])} className="btn small secondary">پاکسازی لاگ</button>
          </div>
          <div className="terminal-logs font-mono">
            {liveLogs.slice(-25).map((log, idx) => (
              <div key={idx} className={`log-line ${log.type}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="results-box card">
          <div className="results-header">
            <div className="stats">
              <span>کل: <b>{results.length}</b></span>
              <span>سالم: <b className="text-green">{healthyCount}</b></span>
              <span>ناموفق: <b className="text-red">{failedCount}</b></span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>آدرس IP</th>
                  <th>میانگین تاخیر</th>
                  <th>Colo / دیتاسنتر</th>
                  <th>منبع</th>
                  <th>وضعیت</th>
                  <th>تست سرعت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((item: ScanResult, idx: number) => (
                  <tr key={item.ip}>
                    <td>{idx + 1}</td>
                    <td className="font-mono text-cyan font-bold">{item.ip}</td>
                    <td className="font-mono">
                      {item.latency !== null ? (
                        <span className={getLatencyClass(item.latency)}>{item.latency} ms</span>
                      ) : item.status === 'testing' ? (
                        <span className="text-yellow">تست...</span>
                      ) : (
                        <span className="text-red">Timeout</span>
                      )}
                    </td>
                    <td className="font-mono text-muted">
                      {item.colo && <span className="text-green">{item.colo}</span>}
                      {(item as { crossVerified?: boolean }).crossVerified && (
                        <span title="تایید متقاطع با هدر CF-RAY" className="verified-badge">✓✓</span>
                      )}
                      {item.city && <span className="text-muted"> — {item.city}</span>}
                      {!item.colo && '-'}
                    </td>
                    <td className="font-mono text-muted">
                      {(item as { source?: string }).source === 'edge' ? '🌐 Edge' : (item as { source?: string }).source === 'local' ? '📱 محلی' : '-'}
                    </td>
                    <td>
                      <span className={`badge ${item.status}`}>
                        {item.status === 'ok' ? 'سالم' : item.status === 'testing' ? 'تست' : 'ناموفق'}
                      </span>
                    </td>
                    <td>
                      {item.speedMbps ? (
                        <span className="text-green font-bold">{item.speedMbps} MB/s</span>
                      ) : item.status === 'ok' ? (
                        <button onClick={() => runSpeed(item)} disabled={item.speedTesting} className="btn small secondary">
                          {item.speedTesting ? '...' : 'تست سرعت'}
                        </button>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <button onClick={() => onSelectCleanIp(item.ip)} className="btn small primary">
                        انتقال به بهینه‌ساز
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
