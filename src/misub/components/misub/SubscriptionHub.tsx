import { useState } from 'react'
import { useSubscriptions } from '../../hooks/useSubscriptions'
// @ts-ignore plain JS
import { pingNodeHost } from '../../lib/scanner/scannerEngine.js'
import NodeDoctorPanel from './NodeDoctorPanel'
import ClientConverterWorkspace from './ClientConverterWorkspace'

interface ParsedNode {
  id: string
  protocol: string
  name: string
  address: string
  port: number | string
  sni?: string
  type?: string
  security?: string
  raw: string
  [key: string]: unknown
}

interface NodeLog { time: string; message: string; type: 'info' | 'success' | 'error' }

export default function SubscriptionHub({ onSendToOptimizer, onSelectNodeToOptimize }: {
  onSendToOptimizer: (raws: string) => void
  onSelectNodeToOptimize: (raw: string) => void
}) {
  const {
    subUrl, setSubUrl,
    rawInput, setRawInput,
    loading,
    fetchStatus,
    searchQuery, setSearchQuery,
    selectedProto, setSelectedProto,
    parsedNodes,
    protoCounts,
    filteredNodes,
    fetchRemote,
    removeDuplicates,
  } = useSubscriptions()

  const [showDoctor, setShowDoctor] = useState(false)
  const [showConverter, setShowConverter] = useState(false)
  const [nodePings, setNodePings] = useState<Record<string, number | null>>({})
  const [testingPings, setTestingPings] = useState(false)
  const [nodeLogs, setNodeLogs] = useState<NodeLog[]>([])

  const nowStr = () => new Date().toTimeString().split(' ')[0]

  const handleFetch = async () => {
    const worker = localStorage.getItem('cf_hub_worker_url') || ''
    setNodeLogs((prev) => [...prev, { time: nowStr(), message: 'در حال دریافت سابسکریپشن...', type: 'info' }])
    await fetchRemote(worker)
    // parsedNodes updates asynchronously off subRawInput via an effect, so
    // we report the count on the next tick once it has caught up.
    setTimeout(() => {
      setNodeLogs((prev) => [...prev, { time: nowStr(), message: `سابسکریپشن دریافت شد. ${parsedNodes.length} نود شناسایی شدند.`, type: 'success' }])
    }, 0)
  }

  const testSingleNodePing = async (node: ParsedNode) => {
    setNodePings((prev) => ({ ...prev, [node.id]: null }))
    setNodeLogs((prev) => [...prev, { time: nowStr(), message: `تست پینگ نود: ${node.name} (${node.address}:${node.port})...`, type: 'info' }])
    const res = await pingNodeHost(node)
    setNodePings((prev) => ({ ...prev, [node.id]: res.latency }))
    setNodeLogs((prev) => [...prev, res.status === 'ok'
      ? { time: nowStr(), message: `✅ پاسخ از ${node.name}: تاخیر ${res.latency} ms`, type: 'success' }
      : { time: nowStr(), message: `❌ تایم‌اوت نود: ${node.name}`, type: 'error' }])
  }

  const testAllPings = async () => {
    setTestingPings(true)
    setNodeLogs((prev) => [...prev, { time: nowStr(), message: 'شروع تست پینگ دسته‌ای نودها...', type: 'info' }])
    for (const node of filteredNodes.slice(0, 30)) {
      await testSingleNodePing(node)
    }
    setTestingPings(false)
    setNodeLogs((prev) => [...prev, { time: nowStr(), message: 'تست پینگ تمام نودها پایان یافت.', type: 'success' }])
  }

  const getPingClass = (lat: number | null) => {
    if (lat === null) return 'text-red font-bold'
    if (lat < 140) return 'text-green font-bold'
    if (lat < 250) return 'text-yellow'
    return 'text-red'
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    alert('کانفیگ کپی شد!')
  }

  const sendAllToOptimizer = () => {
    const raws = filteredNodes.map((n: ParsedNode) => n.raw).join('\n')
    onSendToOptimizer(raws)
  }

  return (
    <div className="misub-hub-suite">
      <div className="card-header">
        <h3>📋 مرکز مدیریت سابسکریپشن MiSub (Universal Subscription Hub)</h3>
        <p className="desc">پشتیبانی از تمام فرمت‌های لینک ساب، رمزگشایی انواع پروتکل‌ها، فیلتر آنی، حذف تکراری و تست پینگ زنده</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>آدرس سابسکریپشن ریموت (Sub URL):</label>
          <div className="input-with-btn">
            <input value={subUrl} onChange={(e) => setSubUrl(e.target.value)} placeholder="https://example.com/sub/token..." className="input-box font-mono" />
            <button onClick={handleFetch} disabled={loading} className="btn primary">
              {loading && <span className="spinner"></span>}
              {loading ? 'در حال دریافت...' : 'دریافت سابسکریپشن'}
            </button>
          </div>
          {fetchStatus && <p className={`fetch-status ${fetchStatus.startsWith('❌') ? 'text-red' : 'text-green'}`}>{fetchStatus}</p>}
        </div>

        <div className="form-group">
          <label>یا وارد کردن مستقیم کانفیگ‌ها (Clash YAML / Sing-box JSON / Base64 / خط‌به‌خط):</label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={4}
            className="textarea-box font-mono"
            placeholder={'vless://...\nvmess://...\ntrojan://...\nss://...'}
          />
        </div>
      </div>

      {parsedNodes.length > 0 && (
        <div className="card toolbar-box">
          <div className="search-filter-row">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جستجو در نام، آدرس، پورت یا SNI..." className="input-box" />
            <div className="tools-btn-group">
              <button onClick={testAllPings} disabled={testingPings} className="btn small primary">
                {testingPings && <span className="spinner"></span>}
                {testingPings ? 'در حال تست پینگ...' : '📡 تست پینگ تمام نودها'}
              </button>
              <button onClick={removeDuplicates} className="btn small secondary">حذف تکراری‌ها</button>
              <button onClick={() => setShowDoctor(!showDoctor)} className="btn small secondary">{showDoctor ? 'بستن دکتر نود' : '🩺 دکتر نود'}</button>
              <button onClick={() => setShowConverter(!showConverter)} className="btn small secondary">{showConverter ? 'بستن مبدل' : '🔗 مبدل کلاینت'}</button>
              <button onClick={sendAllToOptimizer} className="btn small success">⚡ انتقال به بهینه‌ساز</button>
            </div>
          </div>

          <div className="protocol-chips">
            <button className={`chip ${selectedProto === 'all' ? 'active' : ''}`} onClick={() => setSelectedProto('all')}>
              همه ({parsedNodes.length})
            </button>
            {Object.entries(protoCounts).map(([proto, count]) => (
              <button key={proto} className={`chip ${selectedProto === proto ? 'active' : ''}`} onClick={() => setSelectedProto(proto)}>
                <span className={`badge ${proto}`}>{proto.toUpperCase()}</span>
                <span>({count as number})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {nodeLogs.length > 0 && (
        <div className="terminal-log-box card">
          <div className="terminal-header">
            <span className="terminal-title">📟 لاگ‌های زنده تست پینگ نودها (Live Node Ping Monitor)</span>
            <button onClick={() => setNodeLogs([])} className="btn small secondary">پاکسازی لاگ</button>
          </div>
          <div className="terminal-logs font-mono">
            {nodeLogs.slice(-25).map((log, idx) => (
              <div key={idx} className={`log-line ${log.type}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showDoctor && parsedNodes.length > 0 && <NodeDoctorPanel nodes={filteredNodes} />}
      {showConverter && parsedNodes.length > 0 && <ClientConverterWorkspace nodes={filteredNodes} />}

      {filteredNodes.length > 0 && (
        <div className="nodes-grid">
          {filteredNodes.map((node) => (
            <div key={node.id} className="node-item card">
              <div className="node-header">
                <span className={`badge ${node.protocol}`}>{node.protocol.toUpperCase()}</span>
                <span className="node-title" title={node.name}>{node.name}</span>
                {nodePings[node.id] !== undefined && (
                  <span className={`ping-pill ${getPingClass(nodePings[node.id])}`}>
                    {nodePings[node.id] !== null ? `${nodePings[node.id]} ms` : 'Timeout'}
                  </span>
                )}
              </div>

              <div className="node-meta font-mono">
                <div><span className="meta-label">آدرس:</span> {node.address}:{node.port}</div>
                {node.sni && <div><span className="meta-label">SNI:</span> {node.sni}</div>}
                <div><span className="meta-label">شبکه:</span> {String(node.type ?? '')} | {String(node.security ?? '')}</div>
              </div>

              <div className="node-actions">
                <button onClick={() => testSingleNodePing(node)} className="btn-text">تست پینگ</button>
                <button onClick={() => copyText(node.raw)} className="btn-text">کپی لینک</button>
                <button onClick={() => onSelectNodeToOptimize(node.raw)} className="btn-text highlight">بهینه‌سازی</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
