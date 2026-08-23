-- Cloudflare D1 Database Schema for MiliConfig Pro
-- جایگزین Supabase با استفاده از SQLite روی Cloudflare Edge

-- جدول پیکربندی ورکرها
CREATE TABLE IF NOT EXISTS worker_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_name TEXT UNIQUE NOT NULL,
    worker_type TEXT NOT NULL DEFAULT 'custom',
    source_url TEXT NOT NULL,
    binding_type TEXT NOT NULL DEFAULT 'KV',
    binding_name TEXT,
    environment_json TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول لاگ استقرارها
CREATE TABLE IF NOT EXISTS deployment_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_name TEXT NOT NULL,
    worker_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- جدول کاربران (برای پنل چندکاربره)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- جدول اشتراک‌های کاربران
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subscription_link TEXT NOT NULL,
    protocol TEXT DEFAULT 'vless',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- جدول اسکن IP
CREATE TABLE IF NOT EXISTS ip_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    port INTEGER DEFAULT 443,
    latency_ms INTEGER,
    is_valid INTEGER DEFAULT 0,
    country_code TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    worker_name TEXT
);

-- ایندکس‌ها برای عملکرد بهتر
CREATE INDEX IF NOT EXISTS idx_worker_configs_name ON worker_configs(worker_name);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_worker ON deployment_logs(worker_name);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_status ON deployment_logs(status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_scans_ip ON ip_scans(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_scans_valid ON ip_scans(is_valid);

-- داده‌های اولیه
INSERT OR IGNORE INTO worker_configs (worker_name, worker_type, source_url, binding_type, binding_name, environment_json) VALUES
('edgetunnel-main', 'edgetunnel', 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js', 'KV', 'KV', '{"PROXYIP": "proxyip.example.com"}'),
('edgetunnel-kv', 'edgetunnel_kv', 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js', 'KV', 'KV', '{"DYNAMIC_CONFIG": "true"}'),
('mili-custom', 'custom', '/repo/worker-source.js', 'KV', 'C', '{"VERSION": "v2.9.8c"}'),
('misub-panel', 'misub_d1', '/repo/misub-proxy-source.js', 'D1', 'DB', '{"PANEL_ENABLED": "true"}'),
('ip-scanner', 'misub_scanner', '/repo/misub-scanner-worker.js', 'NONE', NULL, '{}');
