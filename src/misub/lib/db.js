/**
 * Local Database & State Persistence Engine
 * Supports LocalStorage & IndexedDB full backup/restore for Configs, Subscriptions & Scans
 */

const DB_PREFIX = 'cf_misub_db_';

export const db = {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(DB_PREFIX + key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(DB_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('DB set error:', e);
    }
  },

  remove(key) {
    localStorage.removeItem(DB_PREFIX + key);
  },

  exportAllBackup() {
    const backup = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DB_PREFIX)) {
        try {
          backup[k.replace(DB_PREFIX, '')] = JSON.parse(localStorage.getItem(k));
        } catch {
          backup[k.replace(DB_PREFIX, '')] = localStorage.getItem(k);
        }
      }
    }
    return JSON.stringify({
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: backup
    }, null, 2);
  },

  importAllBackup(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      const data = parsed.data || parsed;
      for (const [k, v] of Object.entries(data)) {
        db.set(k, v);
      }
      return true;
    } catch (e) {
      console.error('Import backup failed:', e);
      return false;
    }
  },

  clearAll() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DB_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
};
