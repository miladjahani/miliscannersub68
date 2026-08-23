# جایگزینی Supabase با Cloudflare Edge API

## تغییرات انجام‌شده

### ۱. حذف وابستگی به Supabase
- تمام توابع Edge در `supabase/functions/` حذف شدند
- دیتابیس PostgreSQL Supabase با **Cloudflare D1** جایگزین شد
- احراز هویت Supabase Auth با سیستم ساده‌تر مبتنی بر توکن Cloudflare جایگزین شد

### ۲. ورکر API جدید
یک ورکر Cloudflare به نام `mili-api` ایجاد شد که تمام عملکردهای زیر را ارائه می‌دهد:

#### مسیرهای API:
```
GET    /api/tokens              # دریافت لیست توکن‌های Cloudflare
POST   /api/tokens              # ساخت توکن جدید
DELETE /api/tokens/:id          # حذف توکن

GET    /api/deployments         # دریافت لیست استقرارها
POST   /api/deployments         # ایجاد رکورد استقرار
GET    /api/deployments/:id     # دریافت جزئیات استقرار
PUT    /api/deployments/:id     # به‌روزرسانی وضعیت استقرار

GET    /api/activity-logs       # دریافت لاگ فعالیت‌ها

POST   /api/deploy              # شروع فرآیند استقرار (background)
GET    /health                  # بررسی سلامت سرویس
```

### ۳. جداول D1
پنج جدول اصلی در D1 ایجاد می‌شود:
- `cf_tokens` — توکن‌های API کلودفلر
- `deployments` — رکوردهای استقرار ورکر
- `bot_config` — پیکربندی ربات تلگرام
- `bot_users` — کاربران ربات
- `activity_logs` — لاگ فعالیت‌ها

### ۴. انواع ورکرهای قابل استقرار
همان ۵ نوع ورکر قبلی پشتیبانی می‌شود، هر کدام با سورس و binding مخصوص:

| نوع | سورس | Binding | توضیح |
|-----|------|---------|-------|
| `edgetunnel` | cmliu/edgetunnel | KV | ورکر کامل VLESS/Trojan/SS |
| `edgetunnel_kv` | cmliu/edgetunnel | KV | حالت پیکربندی از KV |
| `custom` | public/repo/worker-source.js | KV (C) | سورس اختصاصی Mili |
| `misub_d1` | public/repo/misub-proxy-source.js | D1 (DB) | پنل چندکاربره MiSub |
| `misub_scanner` | public/repo/misub-scanner-worker.js | none | موتور اسکنر IP |

## راه‌اندازی

### مرحله ۱: ساخت D1 Database
```bash
npx wrangler d1 create mili-config-db
# خروجی را کپی کنید (database_id)
```

### مرحله ۲: به‌روزرسانی wrangler.toml
فایل `workers/api/wrangler.toml` را باز کرده و `database_id` را وارد کنید:
```toml
[[d1_databases]]
binding = "DB"
database_name = "mili-config-db"
database_id = "<database_id_از_مرحله_قبل>"
```

### مرحله ۳: ساخت KV Namespace (اختیاری)
```bash
npx wrangler kv:namespace create KV
# خروجی را کپی کنید
```

سپس در `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "KV"
id = "<id_از_مرحله_قبل>"
```

### مرحله ۴: استقرار API Worker
```bash
cd /workspace
npx wrangler deploy -c workers/api/wrangler.toml
```

### مرحله ۵: به‌روزرسانی فرانت‌اند
در فایل `.env` یا تنظیمات پروژه، آدرس API Worker را وارد کنید:
```env
VITE_API_URL=https://mili-api.miladjahani.workers.dev
```

سپس در کامپوننت‌های React، به جای `supabase` از API جدید استفاده کنید.

## مهاجرت از Supabase

### فایل‌هایی که باید به‌روزرسانی شوند:
1. `src/lib/supabase.ts` → حذف یا جایگزینی با client جدید
2. `src/pages/*.tsx` → تغییر فراخوانی‌های supabase به fetch('/api/...')
3. `.env` → حذف متغیرهای SUPABASE و اضافه کردن VITE_API_URL

### نمونه کد برای جایگزینی:

**قبلاً (Supabase):**
```typescript
const { data } = await supabase.from('cf_tokens').select('*')
```

**اکنون (Edge API):**
```typescript
const res = await fetch(`${API_URL}/api/tokens`)
const { data } = await res.json()
```

## مزایای معماری جدید

✅ **سرعت بیشتر** — اجرای مستقیم در edge کلودفلر بدون تاخیر شبکه به Supabase  
✅ **هزینه کمتر** — حذف هزینه‌های Supabase Pro  
✅ **سادگی** — یکپارچگی کامل با اکوسیستم Cloudflare  
✅ **مقیاس‌پذیری** — D1 و KV به صورت خودکار مقیاس می‌گیرند  
✅ **عدم وابستگی** — همه چیز روی Cloudflare متمرکز است  

## نکات مهم

- ورکر API باید **قبل** از فرانت‌اند مستقر شود
- برای احراز هویت، می‌توانید از هدر `Authorization: Bearer <token>` استفاده کنید
- لاگ‌های استقرار به صورت real-time در D1 ذخیره می‌شوند
- برای پشتیبانی از چند کاربر، فیلد `user_id` را به جداول اضافه کنید
