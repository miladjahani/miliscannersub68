# Mili Config Pro + MiSub

پنل مدیریت پیشرفته برای استقرار خودکار Workerهای Cloudflare با پشتیبانی از چندین نوع ورکر متفاوت.

> **Auto-deployed via Supabase Edge Functions → Cloudflare API**

## ویژگی‌ها

- 🚀 **استقرار خودکار ۵ نوع ورکر متفاوت**:
  - `edgetunnel` — ورکر کامل cmliu با VLESS/Trojan/SS
  - `edgetunnel_kv` — حالت KV برای پیکربندی دینامیک
  - `custom` — سورس اختصاصی Mili با پنل داخلی
  - `misub_d1` — پنل چندکاربره با دیتابیس D1
  - `misub_scanner` — موتور اسکنر IP تمیز بدون پنل

- 📊 **مدیریت متمرکز**: تمام ورکرها از طریق یک داشبورد مدیریت می‌شوند
- 🔐 **امنیت**: رمزنگاری توکن‌ها، احراز هویت کاربران، لاگ فعالیت‌ها
- 🌐 **Multi-Account**: پشتیبانی از چندین حساب Cloudflare
- 📱 **رابط فارسی**: داشبورد React با طراحی مدرن و RTL

## راه‌اندازی سریع

### ۱. اتصال به GitHub

```bash
cd /workspace
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin --force
```

### ۲. تنظیم Supabase

1. پروژه Supabase را ایجاد کنید
2. Migrationها را اعمال کنید (`supabase/migrations/*.sql`)
3. Edge Function `cf-deploy` را deploy کنید
4. متغیرهای محیطی را تنظیم کنید:
   - `SOURCE_REPO`: `your-username/your-repo`
   - `SOURCE_BRANCH`: `main`

### ۳. اجرای داشبورد

```bash
npm install
npm run dev
```

متغیرهای لازم در `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## مستندات کامل

- [راهنمای اتصال به GitHub](./GITHUB_SETUP.md)
- [مستندات استقرار](./DEPLOYMENT.md)

## ساختار Workerها

هر نوع ورکر منابع و bindingهای مخصوص به خود را دارد:

| نوع | Binding | سورس | توضیح |
|-----|---------|------|-------|
| `edgetunnel` | KV (`KV`) | `cmliu/edgetunnel` | ورکر کامل پروکسی |
| `edgetunnel_kv` | KV (`KV`) | `cmliu/edgetunnel` | پیکربندی از KV |
| `custom` | KV (`C`) | `public/repo/worker-source.js` | سورس اختصاصی Mili |
| `misub_d1` | D1 (`DB`) | `public/repo/misub-proxy-source.js` | پنل چندکاربره |
| `misub_scanner` | — | `public/repo/misub-scanner-worker.js` | اسکنر IP |

## License

MIT
