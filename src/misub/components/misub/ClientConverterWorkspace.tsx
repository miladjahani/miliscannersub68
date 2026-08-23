import { useState } from 'react'
// @ts-ignore plain JS
import { convertNodesToClient } from '../../lib/converters/index.js'

const FORMATS = [
  { key: 'clash', label: 'Clash Meta (YAML)' },
  { key: 'singbox', label: 'Sing-box (JSON)' },
  { key: 'quantumultx', label: 'Quantumult X' },
  { key: 'surge', label: 'Surge' },
  { key: 'loon', label: 'Loon' },
  { key: 'base64', label: 'V2Ray (Base64)' },
]

export default function ClientConverterWorkspace({ nodes }: { nodes: unknown[] }) {
  const [convertedText, setConvertedText] = useState('')
  const [currentFormat, setCurrentFormat] = useState('clash')

  const convert = (format: string) => {
    setCurrentFormat(format)
    setConvertedText(convertNodesToClient(nodes, format))
  }

  const copyConverted = async () => {
    await navigator.clipboard.writeText(convertedText)
    alert('کانفیگ کلاینت کپی شد!')
  }

  return (
    <div className="converter-card card">
      <div className="converter-header">
        <h4>🔗 مبدل فرمت سابسکریپشن به کلاینت‌ها (Client SubConverter)</h4>
        <p className="desc">تبدیل مستقیم نودها به فرمت کلاینت‌های محبوب</p>
      </div>

      <div className="format-buttons">
        {FORMATS.map((f) => (
          <button key={f.key} onClick={() => convert(f.key)} className="btn small secondary">{f.label}</button>
        ))}
      </div>

      {convertedText && (
        <div className="converted-output">
          <div className="converted-top">
            <span className="badge ok">{currentFormat.toUpperCase()}</span>
            <button onClick={copyConverted} className="btn small primary">کپی در کلیپ‌بورد</button>
          </div>
          <textarea value={convertedText} rows={6} readOnly className="textarea-box font-mono" />
        </div>
      )}
    </div>
  )
}
