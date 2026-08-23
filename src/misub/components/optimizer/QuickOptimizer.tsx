import { useEffect, useMemo, useState } from 'react'
import { useOptimizer } from '../../hooks/useOptimizer'
import { useMiSubStore } from '../../store'
// @ts-ignore plain JS
import { parseMultipleNodes, parseNode } from '../../lib/protocols/index.js'
// @ts-ignore plain JS
import { toClashMeta } from '../../lib/converters/clash.js'
// @ts-ignore plain JS
import { toSingbox } from '../../lib/converters/singbox.js'
// @ts-ignore plain JS
import { pingNodeHost } from '../../lib/scanner/scannerEngine.js'
// @ts-ignore plain JS
import { findBestCloudflarePort } from '../../lib/optimizer/optimizerEngine.js'
// @ts-ignore plain JS
import { fetchSubscriptionSmart } from '../../lib/optimizer/araEngine.js'
// @ts-ignore plain JS
import { getWorkerUrl } from '../../lib/workerApi.js'
import CleanIpMatrix from './CleanIpMatrix'
import FragmentLab from './FragmentLab'
import ProxyInjector, { type FrontProxy } from './ProxyInjector'
import QrCodeModal from '../common/QrCodeModal'

interface OperatorPreset { name: string; ips: string[] }

