import { useEffect, useState } from 'react'
// @ts-ignore plain JS
import { getWorkerUrl, setWorkerUrl } from '../../lib/workerApi.js'
// @ts-ignore plain JS
import { db } from '../../lib/db.js'

const WORKER_SCRIPT_CODE = `/**
 * Cloudflare Worker Enterprise Backend & Universal CORS Proxy
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Requested-With, Cache-Control, Accept',
  'Access-Control-Expose-Headers': 'Subscription-Userinfo, Content-Disposition, Content-Length',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/api') {
        return new Response(JSON.stringify({ status: 'online', service: 'MiSub & CF Universal Proxy' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Fetch Subscription without CORS
      if (pathname === '/api/proxy-fetch' || pathname === '/api/fetch-sub') {
        let targetUrl = url.searchParams.get('url');
        let customUa = url.searchParams.get('ua') || request.headers.get('User-Agent') || 'v2rayNG/1.8.12';

        if (!targetUrl && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          targetUrl = body.url;
          if (body.userAgent) customUa = body.userAgent;
        }

        if (!targetUrl) {
          return new Response(JSON.stringify({ success: false, error: 'url required' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }

        const subRes = await fetch(targetUrl, { headers: { 'User-Agent': customUa } });
        const rawData = await subRes.text();
        const userinfo = subRes.headers.get('Subscription-Userinfo') || '';

        if (request.method === 'GET') {
          return new Response(rawData, {
            status: subRes.status,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'text/plain; charset=utf-8',
              'Subscription-Userinfo': userinfo
            }
          });
        }

        return new Response(JSON.stringify({ success: true, userinfo, data: rawData }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Latency Ping Probe
      if (pathname === '/api/ping') {
        return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
    }
  }
};`

export default function WorkerProxySettings() {
  const [workerUrlInput, setWorkerUrlInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    setWorkerUrlInput(getWorkerUrl())
  }, [])

  const save = () => {
    setWorkerUrl(workerUrlInput)
    alert('آدرس ورکر ذخیره شد.')
  }

  const downloadBackup = () => {
    const jsonStr = db.exportAllBackup()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `misub_cf_database_backup_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const success = db.importAllBackup(e.target?.result as string)
      if (success) {
        alert('پایگاه داده با موفقیت بازیابی شد. صفحه مجدداً بارگذاری می‌شود.')
        window.location.reload()
      } else {
        alert('خطا در خواندن فایل بکاپ.')
      }
    }
    reader.readAsText(file)
  }

  const resetDatabase = () => {
    if (confirm('آیا از پاکسازی کامل حافظه و دیتابیس اطمینان دارید؟')) {
      db.clearAll()
      alert('پایگاه داده پاکسازی شد. صفحه بازنشانی می‌شود.')
      window.location.reload()
    }
  }

  const testConnection = async () => {
    if (!workerUrlInput.trim()) {
      setTestStatus({ success: false, message: 'لطفاً ابتدا آدرس ورکر را وارد نمایید.' })
      return
    }
    setTesting(true)
    setTestStatus(null)
    try {
      const res = await fetch(`${workerUrlInput.trim().replace(/\/$/, '')}/api/ping`)
      const data = await res.json()
      if (data.success) {
        setTestStatus({ success: true, message: '✅ ارتباط با Cloudflare Worker برقرار است! تمام ابعاد CORS حل شده است.' })
      } else {
        setTestStatus({ success: false, message: 'پاسخ نامعتبر از ورکر دریافت شد.' })
      }
    } catch (err) {
      setTestStatus({ success: false, message: `❌ خطا در برقراری ارتباط: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setTesting(false)
    }
  }

  const copyWorkerCode = async () => {
    await navigator.clipboard.writeText(WORKER_SCRIPT_CODE)
    alert('اسکریپت Cloudflare Worker در کلیپ‌بورد کپی شد!')
  }

  return (
    <div className="settings-suite">
      <div className="card-header">
        <h3>🛠️ پایگاه داده و تنظیمات سرورلس (Database &amp; Worker Settings)</h3>
        <p className="desc">مدیریت حافظه محلی و پایگاه داده، تهیه نسخه پشتیبان JSON، تنظیمات پروکسی Cloudflare Worker جهت رفع قطعی CORS</p>
      </div>

      <div className="card db-card">
        <div className="db-header">
          <h4>💾 مدیریت پایگاه داده و حافظه دائمی (Persistent Database)</h4>
          <span className="badge ok">حافظه فعال</span>
        </div>
        <p className="desc">تمام تغییرات، آی‌پی‌های اسکن‌شده، کانفیگ‌های بهینه‌شده و تنظیمات شما به صورت خودکار در حافظه دستگاه ذخیره می‌شوند و با تغییر تب یا رفرش صفحه پاک نخواهند شد.</p>

        <div className="db-actions">
          <button onClick={downloadBackup} className="btn small success">📥 دانلود بکاپ کامل پایگاه داده (JSON)</button>
          <label className="btn small secondary import-label">
            📤 بازیابی بکاپ از فایل JSON
            <input type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
          </label>
          <button onClick={resetDatabase} className="btn small danger">🗑️ ریست و پاکسازی دیتابیس</button>
        </div>
      </div>

      <div className="card">
        <div className="form-group">
          <label>آدرس Cloudflare Worker مستقر شده شما:</label>
          <input
            value={workerUrlInput}
            onChange={(e) => setWorkerUrlInput(e.target.value)}
            placeholder="https://your-worker-name.workers.dev"
            className="input-box font-mono"
          />
          <span className="hint">کدهای کامل اسکریپت ورکر در کادر زیر قرار دارد. کافیست آن را در داشبورد کلودفلر پیست و دیپلوی کنید. یا — ساده‌تر — از تب «استقرار جدید» همین برنامه، منبع «MiSub — موتور اسکنر/بهینه‌ساز» را با یک کلیک مستقر کنید و آدرسش را اینجا وارد کنید.</span>
        </div>

        <div className="action-row">
          <button onClick={save} className="btn primary">ذخیره آدرس Worker</button>
          <button onClick={testConnection} disabled={testing} className="btn secondary">
            {testing && <span className="spinner"></span>}
            {testing ? 'در حال تست ارتباط...' : 'تست پینگ و اتصال به Worker'}
          </button>
        </div>

        {testStatus && (
          <div className={`status-box ${testStatus.success ? 'ok' : 'err'}`}>{testStatus.message}</div>
        )}
      </div>

      <div className="card worker-code-card">
        <div className="code-header">
          <h4>📄 اسکریپت آماده استقرار Cloudflare Worker (جهت کپی مستقیم):</h4>
          <button onClick={copyWorkerCode} className="btn small success">📋 کپی کل کد اسکریپت Worker</button>
        </div>
        <textarea value={WORKER_SCRIPT_CODE} rows={10} readOnly className="textarea-box font-mono code-box" />
      </div>
    </div>
  )
}
