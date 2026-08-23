import { useMemo } from 'react'
// @ts-ignore plain JS
import { diagnoseNodes } from '../../lib/operators/nodeDoctor.js'

interface NodeReport {
  nodeId: string
  nodeName: string
  protocol: string
  healthy: boolean
  issues: string[]
}

export default function NodeDoctorPanel({ nodes }: { nodes: unknown[] }) {
  const reports: NodeReport[] = useMemo(() => diagnoseNodes(nodes || []), [nodes])

  return (
    <div className="doctor-card card">
      <div className="doctor-header">
        <h4>🩺 دکتر نود و بررسی سلامت کانفیگ‌ها (Node Doctor)</h4>
        <p className="desc">تحلیل هوشمند و شناسایی خطاهای سینتکس، پورت‌های نامعتبر، UUIDهای ناقص و پروتکل‌های شکسته</p>
      </div>

      {reports.length > 0 ? (
        <div className="reports-list">
          {reports.map((r) => (
            <div key={r.nodeId} className={`report-item ${r.healthy ? 'healthy' : 'unhealthy'}`}>
              <div className="report-top">
                <span className={`badge ${r.protocol}`}>{r.protocol.toUpperCase()}</span>
                <span className="node-name">{r.nodeName}</span>
                <span className={`badge ${r.healthy ? 'ok' : 'error'}`}>{r.healthy ? 'سالم' : 'دارای خطا'}</span>
              </div>
              {r.issues.length > 0 && (
                <ul className="issue-list">
                  {r.issues.map((iss, i) => <li key={i} className="text-red">⚠️ {iss}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted text-center">هیچ نودی برای بررسی بارگذاری نشده است.</div>
      )}
    </div>
  )
}
