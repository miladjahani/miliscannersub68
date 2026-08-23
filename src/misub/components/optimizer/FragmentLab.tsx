import { useMemo, useState } from 'react'
// @ts-ignore plain JS
import { FM_STR, ARAS_FM } from '../../lib/optimizer/araEngine.js'

const PRESETS = [
  { key: 'default', label: 'پیش‌فرض واقعی (دو مرحله‌ای)', value: FM_STR },
  { key: 'aras', label: 'Aras (سبک — Instagram)', value: ARAS_FM },
  {
    key: 'aggressive',
    label: 'تهاجمی (بایت‌های ریزتر)',
    value: '{"tcp":[{"type":"fragment","settings":{"packets":"tlshello","lengths":["1-1"],"delays":["0"],"maxSplit":"0"}},{"type":"fragment","settings":{"packets":"1-3","lengths":["1-1"],"delays":["1"],"maxSplit":"500"}}]}',
  },
]

export default function FragmentLab({ fm, onChangeFm }: { fm: string; onChangeFm: (v: string) => void }) {
  const [activePreset, setActivePreset] = useState('default')

  const isValid = useMemo(() => {
    const v = (fm || '').trim()
    if (!v) return true
    try { JSON.parse(v); return true } catch { return false }
  }, [fm])

  const applyPreset = (key: string) => {
    const preset = PRESETS.find((p) => p.key === key)
    if (!preset) return
    setActivePreset(key)
    onChangeFm(preset.value)
  }

  const handleInput = (val: string) => {
    setActivePreset('custom')
    onChangeFm(val)
  }

  return (
    <div className="fragment-lab card">
      <div className="lab-header">
        <h4>🧪 آزمایشگاه FinalMask واقعی (Real TLS Fragment — DPI Bypass)</h4>
        <p className="desc">این پارامتر <code>fm</code> دقیقاً همان JSON واقعی FinalMask است که کلاینت‌های v2rayNG/PattNG هنگام اتصال می‌خوانند — نه یک فرمت ساختگی.</p>
      </div>

      <div className="preset-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => applyPreset(preset.key)}
            className={`btn small ${activePreset === preset.key ? 'primary' : 'secondary'}`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="form-group">
        <label>JSON خام FinalMask (قابل ویرایش دستی):</label>
        <textarea
          value={fm}
          onChange={(e) => handleInput(e.target.value)}
          rows={4}
          className="textarea-box font-mono fm-editor"
          spellCheck={false}
        />
        <p className={`validity ${isValid ? 'text-green' : 'text-red'}`}>
          {isValid ? '✓ JSON معتبر — آماده استفاده در کانفیگ' : '✗ JSON نامعتبر — اصلاح کنید یا از پریست استفاده کنید'}
        </p>
      </div>
    </div>
  )
}
