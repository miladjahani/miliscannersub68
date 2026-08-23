# 🚀 راه‌اندازی کامل با Cloudflare D1 (جایگزین Supabase)

## ✅ تغییرات انجام‌شده

### حذف Supabase
- ❌ دایرکتوری `supabase/` حذف شد
- ❌ Edge Functionهای Supabase حذف شدند
- ❌ متغیرهای محیطی Supabase از `.env` حذف خواهند شد

### اضافه کردن Cloudflare D1
- ✅ دایرکتوری `cloudflare-db/` ایجاد شد
- ✅ اسکیمای کامل SQLite برای D1
- ✅ اسکریپت خودکار راه‌اندازی (`setup.sh`)
- ✅ پیکربندی `wrangler.toml` با D1 و KV

---

## 📦 ساختار جدید پروژه

```
/workspace
├── cloudflare-db/          # دیتابیس Cloudflare D1
│   ├── schema.sql         # اسکیمای کامل جداول
│   ├── README.md          # مستندات D1
│   └── setup.sh           # اسکریپت راه‌اندازی خودکار
├── public/repo/           # سورس ورکرهای اختصاصی
│   ├── worker-source.js
│   ├── misub-proxy-source.js
│   └── misub-scanner-worker.js
├── wrangler.toml          # پیکربندی Cloudflare (D1 + KV)
└── ...
```

---

## 🔧 مراحل راه‌اندازی

### روش ۱: استفاده از اسکریپت خودکار (توصیه می‌شود)

```bash
# ورود به Cloudflare
wrangler login

# اجرای اسکریپت راه‌اندازی
cd /workspace
./cloudflare-db/setup.sh
```

این اسکریپت به صورت خودکار:
1. دیتابیس D1 می‌سازد
2. اسکیما را اعمال می‌کند
3. KV Namespace می‌سازد
4. `wrangler.toml` را به‌روزرسانی می‌کند

### روش ۲: راه‌اندازی دستی

#### ۱. ساخت دیتابیس D1
```bash
wrangler d1 create mili-config-pro-db
```
خروجی شامل `database_id` است - آن را یادداشت کنید.

#### ۲. اعمال اسکیما
```bash
wrangler d1 execute mili-config-pro-db --file=cloudflare-db/schema.sql
```

#### ۳. ساخت KV Namespace
```bash
wrangler kv namespace create MILI-KV
```
خروجی شامل `id` است - آن را یادداشت کنید.

#### ۴. به‌روزرسانی wrangler.toml
مقادیر زیر را در `wrangler.toml` جایگزین کنید:
- `YOUR_DATABASE_ID_HERE` → database_id از مرحله ۱
- `YOUR_KV_NAMESPACE_ID_HERE` → id از مرحله ۳
- `YOUR_CUSTOM_KV_ID_HERE` → می‌تواند همان id مرحله ۳ باشد

---

## 🗄️ جداول دیتابیس

| جدول | توضیح |
|------|-------|
| `worker_configs` | پیکربندی ۵ نوع ورکر قابل استقرار |
| `deployment_logs` | تاریخچه استقرارها با وضعیت و خطاها |
| `users` | کاربران پنل چندکاربره MiSub |
| `subscriptions` | اشتراک‌های کاربران |
| `ip_scans` | نتایج اسکن IP تمیز |

---

## 📊 داده‌های اولیه ورکرها

دیتابیس به صورت پیش‌فرض شامل ۵ پیکربندی ورکر است:

| worker_name | type | source | binding |
|-------------|------|--------|---------|
| `edgetunnel-main` | edgetunnel | GitHub cmliu | KV |
| `edgetunnel-kv` | edgetunnel_kv | GitHub cmliu | KV |
| `mili-custom` | custom | `/repo/worker-source.js` | KV (C) |
| `misub-panel` | misub_d1 | `/repo/misub-proxy-source.js` | D1 (DB) |
| `ip-scanner` | misub_scanner | `/repo/misub-scanner-worker.js` | None |

---

## 🔍 کوئری‌های نمونه

```bash
# مشاهده همه ورکرها
wrangler d1 execute mili-config-pro-db --command="SELECT * FROM worker_configs;"

# مشاهده آخرین استقرارها
wrangler d1 execute mili-config-pro-db --command="SELECT * FROM deployment_logs ORDER BY deployed_at DESC LIMIT 10;"

# افزودن کاربر ادمین
wrangler d1 execute mili-config-pro-db --command="INSERT INTO users (username, password_hash, role) VALUES ('admin', '\$2a\$10\$...', 'admin');"

# مشاهده IPهای اسکن‌شده معتبر
wrangler d1 execute mili-config-pro-db --command="SELECT ip_address, latency_ms, country_code FROM ip_scans WHERE is_valid=1 ORDER BY latency_ms ASC LIMIT 20;"
```

---

## 🚀 استقرار نهایی

```bash
# بیلد پروژه
npm run build

# استقرار روی Cloudflare Pages
wrangler deploy
```

---

## 🆚 مقایسه با Supabase

| ویژگی | Supabase | Cloudflare D1 |
|-------|----------|---------------|
| موقعیت | سرور مرکزی | Edge Cloudflare |
| تاخیر | ~50-200ms | ~1-10ms |
| هزینه | رایگان تا محدودیت | رایگان تا ۵M درخواست/ماه |
| وابستگی | سرویس خارجی | یکپارچه با Cloudflare |
| پروتکل | PostgreSQL | SQLite |
| بک‌آپ | خودکار | دستی با export |

---

## 📝 نکات مهم

1. **GitHub الزامی است**: ورکرهای اختصاصی از `public/repo/` بارگذاری می‌شوند که باید روی GitHub باشد.

2. **Edge Function حذف شد**: دیگر نیازی به Supabase Edge Function نیست. تمام منطق استقرار مستقیماً از Dashboard یا APIهای Cloudflare انجام می‌شود.

3. **متغیرهای محیطی**: فایل `.env` را پاکسازی کنید و متغیرهای Supabase را حذف کنید.

4. **بک‌آپ منظم**: از دستور `wrangler d1 export` برای بک‌آپ گرفتن استفاده کنید.

---

## 🆘 عیب‌یابی

### خطای "Database not found"
```bash
wrangler d1 info mili-config-pro-db
```
مطمئن شوید `database_id` در `wrangler.toml` صحیح است.

### خطای "KV namespace not found"
```bash
wrangler kv namespace list
```
مطمئن شوید `id` در `wrangler.toml` صحیح است.

### مشاهده لاگ‌های D1
```bash
wrangler d1 execute mili-config-pro-db --command="SELECT * FROM deployment_logs WHERE status='error' ORDER BY deployed_at DESC LIMIT 10;"
```

---

## 📚 منابع بیشتر

- [مستندات Cloudflare D1](https://developers.cloudflare.com/d1/)
- [مستندات KV](https://developers.cloudflare.com/kv/)
- [اسکریپت راه‌اندازی](./cloudflare-db/setup.sh)
- [اسکیمای دیتابیس](./cloudflare-db/schema.sql)
