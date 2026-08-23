# Cloudflare D1 Database - جایگزین Supabase

این دایرکتوری شامل اسکیمای دیتابیس SQLite برای Cloudflare D1 است که جایگزین Supabase می‌شود.

## مزایای استفاده از D1 به جای Supabase:
- ✅ اجرا روی Edge Cloudflare (تاخیر کمتر)
- ✅ بدون نیاز به سرویس خارجی
- ✅ رایگان تا ۵ میلیون درخواست در ماه
- ✅ یکپارچه با Workers و KV
- ✅ کنترل کامل روی داده‌ها

## راه‌اندازی:

### ۱. ساخت دیتابیس D1
```bash
wrangler d1 create mili-config-pro-db
```

### ۲. اعمال اسکیما
```bash
wrangler d1 execute mili-config-pro-db --file=cloudflare-db/schema.sql
```

### ۳. اتصال به wrangler.toml
در فایل `wrangler.toml` بخش زیر اضافه شده است:
```toml
[[d1_databases]]
binding = "DB"
database_name = "mili-config-pro-db"
database_id = "<DATABASE_ID>"
```

### ۴. کوئری‌های نمونه
```bash
# دریافت همه ورکرها
wrangler d1 execute mili-config-pro-db --command="SELECT * FROM worker_configs;"

# افزودن کاربر جدید
wrangler d1 execute mili-config-pro-db --command="INSERT INTO users (username, password_hash, role) VALUES ('admin', 'hash_here', 'admin');"

# مشاهده لاگ استقرارها
wrangler d1 execute mili-config-pro-db --command="SELECT * FROM deployment_logs ORDER BY deployed_at DESC LIMIT 10;"
```

## جداول:
- `worker_configs`: پیکربندی ورکرهای قابل استقرار
- `deployment_logs`: تاریخچه استقرارها
- `users`: کاربران پنل چندکاربره
- `subscriptions`: اشتراک‌های کاربران
- `ip_scans`: نتایج اسکن IP

## بک‌آپ و ریستور:
```bash
# بک‌آپ
wrangler d1 export mili-config-pro-db --output=backup.sqlite

# ریستور
wrangler d1 execute mili-config-pro-db --file=backup.sql
```