export default function QuickOptimizer({ initialCleanIp, initialNodes }: { initialCleanIp?: string; initialNodes?: string }) {
  const {
    cleanIp, setCleanIp,
    cleanPort, setCleanPort,
    customSni, setCustomSni,
    prefix, setPrefix,
    inputNodes, setInputNodes,
    optimizedNodes,
    fragmentEnabled, setFragmentEnabled,
    fpValue, setFpValue,
    csValue, setCsValue,
    fmValue, setFmValue,
    arasMode, setArasMode,
    optimizedRaw,
    optimizedBase64,
    lastErrors,
    optimizeAll,
  } = useOptimizer()
  const store = useMiSubStore()

  const [operatorPresets, setOperatorPresets] = useState<Record<string, OperatorPreset>>({})
  const [activeFormat, setActiveFormat] = useState<'raw' | 'custom'>('raw')
  const [customFormattedText, setCustomFormattedText] = useState('')
  const [pingResults, setPingResults] = useState<Record<string, number | null>>({})
  const [testingPings, setTestingPings] = useState(false)
  const [testingPorts, setTestingPorts] = useState(false)
  const [portTestMsg, setPortTestMsg] = useState('')
  const [portTestOk, setPortTestOk] = useState(true)
  const [advOpen, setAdvOpen] = useState(false)
  const [subUrlInput, setSubUrlInput] = useState('')
  const [fetchingSub, setFetchingSub] = useState(false)
  const [fetchSubMsg, setFetchSubMsg] = useState('')
  const [fetchSubOk, setFetchSubOk] = useState(true)
  const [frontProxy, setFrontProxy] = useState<FrontProxy | null>(null)

  const [qrOpen, setQrOpen] = useState(false)
  const [qrTitle, setQrTitle] = useState('')
  const [qrContent, setQrContent] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/misub-data/operator-presets.json')
        setOperatorPresets(await res.json())
      } catch { /* keep empty */ }
    })()
  }, [])

  useEffect(() => {
    if (initialCleanIp) setCleanIp(initialCleanIp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCleanIp])

  useEffect(() => {
    if (initialNodes) setInputNodes(initialNodes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes])

  const handleMatrixSelect = (ip: string, key: string) => {
    setCleanIp(ip)
    setPrefix(`[${operatorPresets[key]?.name.split(' ')[0] || 'CF'}]`)
  }

  const executeOptimization = () => {
    setActiveFormat('raw')
    setCustomFormattedText('')
    optimizeAll()
  }

  const currentOutputDisplay = activeFormat === 'custom' ? customFormattedText : optimizedRaw

  const testSinglePing = async (uri: string) => {
    const node = parseNode(uri)
    if (!node) return
    setPingResults((prev) => ({ ...prev, [uri]: null }))
    const res = await pingNodeHost(node)
    setPingResults((prev) => ({ ...prev, [uri]: res.latency }))
  }

  const testAllOptimizedPings = async () => {
    setTestingPings(true)
    for (const uri of optimizedNodes.slice(0, 20)) {
      await testSinglePing(uri)
    }
    setTestingPings(false)
  }

  const copyRaw = async () => {
    setActiveFormat('raw')
    await navigator.clipboard.writeText(optimizedRaw)
    alert('کانفیگ‌های بهینه‌شده کپی شدند!')
  }

  const copyBase64 = async () => {
    setActiveFormat('custom')
    setCustomFormattedText(optimizedBase64)
    await navigator.clipboard.writeText(optimizedBase64)
    alert('سابسکریپشن Base64 کپی شد!')
  }

  const copyJson = async () => {
    setActiveFormat('custom')
    const json = JSON.stringify(optimizedNodes, null, 2)
    setCustomFormattedText(json)
    await navigator.clipboard.writeText(json)
    alert('خروجی JSON (سازگار با v2rayN/iOS) کپی شد!')
  }

  const handleFetchSub = async () => {
    if (!subUrlInput.trim()) return
    setFetchingSub(true)
    setFetchSubMsg('')
    try {
      const worker = getWorkerUrl()
      const { lines, via } = await fetchSubscriptionSmart(subUrlInput.trim(), worker)
      setInputNodes((inputNodes.trim() ? inputNodes.trim() + '\n' : '') + lines.join('\n'))
      setFetchSubOk(true)
      const viaLabel = via === 'worker' ? 'Cloudflare Worker شما' : via === 'direct' ? 'اتصال مستقیم' : `پراکسی عمومی (${via})`
      setFetchSubMsg(`✅ ${lines.length} کانفیگ دریافت شد (از طریق ${viaLabel})`)
    } catch (e) {
      setFetchSubOk(false)
      setFetchSubMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFetchingSub(false)
    }
  }

  const exportClashYaml = async () => {
    setActiveFormat('custom')
    const nodes = parseMultipleNodes(optimizedRaw)
    const clashFrontProxy = frontProxy ? {
      name: frontProxy.name,
      type: frontProxy.type,
      server: frontProxy.server,
      port: frontProxy.port,
      username: frontProxy.username,
      password: frontProxy.password,
    } : null
    const yaml = (toClashMeta as unknown as (nodes: unknown, groupName: string, exitProxy: unknown) => string)(nodes, 'PROXIES', clashFrontProxy)
    setCustomFormattedText(yaml)
    await navigator.clipboard.writeText(yaml)
    alert(clashFrontProxy ? 'کانفیگ Clash Meta با خروجی پروکسی کشور دلخواه (کل ترافیک از آن خارج می‌شود) کپی شد!' : 'کانفیگ Clash Meta (YAML) کپی شد!')
  }

  const exportSingboxJson = async () => {
    setActiveFormat('custom')
    const nodes = parseMultipleNodes(optimizedRaw)
    const sbFrontProxy = frontProxy ? {
      tag: frontProxy.tag,
      type: frontProxy.sbType,
      server: frontProxy.server,
      port: frontProxy.port,
      username: frontProxy.username,
      password: frontProxy.password,
      socksVersion: frontProxy.socksVersion,
    } : null
    const json = (toSingbox as unknown as (nodes: unknown, exitProxy: unknown) => string)(nodes, sbFrontProxy)
    setCustomFormattedText(json)
    await navigator.clipboard.writeText(json)
    alert(sbFrontProxy ? 'کانفیگ Sing-box با خروجی پروکسی کشور دلخواه (کل ترافیک از آن خارج می‌شود) کپی شد!' : 'کانفیگ Sing-box (JSON) کپی شد!')
  }

  const handleCopySingle = async (uri: string) => {
    await navigator.clipboard.writeText(uri)
    alert('کانفیگ کپی شد!')
  }

  const handleOpenQr = (uri: string) => {
    setQrTitle('بارکد QR اتصال بهینه‌شده')
    setQrContent(uri)
    setQrOpen(true)
  }

  const generateWorkerSubLink = () => {
    const worker = localStorage.getItem('cf_hub_worker_url') || ''
    if (!worker) {
      alert('لطفاً ابتدا در تب تنظیمات، آدرس Cloudflare Worker را وارد نمایید.')
      return
    }
    const subLink = `${worker}/sub?ip=${encodeURIComponent(cleanIp)}&port=${cleanPort}&sni=${encodeURIComponent(customSni)}`
    navigator.clipboard.writeText(subLink)
    alert('لینک سابسکریپشن مستقیم کپی شد:\n' + subLink)
  }

  const handleFindBestPort = async () => {
    if (!cleanIp.trim()) return
    setTestingPorts(true)
    setPortTestMsg('')
    try {
      const tls = !cleanPort || ['443', '8443', '2053', '2083', '2087', '2096'].includes(String(cleanPort))
      const data = await findBestCloudflarePort(cleanIp.trim(), { tls })
      if (data.best) {
        setCleanPort(String(data.best.port))
        setPortTestOk(true)
        setPortTestMsg(`✅ سریع‌ترین پورت واقعی: ${data.best.port} (${data.best.latency} ms) — از میان ${data.results.length} پورت تست‌شده`)
      } else {
        setPortTestOk(false)
        setPortTestMsg('❌ هیچ‌کدام از پورت‌های استاندارد کلودفلر روی این آی‌پی پاسخ ندادند.')
      }
    } catch (e) {
      setPortTestOk(false)
      setPortTestMsg(`❌ خطا: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestingPorts(false)
    }
  }

  const getPingClass = (lat: number | null) => {
    if (lat === null) return 'text-red font-bold'
    if (lat < 140) return 'text-green font-bold'
    if (lat < 250) return 'text-yellow'
    return 'text-red'
  }

  const clearAll = () => {
    setInputNodes('')
    store.setActiveNodes([])
    store.setOptimizeErrors([])
    setCustomFormattedText('')
    setPingResults({})
  }

  const visibleNodes = useMemo(() => optimizedNodes.slice(0, 15), [optimizedNodes])

  return (
    <div className="optimizer-suite">
      <div className="card-header">
        <h3>⚡ بهینه‌ساز جامع کانکشن کلودفلر (CF-Optimizer Master Hub)</h3>
        <p className="desc">مرکز اصلی برنامه: تزریق دسته‌ای آی‌پی و پورت تمیز، پکت‌های فرگمنت ضد DPI، تست پینگ زنده و صدور خروجی چندگانه</p>
      </div>

      <CleanIpMatrix presets={operatorPresets} onSelectIp={handleMatrixSelect} />

      <div className="card">
        <div className="grid-3">
          <div className="form-group">
            <label>آی‌پی یا دامنه تمیز هدف (Clean IP / Domain):</label>
            <input value={cleanIp} onChange={(e) => setCleanIp(e.target.value)} placeholder="مثلاً: 104.16.1.1 یا cf.domain.com" className="input-box font-mono" />
          </div>

          <div className="form-group">
            <label>پورت اتصال کلودفلر (Port):</label>
            <select value={cleanPort} onChange={(e) => setCleanPort(e.target.value)} className="input-box font-mono">
              <option value="">پیش‌فرض کانفیگ</option>
              <optgroup label="پورت‌های TLS / HTTPS">
                <option value="443">443 (استاندارد)</option>
                <option value="8443">8443</option>
                <option value="2053">2053</option>
                <option value="2083">2083</option>
                <option value="2087">2087</option>
                <option value="2096">2096</option>
              </optgroup>
              <optgroup label="پورت‌های Non-TLS / HTTP">
                <option value="80">80 (استاندارد)</option>
                <option value="8080">8080</option>
                <option value="8880">8880</option>
                <option value="2052">2052</option>
                <option value="2082">2082</option>
                <option value="2086">2086</option>
                <option value="2095">2095</option>
              </optgroup>
            </select>
            <button onClick={handleFindBestPort} disabled={!cleanIp.trim() || testingPorts} className="btn small secondary port-test-btn">
              {testingPorts && <span className="spinner"></span>}
              {testingPorts ? 'در حال تست واقعی پورت‌ها...' : '🎯 یافتن سریع‌ترین پورت واقعی'}
            </button>
            {portTestMsg && <p className={`port-test-msg ${portTestOk ? 'text-green' : 'text-red'}`}>{portTestMsg}</p>}
          </div>

          <div className="form-group">
            <label>SNI / Host سفارشی (اختیاری):</label>
            <input value={customSni} onChange={(e) => setCustomSni(e.target.value)} placeholder="مثلاً: speed.cloudflare.com" className="input-box font-mono" />
          </div>
        </div>

        <div className="fragment-wrapper">
          <label className="toggle-wrap">
            <input type="checkbox" checked={fragmentEnabled} onChange={(e) => setFragmentEnabled(e.target.checked)} />
            <span>🧪 فعال‌سازی آزمایشگاه فرگمنت واقعی (FinalMask JSON — سازگار با v2rayNG/PattNG)</span>
          </label>
          {fragmentEnabled && <FragmentLab fm={fmValue} onChangeFm={setFmValue} />}
        </div>

        <div className="ara-controls">
          <label className="toggle-wrap aras">
            <input type="checkbox" checked={arasMode} onChange={(e) => setArasMode(e.target.checked)} />
            <span>⚡ حالت Aras (پروفایل سبک واقعی برای اینستاگرام و سرویس‌های حساس به تاخیر)</span>
          </label>

          <button onClick={() => setAdvOpen(!advOpen)} className="btn small secondary adv-toggle-btn">
            {advOpen ? '▲ بستن تنظیمات پیشرفته (fp / cs)' : '▼ تنظیمات پیشرفته واقعی (Fingerprint / Cipher Suites)'}
          </button>
          {advOpen && (
            <div className={`adv-panel ${arasMode ? 'disabled' : ''}`}>
              <div className="form-group">
                <label>اثر انگشت TLS (Fingerprint - fp):</label>
                <select value={fpValue} onChange={(e) => setFpValue(e.target.value)} disabled={arasMode} className="input-box font-mono">
                  <option value="unsafe">unsafe (پیش‌فرض واقعی)</option>
                  <option value="chrome">chrome</option>
                  <option value="firefox">firefox</option>
                  <option value="safari">safari</option>
                  <option value="edge">edge</option>
                  <option value="random">random</option>
                </select>
              </div>
              <div className="form-group">
                <label>مجموعه رمزنگاری سفارشی (Cipher Suites - cs):</label>
                <textarea value={csValue} onChange={(e) => setCsValue(e.target.value)} disabled={arasMode} rows={2} className="textarea-box font-mono" placeholder="خالی = مقدار پیش‌فرض واقعی cf-optimizor" />
              </div>
            </div>
          )}
          {arasMode && <p className="aras-hint text-yellow">حالت Aras فعال است: از fp=chrome و مجموعه رمزنگاری سبک استفاده می‌شود؛ فیلدهای بالا غیرفعال هستند.</p>}
        </div>

        <ProxyInjector onChangeFrontProxy={setFrontProxy} />

        <div className="form-group">
          <label>یا لینک سابسکریپشن را مستقیم بچسبانید (دریافت واقعی با زنجیره پراکسی):</label>
          <div className="sub-url-row">
            <input value={subUrlInput} onChange={(e) => setSubUrlInput(e.target.value)} placeholder="https://example.com/sub/xxxx" className="input-box font-mono" />
            <button onClick={handleFetchSub} disabled={!subUrlInput.trim() || fetchingSub} className="btn small primary">
              {fetchingSub && <span className="spinner"></span>}
              {fetchingSub ? 'در حال دریافت...' : '📥 دریافت'}
            </button>
          </div>
          {fetchSubMsg && <p className={`port-test-msg ${fetchSubOk ? 'text-green' : 'text-red'}`}>{fetchSubMsg}</p>}
        </div>

        <div className="form-group">
          <label>پیشوند نام کانفیگ‌ها (Node Tag Prefix):</label>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="[CF-Clean]" className="input-box" />
        </div>

        <div className="form-group">
          <label>کانفیگ‌های ورودی (VLESS / VMess / Trojan / SS / Hysteria2 / TUIC / Clash / Singbox):</label>
          <textarea
            value={inputNodes}
            onChange={(e) => setInputNodes(e.target.value)}
            rows={5}
            className="textarea-box font-mono"
            placeholder="کانفیگ‌ها یا لینک سابسکریپشن را اینجا وارد کنید یا از تب سابسکریپشن بفرستید..."
          />
        </div>

        <div className="btn-action-row">
          <button onClick={executeOptimization} disabled={!inputNodes.trim()} className="btn success">
            ⚡ اعمال بهینه‌سازی و بازتولید کانفیگ‌ها
          </button>
          <button onClick={testAllOptimizedPings} disabled={!optimizedNodes.length || testingPings} className="btn primary">
            {testingPings && <span className="spinner"></span>}
            {testingPings ? 'در حال تست پینگ...' : '📡 تست پینگ زنده تمام نودها'}
          </button>
          <button onClick={clearAll} className="btn secondary">پاکسازی</button>
        </div>
      </div>

      {optimizedNodes.length > 0 && (
        <div className="output-card card">
          <div className="output-top">
            <h4>🎉 نتایج بهینه‌شده ({optimizedNodes.length} نود آماده):</h4>
            <div className="output-btns">
              <button onClick={copyRaw} className="btn small primary">کپی متن خام</button>
              <button onClick={copyBase64} className="btn small secondary">کپی Base64</button>
              <button onClick={copyJson} className="btn small secondary">خروجی JSON (iOS/Windows)</button>
              <button onClick={exportClashYaml} className="btn small secondary">Clash Meta (YAML)</button>
              <button onClick={exportSingboxJson} className="btn small secondary">Sing-box (JSON)</button>
              <button onClick={generateWorkerSubLink} className="btn small success">🔗 تولید لینک ساب Worker</button>
            </div>
          </div>

          {lastErrors.length > 0 && (
            <p className="parse-errors text-red">
              ⚠️ {lastErrors.length} خط بهینه‌سازی نشد (پروتکل/فرمت نامعتبر) — بقیه خطوط با موفقیت پردازش شدند.
            </p>
          )}

          <textarea value={currentOutputDisplay} rows={6} readOnly className="textarea-box font-mono output-area" />

          <div className="nodes-list-preview">
            {visibleNodes.map((uri, idx) => (
              <div key={idx} className="node-card-item card">
                <div className="node-info font-mono">
                  <span className="idx">#{idx + 1}</span>
                  <span className="uri-text" title={uri}>{uri}</span>
                </div>
                <div className="node-meta-row">
                  {pingResults[uri] !== undefined && (
                    <span className={`ping-badge ${getPingClass(pingResults[uri])}`}>
                      {pingResults[uri] !== null ? `${pingResults[uri]} ms` : 'Timeout'}
                    </span>
                  )}
                  <button onClick={() => testSinglePing(uri)} className="btn small secondary">تست پینگ</button>
                  <button onClick={() => handleOpenQr(uri)} className="btn small secondary">QR Code</button>
                  <button onClick={() => handleCopySingle(uri)} className="btn small primary">کپی</button>
                </div>
              </div>
            ))}
            {optimizedNodes.length > 15 && (
              <p className="more-hint text-muted">و {optimizedNodes.length - 15} نود دیگر در کادر متنی بالا موجود است...</p>
            )}
          </div>
        </div>
      )}

      <QrCodeModal isOpen={qrOpen} title={qrTitle} content={qrContent} onClose={() => setQrOpen(false)} />
    </div>
  )
}
