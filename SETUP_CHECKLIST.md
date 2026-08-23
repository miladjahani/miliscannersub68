# ✅ چک‌لیست نهایی: آماده‌سازی پروژه برای GitHub و Supabase

## وضعیت فعلی پروژه

### ✅ انجام‌شده:
1. **سورس‌های Worker متفاوت**:
   - `public/repo/worker-source.js` — سورس اختصاصی Mili (CFnew v2.9.8c)
   - `public/repo/misub-proxy-source.js` — پنل چندکاربره MiSub با D1
   - `public/repo/misub-scanner-worker.js` — موتور اسکنر IP تمیز
   - `cmliu/edgetunnel` — ورکر کامل VLESS/Trojan/SS (از مخزن خارجی)

2. **Edge Function پیکربندی‌شده** (`supabase/functions/cf-deploy/index.ts`):
   - ۵ نوع Worker با bindingهای متفاوت (KV، D1، بدون binding)
   - پشتیبانی از Workers و Pages deployment
   - ایجاد خودکار KV namespace و D1 database
   - نوشتن پیکربندی اولیه در KV/D1

3. **مستندات کامل**:
   - `GITHUB_SETUP.md` — راهنمای گام‌به‌گام اتصال به GitHub
   - `README.md` — معرفی پروژه و Workerهای قابل استقرار
   - `.github/workflows/deploy.yml` — GitHub Actions برای Pages

4. **.gitignore به‌روزرسانی‌شده**:
   - فایل‌های `dist/` برای GitHub Pages مجاز شدند

---

## 📋 مراحل بعدی (توسط شما)

### مرحله ۱: ساخت مخزن GitHub
```bash
# در GitHub.com یک مخزن جدید بسازید (مثلاً mili-config-pro)
# سپس دستورات زیر را اجرا کنید:

cd /workspace
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin --force
```

### مرحله ۲: تنظیم Supabase Edge Function
بعد از push به GitHub:

1. به Supabase Dashboard بروید
2. بخش Edge Functions → `cf-deploy` → Settings
3. متغیرهای محیطی را تنظیم کنید:
   - `SOURCE_REPO`: `your-username/your-repo`
   - `SOURCE_BRANCH`: `main`

### مرحله ۳: تست اتصال
لینک‌های زیر باید کار کنند (USERNAME و REPO را جایگزین کنید):
```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/worker-source.js
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/misub-proxy-source.js
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/misub-scanner-worker.js
```

---

## 🔍 Workerهای قابل استقرار

| نوع Worker | Binding | سورس | توضیح |
|------------|---------|------|-------|
| `edgetunnel` | KV (`KV`) | `cmliu/edgetunnel` | ورکر کامل پروکسی با پنل |
| `edgetunnel_kv` | KV (`KV`) | `cmliu/edgetunnel` | پیکربندی دینامیک از KV |
| `custom` | KV (`C`) | `public/repo/worker-source.js` | سورس اختصاصی Mili |
| `misub_d1` | D1 (`DB`) | `public/repo/misub-proxy-source.js` | پنل چندکاربره با SQLite |
| `misub_scanner` | — | `public/repo/misub-scanner-worker.js` | API اسکن IP تمیز |

**همه Workerها متفاوت هستند** و هر کدام منابع مخصوص به خود را دارند!

---

## 🚀 شروع به کار

1. کد را به GitHub push کنید
2. `SOURCE_REPO` را در Supabase تنظیم کنید
3. داشبورد را باز کنید (`npm run dev`)
4. از صفحه "استقرار ورکر جدید"، یکی از ۵ نوع Worker را انتخاب کنید
5. فرم را پر کرده و Worker را مستقر کنید

هر Worker از سورس متفاوتی بارگذاری می‌شود و bindingهای خاص خود را دارد، بنابراین همه یکسان نخواهند بود!
