# استقرار MiliConfig Pro + MiSub

این نسخه علاوه بر داشبورد React، مسیر استقرار واقعی Workerها را از طریق **Supabase Edge Function `cf-deploy`** مدیریت می‌کند. برای هر Worker، منابع لازم در Cloudflare ساخته/بازیابی می‌شوند، bindingها اعمال می‌شوند، سورس آپلود می‌شود و نتیجه همراه با log داخل `deployments` ثبت می‌شود.

## Workerهای قابل استقرار

ویزارد استقرار این منابع را پشتیبانی می‌کند:

- `edgetunnel` — `cmliu/edgetunnel` با KV
- `edgetunnel_kv` — همان سورس با مسیر KV
- `custom` — Worker سفارشی Mili با KV (`C` + کلید `c`)
- `misub_d1` — پنل چندکاربره MiSub با D1 (`DB`)
- `misub_scanner` — موتور Scanner/Optimizer بدون binding

برای هر منبع، pipeline به‌صورت جداگانه binding و تنظیمات مخصوص همان Worker را اعمال می‌کند.

## بهبودهای مسیر Supabase → Cloudflare

`supabase/functions/cf-deploy/index.ts` اکنون:

1. توکن Cloudflare را verify می‌کند.
2. حساب Cloudflare قابل‌دسترسی را انتخاب می‌کند.
3. KV را بر اساس نام پیدا و در صورت نبودن ایجاد می‌کند؛ بنابراین اجرای دوباره Worker باعث ساخت namespaceهای تکراری نمی‌شود.
4. برای MiSub، D1 را پیدا/ایجاد می‌کند و جدول `settings` را قبل از اولین درخواست آماده می‌کند.
5. Worker را با Multipart Worker Script API و bindingهای درست مستقر می‌کند.
6. `workers.dev` را فعال می‌کند و URL واقعی را ثبت می‌کند.
7. در حالت Pages، KV/D1 را به شکل صحیح داخل `deployment_configs.production` قرار می‌دهد.
8. برای MiSub، `CF_API_TOKEN` را به‌صورت secret در محیط Pages/Worker قرار می‌دهد و رمز پنل را در D1 می‌نویسد.
9. `worker_source` و `deployment_config` را برای audit/resume داخل `deployments` ذخیره می‌کند.
10. خطاهای هر مرحله را در `deployments.logs` ثبت می‌کند.

## Migration جدید Supabase

فایل زیر باید روی پروژه Supabase اعمال شود:

`supabase/migrations/20260823113000_add_worker_source_deployment_metadata.sql`

این migration دو ستون اضافه می‌کند:

- `worker_source`
- `deployment_config`

اگر از Supabase CLI استفاده می‌شود، migrationها را طبق روال پروژه push کنید.

## تنظیم سورس Workerها

برای Workerهای داخل همین repository، مقدار پیش‌فرض:

```text
SOURCE_REPO=miladjahani/miliconfig-pro
SOURCE_BRANCH=main
```

اگر repository یا branch متفاوت است، این دو Secret را در Supabase Edge Functions تغییر دهید.

برای سناریوهای خاص می‌توان `WORKER_SOURCE_BASE_URL` را هم تنظیم کرد تا base URL سورس Workerها مستقل از GitHub باشد.

## متغیرهای لازم داشبورد

برای build داشبورد:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

برای Edge Function `cf-deploy`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- در صورت نیاز `SOURCE_REPO`
- در صورت نیاز `SOURCE_BRANCH`
- در صورت نیاز `WORKER_SOURCE_BASE_URL`

## Node.js

نسخه پیشنهادی پروژه به Node.js `22.16.0` ارتقا داده شده و `.nvmrc` و `.node-version` نیز اضافه شده‌اند تا warning مربوط به Node.js 20 در buildهای CI/Cloudflare کاهش یابد.

## خطاهای TypeScript اصلاح‌شده

خطاهای تصویر مربوط به ناسازگاری typeهای parser/Scanner/Converter اصلاح شده‌اند:

- `useSubscriptions.ts` — هماهنگ‌سازی `ParsedNode`
- `useScanner.ts` — نرمال‌سازی خروجی واقعی scanner به `ScanResult`
- `useOptimizer.ts` — تبدیل خطاهای ساختاری optimizer به `string[]`
- `QuickOptimizer.tsx` — adapter امن برای converterهای JavaScript
- `SubscriptionHub.tsx` — حذف callback typeهای متعارض و هماهنگ‌سازی nodeها

اسکریپت `npm run typecheck` نیز اضافه شده است.
