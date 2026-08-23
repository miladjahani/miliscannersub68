interface OperatorPreset { name: string; ips: string[] }

export default function CleanIpMatrix({ presets, onSelectIp }: { presets: Record<string, OperatorPreset>; onSelectIp: (ip: string, key: string) => void }) {
  if (!presets || Object.keys(presets).length === 0) return null

  return (
    <div className="matrix-card card">
      <div className="matrix-header">
        <h4>🌐 ماتریس آی‌پی‌های تمیز اپراتورها</h4>
        <span className="desc">انتخاب سریع آی‌پی متناسب با اینترنت فعلی شما</span>
      </div>

      <div className="matrix-grid">
        {Object.entries(presets).map(([key, data]) => (
          <div
            key={key}
            className="matrix-item"
            onClick={() => data?.ips?.length && onSelectIp(data.ips[0], key)}
          >
            <span className="operator-title">{data?.name || key}</span>
            <span className="ip-preview font-mono">{data?.ips?.[0] || '---'}</span>
            <span className="count-badge">{data?.ips?.length || 0} آی‌پی ذخیره</span>
          </div>
        ))}
      </div>
    </div>
  )
}
