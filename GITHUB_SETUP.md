# راهنمای اتصال پروژه به GitHub و Supabase

## مشکل فعلی
پروژه در حال حاضر به هیچ مخزن GitHub متصل نیست. برای فعال‌سازی استقرار خودکار، باید مراحل زیر را انجام دهید.

---

## مرحله ۱: ساخت مخزن GitHub

1. به [GitHub.com](https://github.com) بروید و وارد حساب کاربری خود شوید
2. روی دکمه **+** → **New repository** کلیک کنید
3. یک نام برای مخزن انتخاب کنید (مثلاً `mili-config-pro`)
4. مخزن را **Public** یا **Private** ایجاد کنید
5. **بدون** README یا `.gitignore` ایجاد کنید (چون کد از قبل موجود است)
6. روی **Create repository** کلیک کنید

---

## مرحله ۲: اتصال مخزن محلی به GitHub

در ترمینال، دستورات زیر را اجرا کنید:

```bash
cd /workspace

# حذف remote قدیمی اگر وجود دارد
git remote remove origin 2>/dev/null || true

# اضافه کردن remote جدید (USERNAME و REPO_NAME را جایگزین کنید)
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# بررسی اتصال
git remote -v

# ارسال کد به GitHub
git add .
git commit -m "Initial commit: Mili Config Pro with Multi-Worker Deployment"
git branch -M main
git push -u origin --force
```

**توجه:** به جای `USERNAME` نام کاربری GitHub و به جای `REPO_NAME` نام مخزن خود را قرار دهید.

---

## مرحله ۳: تنظیم Supabase Edge Function

بعد از آپلود کد در GitHub، باید آدرس مخزن را در Supabase ثبت کنید:

### الف) ورود به Supabase Dashboard
1. به [supabase.com](https://supabase.com) بروید
2. پروژه خود را انتخاب کنید
3. به بخش **Edge Functions** بروید

### ب) تنظیم متغیرهای محیطی
روی تابع `cf-deploy` کلیک کرده و متغیرهای زیر را تنظیم کنید:

| متغیر | مقدار پیش‌فرض | توضیح |
|-------|--------------|-------|
| `SOURCE_REPO` | `miladjahani/miliconfig-pro` | آدرس مخزن GitHub شما (مثلاً `yourusername/your-repo`) |
| `SOURCE_BRANCH` | `main` | شاخه اصلی مخزن |
| `SUPABASE_URL` | (خودکار) | URL پروژه Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | (خودکار) | کلید سرویس Supabase |

**مثال:** اگر مخزن شما `https://github.com/alireza/mili-workers` است، مقدار `SOURCE_REPO` باید باشد: `alireza/mili-workers`

---

## مرحله ۴: فعال‌سازی GitHub Actions (اختیاری)

اگر می‌خواهید با هر push به شاخه `main`، پروژه به‌طور خودکار build شود:

1. در مخزن GitHub، به تب **Settings** → **Actions** → **General** بروید
2. گزینه **Allow all actions and reusable workflows** را فعال کنید
3. فایل `.github/workflows/deploy.yml` به‌طور خودکار با هر push اجرا می‌شود

---

## مرحله ۵: تست اتصال

### تست ۱: بررسی لینک سورس Workerها
بعد از تنظیم `SOURCE_REPO`، لینک‌های زیر باید کار کنند:

```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/worker-source.js
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/misub-proxy-source.js
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/public/repo/misub-scanner-worker.js
```

### تست ۲: اجرای ویزارد استقرار
1. داشبورد را باز کنید (`npm run dev`)
2. به صفحه **استقرار ورکر جدید** بروید
3. یکی از ورکرهای زیر را انتخاب کنید:
   - **cmliu/edgetunnel** — ورکر کامل VLESS/Trojan/SS
   - **Mili (سورس اختصاصی)** — پروکسی سفارشی با پنل داخلی
   - **MiSub — پنل چندکاربره (D1)** — مدیریت کاربران با دیتابیس
   - **MiSub — موتور اسکنر/بهینه‌ساز** — API اسکن IP تمیز

4. فرم را پر کرده و ورکر را مستقر کنید
5. لاگ‌های استقرار را در داشبورد مشاهده خواهید کرد

---

## Workerهای قابل استقرار

هر ورکر منابع و bindingهای مخصوص به خود را دارد:

| نوع ورکر | Binding | توضیح |
|----------|---------|-------|
| `edgetunnel` | KV (`KV`) | ورکر کامل cmliu با پشتیبانی از VLESS/Trojan/SS |
| `edgetunnel_kv` | KV (`KV`) | همان edgetunnel با پیکربندی از KV |
| `custom` | KV (`C`) | سورس اختصاصی Mili با پنل داخلی کامل |
| `misub_d1` | D1 (`DB`) | پنل چندکاربره با دیتابیس SQLite روی Cloudflare |
| `misub_scanner` | بدون binding | موتور اسکنر IP تمیز بدون پنل |

---

## عیب‌یابی

### خطای "failed to fetch worker source"
- مطمئن شوید `SOURCE_REPO` و `SOURCE_BRANCH` درست تنظیم شده‌اند
- بررسی کنید فایل‌های `public/repo/*.js` در مخزن GitHub موجود باشند
- لینک raw GitHub را در مرورگر تست کنید

### خطای "invalid cloudflare token"
- توکن API کلودفلر را دوباره بسازید
- دسترسی‌های لازم: **Workers:Write**, **KV Storage:Edit**, **D1:Edit**

### ورکرها یکسان هستند
- هر نوع ورکر از `WORKER_SOURCES` در `cf-deploy/index.ts` سورس متفاوتی می‌گیرد
- مطمئن شوید `worker_source` در ویزارد استقرار درست انتخاب شده باشد

---

## منابع بیشتر

- [مستندات Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Cloudflare Workers API](https://developers.cloudflare.com/api/)
- [GitHub Raw Content](https://docs.github.com/en/repositories/working-with-files/using-files/accessing-a-file-using-github-api)
