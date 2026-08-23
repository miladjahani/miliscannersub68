#!/bin/bash
# اسکریپت راه‌اندازی کامل Cloudflare D1 و KV

set -e

echo "🚀 شروع راه‌اندازی Cloudflare D1 و KV..."

# بررسی ورود به Cloudflare
if ! wrangler whoami &> /dev/null; then
    echo "❌ لطفاً ابتدا وارد Cloudflare شوید:"
    echo "   wrangler login"
    exit 1
fi

echo "✅ کاربر Cloudflare تأیید شد."

# ساخت دیتابیس D1
echo ""
echo "📦 ساخت دیتابیس D1..."
DB_OUTPUT=$(wrangler d1 create mili-config-pro-db 2>&1) || true
echo "$DB_OUTPUT"

# استخراج database_id از خروجی
DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || echo "")

if [ -z "$DB_ID" ]; then
    echo "⚠️  نتوانستم database_id را پیدا کنم. لطفاً از خروجی بالا کپی کنید."
    read -p "database_id را وارد کنید: " DB_ID
fi

echo "✅ database_id: $DB_ID"

# اعمال اسکیما
echo ""
echo "📋 اعمال اسکیما روی دیتابیس..."
wrangler d1 execute mili-config-pro-db --file=cloudflare-db/schema.sql

# ساخت KV Namespace اصلی
echo ""
echo "🔑 ساخت KV Namespace اصلی..."
KV_OUTPUT=$(wrangler kv namespace create MILI-KV 2>&1) || true
echo "$KV_OUTPUT"

KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || echo "")

if [ -z "$KV_ID" ]; then
    echo "⚠️  نتوانستم KV id را پیدا کنم. لطفاً از خروجی بالا کپی کنید."
    read -p "KV namespace id را وارد کنید: " KV_ID
fi

echo "✅ KV namespace id: $KV_ID"

# به‌روزرسانی wrangler.toml
echo ""
echo "✏️  به‌روزرسانی wrangler.toml..."

# جایگزینی placeholderها با مقادیر واقعی
sed -i "s/YOUR_DATABASE_ID_HERE/$DB_ID/g" wrangler.toml
sed -i "s/YOUR_KV_NAMESPACE_ID_HERE/$KV_ID/g" wrangler.toml
sed -i "s/YOUR_PREVIEW_KV_NAMESPACE_ID_HERE/$KV_ID/g" wrangler.toml
sed -i "s/YOUR_CUSTOM_KV_ID_HERE/$KV_ID/g" wrangler.toml
sed -i "s/YOUR_PREVIEW_CUSTOM_KV_ID_HERE/$KV_ID/g" wrangler.toml

echo "✅ wrangler.toml به‌روزرسانی شد."

# نمایش خلاصه
echo ""
echo "============================================"
echo "✅ راه‌اندازی کامل شد!"
echo "============================================"
echo ""
echo "مشخصات:"
echo "  - دیتابیس D1: mili-config-pro-db (ID: $DB_ID)"
echo "  - KV Namespace: MILI-KV (ID: $KV_ID)"
echo ""
echo "مراحل بعدی:"
echo "  1. بررسی wrangler.toml برای اطمینان از صحت IDs"
echo "  2. اجرای: npm run build"
echo "  3. اجرای: wrangler deploy"
echo ""
echo "دستورات مفید:"
echo "  - مشاهده داده‌ها: wrangler d1 execute mili-config-pro-db --command='SELECT * FROM worker_configs;'"
echo "  - مشاهده لاگ‌ها: wrangler d1 execute mili-config-pro-db --command='SELECT * FROM deployment_logs ORDER BY deployed_at DESC LIMIT 10;'"
echo "  - دیباگ محلی: wrangler dev --local"
echo ""
