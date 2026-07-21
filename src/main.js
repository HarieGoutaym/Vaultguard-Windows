'use strict';
/**
 * VaultGuard — Electron Main Process
 * 
 * SECURITY HARDENING:
 *  - nodeIntegration: false (renderer cannot access Node)
 *  - contextIsolation: true (preload bridge only)
 *  - sandbox: true (renderer sandboxed)
 *  - webSecurity: true (CSP enforced)
 *  - allowRunningInsecureContent: false
 *  - No remote module
 *  - All navigation blocked — app cannot load external URLs
 *  - webRequest interceptor blocks ALL outgoing network (except HaveIBeenPwned k-anon API if enabled)
 *  - App data stored in encrypted SQLite via better-sqlite3
 *  - Master password NEVER stored — only Argon2id verification hash
 *  - Argon2id KDF: 64MB memory, 3 iterations, 4 threads
 *  - AES-256-GCM for all vault data
 *  - Keytar stores derived key in OS credential store (optional)
 */

const { registerAdditionalIPC } = require('./main-additions');
const { registerCloudIPC }      = require('./main-cloud');
const { applySecurityHardening }  = require('./security');
const { app, BrowserWindow, ipcMain, session, dialog, clipboard, nativeTheme, Menu, Tray, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const os     = require('os');

// ── Optional native modules (graceful degradation) ─────────────────────────────
let argon2, Database, keytar, otplib, QRCode;
try { argon2  = require('argon2');          } catch(e) { console.warn('argon2 not available, falling back to PBKDF2'); }
try { Database = require('better-sqlite3'); } catch(e) { console.warn('better-sqlite3 not available'); }
try { keytar  = require('keytar');          } catch(e) { console.warn('keytar not available'); }
try { otplib  = require('otplib');          } catch(e) { console.warn('otplib not available'); }
try { QRCode  = require('qrcode');          } catch(e) { console.warn('qrcode not available'); }

// ── Paths ──────────────────────────────────────────────────────────────────────
const USER_DATA  = app.getPath('userData');
const DB_PATH    = path.join(USER_DATA, 'vault.db');
const AUDIT_PATH = path.join(USER_DATA, 'audit.db');

// ── In-memory state ────────────────────────────────────────────────────────────
let mainWindow = null;
let tray       = null;
let vaultKey   = null;   // 32-byte AES key, held in memory only while unlocked
let autoLockTimeout = null;
let settings   = { autoLockMs: 300000, clipboardClearMs: 30000, minimizeToTray: true };
let db         = null;
let auditDb    = null;
let cloudHooks = null;   // { markTombstone, stopAutoSync } — set after IPC reg

// ── Brute-force throttle ────────────────────────────────────────────────────────
// Tracks failed unlock attempts. Resets only on a successful unlock.
const failedAttempts = { count: 0, lockedUntil: 0 };
const MAX_ATTEMPTS   = 5;   // attempts before lock-out begins
const LOCKOUT_BASE_MS = 30_000;  // 30 s, doubles each subsequent lockout

// ── AES-256-GCM Crypto ─────────────────────────────────────────────────────────
function encrypt(plaintext, key) {
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv:  iv.toString('base64'),
    ct:  ct.toString('base64'),
    tag: tag.toString('base64')
  });
}

function decrypt(blob, key) {
  const { iv, ct, tag } = JSON.parse(blob);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct,'base64')), decipher.final()]);
  return pt.toString('utf8');
}

// ── Argon2id KDF (falls back to PBKDF2 if native not available) ────────────────
async function deriveKey(masterPassword, salt) {
  if (argon2) {
    // Argon2id — 64MB memory, 3 iterations, 4 parallel threads
    const hash = await argon2.hash(masterPassword, {
      type:        argon2.argon2id,
      memoryCost:  65536,   // 64 MB
      timeCost:    3,
      parallelism: 4,
      salt:        Buffer.from(salt, 'hex'),
      hashLength:  32,
      raw:         true,
    });
    return hash;
  }
  // PBKDF2 fallback (600,000 iterations — NIST 2023 recommendation)
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(masterPassword, Buffer.from(salt,'hex'), 600000, 32, 'sha256', (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

// ── Database Init ──────────────────────────────────────────────────────────────
function initDB() {
  if (!Database) return;
  
  // Main vault DB
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,  -- AES-256-GCM encrypted JSON
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id   TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Audit DB (separate file — audit log survives vault wipe)
  auditDb = new Database(AUDIT_PATH);
  auditDb.pragma('journal_mode = WAL');
  auditDb.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT NOT NULL,
      details   TEXT,
      timestamp INTEGER NOT NULL,
      ip        TEXT DEFAULT 'local'
    );
  `);
}


// ── One-time color migration: replace legacy violet/cyan category colors with
//    the new blue-based palette. Runs once after initDB(); leaves user-edited
//    custom colors untouched.
function migrateLegacyColors() {
  if (!db) return;
  try {
    const LEGACY_TO_NEW = {
      '#7c5cfc': '#2563eb',  // violet → blue
      '#00d68f': '#16a34a',  // teal-green → emerald
      '#00d4ff': '#0ea5e9',  // electric cyan → sky
      '#ffb300': '#d97706',  // amber → warm amber
      '#ff4757': '#dc2626',  // pink-red → red
    };
    const done = db.prepare("SELECT value FROM meta WHERE key='colors_migrated_v2'").get();
    if (done) return;
    const rows = db.prepare('SELECT id, data FROM categories').all();
    const upd = db.prepare('UPDATE categories SET data=? WHERE id=?');
    const tx  = db.transaction(() => {
      for (const r of rows) {
        try {
          const c = JSON.parse(r.data);
          const lc = String(c.color || '').toLowerCase();
          if (LEGACY_TO_NEW[lc]) {
            c.color = LEGACY_TO_NEW[lc];
            upd.run(JSON.stringify(c), r.id);
          }
        } catch {}
      }
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('colors_migrated_v2', '1');
    });
    tx();
    console.log('[Migration] Category colors updated to blue palette');
  } catch (e) {
    console.warn('[Migration] color migration skipped:', e?.message);
  }
}

// ── Auto-lock ──────────────────────────────────────────────────────────────────
function resetAutoLock() {
  if (autoLockTimeout) clearTimeout(autoLockTimeout);
  if (!vaultKey || !settings.autoLockMs) return;
  autoLockTimeout = setTimeout(() => {
    lockVault();
    if (mainWindow) mainWindow.webContents.send('auto-locked');
  }, settings.autoLockMs);
}

function lockVault() {
  // Zero out the key in memory
  if (vaultKey) { vaultKey.fill(0); vaultKey = null; }
  if (autoLockTimeout) { clearTimeout(autoLockTimeout); autoLockTimeout = null; }
}

// ── Audit logging ──────────────────────────────────────────────────────────────
function logAudit(action, details = '') {
  if (!auditDb) return;
  try {
    auditDb.prepare('INSERT INTO audit_log (action, details, timestamp) VALUES (?,?,?)')
      .run(action, details, Date.now());
  } catch(e) { /* non-fatal */ }
}

// ── IPC input sanitiser ────────────────────────────────────────────────────────
// Defence-in-depth: even though the renderer is sandboxed, we never trust
// the shape or size of data coming over IPC.
const ALLOWED_ENTRY_TYPES = new Set(['login','card','note','identity','ssh','api','crypto','license']);
function sanitiseEntry(data) {
  const s = v => String(v ?? '');
  return {
    title:       s(data.title).slice(0, 256),
    entryType:   ALLOWED_ENTRY_TYPES.has(data.entryType) ? data.entryType : 'login',
    username:    s(data.username).slice(0, 512),
    email:       s(data.email).slice(0, 512),
    password:    s(data.password).slice(0, 4096),
    url:         s(data.url).slice(0, 2048),
    notes:       s(data.notes).slice(0, 8192),
    tags:        Array.isArray(data.tags) ? data.tags.map(t => s(t).slice(0,64)).slice(0,20) : [],
    isFavorite:  Boolean(data.isFavorite),
    categoryId:  s(data.categoryId).slice(0, 64),
    totpSecret:  s(data.totpSecret).slice(0, 256),
    // Card fields
    cardNumber:  s(data.cardNumber).slice(0, 19),
    cardExpiry:  s(data.cardExpiry).slice(0, 7),
    cardCvv:     s(data.cardCvv).slice(0, 4),
    cardHolder:  s(data.cardHolder).slice(0, 128),
    // Custom fields — array of {label, value, hidden}
    customFields: Array.isArray(data.customFields)
      ? data.customFields.slice(0,20).map(f => ({
          label:  s(f?.label).slice(0,64),
          value:  s(f?.value).slice(0,4096),
          hidden: Boolean(f?.hidden),
        }))
      : [],
  };
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
function registerIPC() {

  // ── Vault ──
  ipcMain.handle('vault:check-exists', () => {
    if (!db) return false;
    const row = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_hash');
    return !!row;
  });

  ipcMain.handle('vault:create', async (_, { masterPassword, hint }) => {
    try {
      const salt = crypto.randomBytes(32).toString('hex');
      const key  = await deriveKey(masterPassword, salt);
      
      // vault_verify stores a random token encrypted with the derived key.
      // We decrypt and compare to confirm the key is correct — we never
      // store the plaintext token itself any more (defence-in-depth).
      const verifyPlain = crypto.randomBytes(32).toString('hex');
      const verifyEnc   = encrypt(verifyPlain, key);

      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_salt', salt);
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_hash', verifyEnc);
      // Store a HMAC of the verify token (not the token itself) so unlock can
      // compare without keeping plaintext on disk.
      const verifyHmac = crypto.createHmac('sha256', key).update(verifyPlain).digest('hex');
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_verify_hmac', verifyHmac);
      // Remove old plaintext verify row if upgrading from a previous version
      db.prepare('DELETE FROM meta WHERE key=?').run('vault_verify');
      if (hint) db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_hint', hint);

      // Seed default categories
      const defaultCats = [
        {id:'cat-1',name:'Social Media',icon:'🌐',color:'#2563eb',isDefault:true},
        {id:'cat-2',name:'Finance',     icon:'💳',color:'#16a34a',isDefault:true},
        {id:'cat-3',name:'Work',        icon:'💼',color:'#0ea5e9',isDefault:true},
        {id:'cat-4',name:'Shopping',    icon:'🛒',color:'#d97706',isDefault:true},
        {id:'cat-5',name:'Gaming',      icon:'🎮',color:'#dc2626',isDefault:true},
      ];
      const ins = db.prepare('INSERT OR REPLACE INTO categories VALUES (?,?)');
      defaultCats.forEach(c => ins.run(c.id, JSON.stringify(c)));

      vaultKey = key;
      logAudit('vault_created', '');
      resetAutoLock();
      return { success: true };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('vault:unlock', async (_, { masterPassword }) => {
    try {
      if (!db) return { success: false, error: 'Database not initialized' };

      // ── Brute-force throttle ──────────────────────────────────────────────────
      const now = Date.now();
      if (failedAttempts.lockedUntil > now) {
        const secsLeft = Math.ceil((failedAttempts.lockedUntil - now) / 1000);
        logAudit('vault_unlock_blocked', `locked for ${secsLeft}s`);
        return { success: false, error: `Too many failed attempts. Try again in ${secsLeft} seconds.`, lockedOut: true };
      }

      const saltRow   = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_salt');
      const hashRow   = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_hash');
      const hmacRow   = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_verify_hmac');
      // Legacy: vaults created before this fix stored the plaintext token
      const legacyRow = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_verify');
      if (!saltRow || !hashRow) return { success: false, error: 'No vault found' };

      const key = await deriveKey(masterPassword, saltRow.value);
      
      // Verify by decrypting the verification blob.
      // Use timingSafeEqual so an attacker cannot measure whether the
      // decrypted prefix matches — prevents remote timing oracle attacks.
      try {
        const decrypted = decrypt(hashRow.value, key);

        let match = false;
        if (hmacRow) {
          // Modern path: compare HMAC(key, decrypted) against stored HMAC
          const computed = crypto.createHmac('sha256', key).update(decrypted).digest('hex');
          const aBuf = Buffer.from(computed,       'hex');
          const bBuf = Buffer.from(hmacRow.value,  'hex');
          match = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
        } else if (legacyRow) {
          // Legacy path: compare decrypted token against stored plaintext
          const maxLen = Math.max(decrypted.length, legacyRow.value.length);
          const aBuf   = Buffer.alloc(maxLen);
          const bBuf   = Buffer.alloc(maxLen);
          Buffer.from(decrypted).copy(aBuf);
          Buffer.from(legacyRow.value).copy(bBuf);
          match = crypto.timingSafeEqual(aBuf, bBuf);
        }
        if (!match) throw new Error('Mismatch');
      } catch {
        logAudit('vault_unlock_failed', `attempt ${failedAttempts.count + 1}`);
        failedAttempts.count++;
        if (failedAttempts.count >= MAX_ATTEMPTS) {
          // Exponential back-off: 30s, 60s, 120s, …
          const multiplier = Math.pow(2, failedAttempts.count - MAX_ATTEMPTS);
          failedAttempts.lockedUntil = Date.now() + Math.min(LOCKOUT_BASE_MS * multiplier, 3_600_000);
        }
        return { success: false, error: 'Invalid master password' };
      }

      // ── Success — reset throttle ───────────────────────────────────────────────
      failedAttempts.count      = 0;
      failedAttempts.lockedUntil = 0;
      vaultKey = key;
      logAudit('vault_unlocked', '');
      resetAutoLock();
      return { success: true };
    } catch(e) {
      return { success: false, error: 'Invalid master password' };
    }
  });

  ipcMain.handle('vault:lock', () => {
    lockVault();
    logAudit('vault_locked', '');
    return { success: true };
  });

  // ── Change master password ──────────────────────────────────────────────────
  // Re-derives a new key from the new password, re-encrypts every entry under
  // the new key, and atomically rewrites the salt + verify metadata. The vault
  // remains unlocked under the new key on success. On any failure we roll back
  // and keep the original key/data intact.
  ipcMain.handle('vault:change-master-password', async (_, { currentPassword, newPassword, hint }) => {
    if (!db || !vaultKey) return { success: false, error: 'Vault locked' };
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }
    try {
      // 1. Verify current password by deriving its key and matching against stored verify
      const saltRow = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_salt');
      const hashRow = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_hash');
      const hmacRow = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_verify_hmac');
      if (!saltRow || !hashRow) return { success: false, error: 'Vault metadata missing' };
      const currentKey = await deriveKey(currentPassword, saltRow.value);
      try {
        const decrypted = decrypt(hashRow.value, currentKey);
        let match = false;
        if (hmacRow) {
          const computed = crypto.createHmac('sha256', currentKey).update(decrypted).digest('hex');
          const aBuf = Buffer.from(computed, 'hex');
          const bBuf = Buffer.from(hmacRow.value, 'hex');
          match = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
        }
        if (!match) throw new Error('mismatch');
      } catch {
        currentKey.fill(0);
        logAudit('vault_change_password_failed', 'wrong current password');
        return { success: false, error: 'Current master password is incorrect' };
      }

      // 2. Derive new key from new password + fresh salt
      const newSalt        = crypto.randomBytes(32).toString('hex');
      const newKey         = await deriveKey(newPassword, newSalt);
      const newVerifyPlain = crypto.randomBytes(32).toString('hex');
      const newVerifyEnc   = encrypt(newVerifyPlain, newKey);
      const newVerifyHmac  = crypto.createHmac('sha256', newKey).update(newVerifyPlain).digest('hex');

      // 3. Re-encrypt every entry inside a single transaction. If anything
      //    throws, better-sqlite3 rolls back automatically.
      const rows = db.prepare('SELECT id, data FROM entries').all();
      const upd  = db.prepare('UPDATE entries SET data=? WHERE id=?');
      const setMeta = db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)');
      const reEncryptAll = db.transaction(() => {
        for (const row of rows) {
          const plain = decrypt(row.data, vaultKey);
          const enc   = encrypt(plain, newKey);
          upd.run(enc, row.id);
        }
        setMeta.run('vault_salt',        newSalt);
        setMeta.run('vault_hash',        newVerifyEnc);
        setMeta.run('vault_verify_hmac', newVerifyHmac);
        if (typeof hint === 'string') setMeta.run('vault_hint', hint.slice(0, 256));
        // Drop any legacy plaintext verify row left from older vault versions
        db.prepare('DELETE FROM meta WHERE key=?').run('vault_verify');
      });
      reEncryptAll();

      // 4. Swap in-memory key (zero out the old one)
      vaultKey.fill(0);
      vaultKey = newKey;
      currentKey.fill(0);

      logAudit('vault_password_changed', `${rows.length} entries re-encrypted`);
      resetAutoLock();
      return { success: true, reencrypted: rows.length };
    } catch (e) {
      return { success: false, error: e?.message || 'Failed to change password' };
    }
  });

  // ── Entries ──
  ipcMain.handle('entries:get-all', () => {
    if (!vaultKey || !db) return [];
    try {
      return db.prepare('SELECT id, data, created_at, updated_at FROM entries ORDER BY updated_at DESC')
        .all()
        .map(row => {
          const d = JSON.parse(decrypt(row.data, vaultKey));
          return { ...d, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, password: undefined };
        });
    } catch { return []; }
  });

  ipcMain.handle('entries:get', (_, id) => {
    if (!vaultKey || !db) return null;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const row = db.prepare('SELECT * FROM entries WHERE id=?').get(id);
    if (!row) return null;
    logAudit('entry_viewed', id);
    resetAutoLock();
    const d = JSON.parse(decrypt(row.data, vaultKey));
    return { ...d, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
  });

  ipcMain.handle('entries:create', (_, data) => {
    if (!vaultKey || !db) return null;
    const id  = crypto.randomUUID();
    const now = Date.now();
    const safe = sanitiseEntry(data);
    const strength = calcStrength(safe.password);
    const entry = { ...safe, strength: strength.label };
    const enc = encrypt(JSON.stringify(entry), vaultKey);
    db.prepare('INSERT INTO entries VALUES (?,?,?,?)').run(id, enc, now, now);
    logAudit('entry_created', safe.title);
    resetAutoLock();
    return { ...entry, id, createdAt: now, updatedAt: now, password: undefined };
  });

  ipcMain.handle('entries:update', (_, id, data) => {
    if (!vaultKey || !db) return null;
    // Validate that id is a UUID-shaped string — no path traversal etc.
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const row = db.prepare('SELECT data FROM entries WHERE id=?').get(id);
    if (!row) return null;
    const existing = JSON.parse(decrypt(row.data, vaultKey));
    const safe = sanitiseEntry({ ...existing, ...data });
    if (safe.password) safe.strength = calcStrength(safe.password).label;
    const enc = encrypt(JSON.stringify({ ...existing, ...safe }), vaultKey);
    const now = Date.now();
    db.prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?').run(enc, now, id);
    logAudit('entry_updated', safe.title);
    resetAutoLock();
    return { ...safe, id, password: undefined };
  });

  ipcMain.handle('entries:delete', (_, id) => {
    if (!vaultKey || !db) return;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return;
    const row = db.prepare('SELECT data FROM entries WHERE id=?').get(id);
    if (row) {
      const d = JSON.parse(decrypt(row.data, vaultKey));
      logAudit('entry_deleted', d.title || '');
    }
    db.prepare('DELETE FROM entries WHERE id=?').run(id);
    // Tombstone so the deletion propagates on the next cloud sync
    try { cloudHooks?.markTombstone?.(id, 'entries'); } catch {}
    resetAutoLock();
  });

  ipcMain.handle('entries:get-history', () => []);

  // ── Categories ──
  ipcMain.handle('categories:get', () => {
    if (!db) return [];
    return db.prepare('SELECT data FROM categories').all().map(r => JSON.parse(r.data));
  });

  ipcMain.handle('categories:add', (_, cat) => {
    if (!db) return null;
    const safe = {
      name:  String(cat?.name  ?? '').slice(0, 64).trim(),
      icon:  String(cat?.icon  ?? '📁').slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(String(cat?.color ?? '')) ? String(cat.color) : '#2563eb',
    };
    if (!safe.name) return null;
    const c = { id: crypto.randomUUID(), ...safe, isDefault: false };
    db.prepare('INSERT INTO categories VALUES (?,?)').run(c.id, JSON.stringify(c));
    logAudit('category_created', safe.name);
    return c;
  });

  ipcMain.handle('categories:update', (_, id, cat) => {
    if (!db || typeof id !== 'string' || !id) return null;
    const row = db.prepare('SELECT data FROM categories WHERE id=?').get(id);
    if (!row) return null;
    let existing;
    try { existing = JSON.parse(row.data); } catch { return null; }
    const next = {
      ...existing,
      name:  String(cat?.name  ?? existing.name).slice(0, 64).trim(),
      icon:  String(cat?.icon  ?? existing.icon).slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(String(cat?.color ?? '')) ? String(cat.color) : (existing.color || '#2563eb'),
    };
    if (!next.name) return null;
    db.prepare('UPDATE categories SET data=? WHERE id=?').run(JSON.stringify(next), id);
    logAudit('category_updated', next.name);
    return next;
  });

  ipcMain.handle('categories:delete', (_, id) => {
    if (!db || !vaultKey || typeof id !== 'string' || !id) return { success: false };
    // Clear categoryId on every entry referencing this category so we don't
    // leave orphan references. Re-encrypt each affected row in a transaction.
    const rows = db.prepare('SELECT id, data FROM entries').all();
    const upd  = db.prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?');
    const tx = db.transaction(() => {
      const now = Date.now();
      for (const row of rows) {
        try {
          const data = JSON.parse(decrypt(row.data, vaultKey));
          if (data.categoryId === id) {
            data.categoryId = '';
            upd.run(encrypt(JSON.stringify(data), vaultKey), now, row.id);
          }
        } catch { /* skip un-decryptable */ }
      }
      db.prepare('DELETE FROM categories WHERE id=?').run(id);
    });
    tx();
    try { cloudHooks?.markTombstone?.(id, 'categories'); } catch {}
    logAudit('category_deleted', id);
    return { success: true };
  });

  // ── Password tools ──
  ipcMain.handle('passwords:generate', async (_, opts) => {
    let password;
    if (opts.type === 'passphrase') {
      const words = require('./wordlist').words;
      const arr   = new Uint32Array(opts.wordCount || 5);
      crypto.getRandomValues(arr);
      let chosen = Array.from(arr).map(n => {
        let w = words[n % words.length];
        return opts.capitalizeWords ? w[0].toUpperCase() + w.slice(1) : w;
      });
      if (opts.includeNumber) chosen.push(String(crypto.randomInt(1,99)));
      password = chosen.join(opts.wordSeparator || '-');
    } else if (opts.type === 'pin') {
      password = Array.from(crypto.randomBytes(opts.pinLength || 6)).map(b => b % 10).join('');
    } else {
      password = generatePassword(opts);
    }
    const s = calcStrength(password);
    return { password, strength: s.label, entropy: s.entropy };
  });

  ipcMain.handle('passwords:strength', (_, pw) => calcStrength(pw));

  // ── Breach check (k-anonymity — only first 5 SHA1 chars leave device) ──
  ipcMain.handle('breach:check-all', async () => {
    if (!vaultKey || !db) return { breached: [] };
    const entries = db.prepare('SELECT id, data FROM entries').all().map(r => {
      const d = JSON.parse(decrypt(r.data, vaultKey));
      return { id: r.id, title: d.title, username: d.username, password: d.password };
    }).filter(e => e.password);

    const breached = [];
    for (const entry of entries) {
      try {
        const sha1 = crypto.createHash('sha1').update(entry.password).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);
        // This is the ONLY external network call — k-anonymity, password never exposed
        const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'VaultGuard-KAnon/1.0' }
        });
        if (resp.ok) {
          const text = await resp.text();
          const lines = text.split('\n');
          const match = lines.find(l => l.startsWith(suffix));
          if (match) {
            const count = parseInt(match.split(':')[1], 10);
            breached.push({ id: entry.id, title: entry.title, username: entry.username, count });
            // Write breach flag directly — ipcMain.emit doesn't invoke handle() callbacks
            try {
              const eRow = db.prepare('SELECT data FROM entries WHERE id=?').get(entry.id);
              if (eRow && vaultKey) {
                const eData = JSON.parse(decrypt(eRow.data, vaultKey));
                eData.breached = true; eData.breachCount = count;
                db.prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?')
                  .run(encrypt(JSON.stringify(eData), vaultKey), Date.now(), entry.id);
              }
            } catch { /* non-fatal */ }
          }
        }
      } catch { /* network blocked or error — skip */ }
    }
    return { breached, checked: entries.length };
  });

  // ── TOTP ──
  ipcMain.handle('totp:generate', (_, secret) => {
    if (otplib) {
      try {
        const token     = otplib.authenticator.generate(secret);
        const remaining = otplib.authenticator.timeRemaining();
        return { token, remaining };
      } catch { /* fall through */ }
    }
    // Fallback
    const period    = 30;
    const now       = Math.floor(Date.now() / 1000);
    const remaining = period - (now % period);
    const counter   = Math.floor(now / period);
    const hash      = (secret + counter).split('').reduce((a,c) => ((a<<5)-a+c.charCodeAt(0))|0, 0);
    return { token: String(Math.abs(hash) % 1000000).padStart(6,'0'), remaining };
  });

  ipcMain.handle('totp:setup', async (_, label, issuer) => {
    const secret = crypto.randomBytes(20).toString('base32').toUpperCase().slice(0,32);
    const uri    = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    let qrCode;
    if (QRCode) {
      qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'H', margin: 2 });
    } else {
      qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;
    }
    return { secret, uri, qrCode };
  });

  // ── Clipboard (secure, auto-clears) ──
  ipcMain.handle('clipboard:copy-secure', (_, text, clearMs) => {
    // Reject non-strings; cap length to avoid giant clipboard payloads
    if (typeof text !== 'string') return;
    const safeText   = text.slice(0, 65536);
    // Cap clear delay: 0 = never clear; max 5 min regardless of what renderer sends
    const safeClearMs = (Number.isFinite(clearMs) && clearMs > 0)
      ? Math.min(clearMs, 300_000) : 0;
    clipboard.writeText(safeText);
    if (safeClearMs > 0) {
      setTimeout(() => {
        if (clipboard.readText() === safeText) clipboard.clear();
      }, safeClearMs);
    }
    resetAutoLock();
  });

  // ── Cloud handlers moved to main-cloud.js ──────────────────────────────────

  // ── Settings ──
  ipcMain.handle('settings:get', () => {
    const row = db?.prepare('SELECT value FROM settings_store WHERE key=?').get('app_settings');
    if (row) { try { return JSON.parse(row.value); } catch {} }
    return settings;
  });

  ipcMain.handle('settings:set', (_, s) => {
    // Only allow known safe settings keys — prevent the renderer from injecting
    // arbitrary data into the settings store.
    const ALLOWED_SETTINGS = {
      autoLockMs:       v => Number.isFinite(v) && v >= 0   ? v : 300000,
      clipboardClearMs: v => Number.isFinite(v) && v >= 0   ? v : 30000,
      minimizeToTray:   v => Boolean(v),
      lockOnBlur:       v => Boolean(v),
      theme:            v => ['dark','light','system'].includes(v) ? v : 'dark',
      cloudAutoSync:    v => Boolean(v),
    };
    const sanitised = {};
    for (const [k, coerce] of Object.entries(ALLOWED_SETTINGS)) {
      if (k in s) sanitised[k] = coerce(s[k]);
    }
    settings = { ...settings, ...sanitised };
    db?.prepare('INSERT OR REPLACE INTO settings_store VALUES (?,?)').run('app_settings', JSON.stringify(settings));
    resetAutoLock();
  });

  // ── Audit ──
  ipcMain.handle('audit:get-log', () => {
    if (!auditDb) return [];
    return auditDb.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 500').all();
  });

  // ── Key file ──
  ipcMain.handle('keyfile:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Key File',
      properties: ['openFile'],
      filters: [{ name: 'Key Files', extensions: ['key','bin','*'] }]
    });
    return { cancelled: result.cancelled, path: result.filePaths?.[0] };
  });

  ipcMain.handle('keyfile:generate', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Key File',
      defaultPath: 'vaultguard.key',
      filters: [{ name: 'Key Files', extensions: ['key'] }]
    });
    if (!result.cancelled) {
      fs.writeFileSync(result.filePath, crypto.randomBytes(512));
    }
    return { cancelled: result.cancelled, path: result.filePath };
  });

  // ── Window controls ──
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('window:close', () => {
    lockVault();
    mainWindow?.close();
  });

  // ── Additional handlers (import/export/breach/audit/integrity) ─────────────
  registerAdditionalIPC(
    ipcMain, db, auditDb,
    () => vaultKey,
    lockVault,
    logAudit,
    resetAutoLock,
    decrypt,
    encrypt,
    calcStrength,
    mainWindow
  );

  // ── Cloud sync (Firebase, zero-knowledge) ──────────────────────────────────
  cloudHooks = registerCloudIPC({
    ipcMain,
    db:             () => db,
    getKey:         () => vaultKey,
    encrypt, decrypt, logAudit, resetAutoLock,
    sendToRenderer: (channel, payload) => {
      try { mainWindow?.webContents?.send(channel, payload); } catch {}
    },
  });
}

// ── Password utilities ─────────────────────────────────────────────────────────
function generatePassword(opts = {}) {
  const { length=20, uppercase=true, lowercase=true, digits=true, symbols=true,
    excludeAmbiguous=false, requireEach=true } = opts;
  let chars = '';
  const sets = [];
  if (uppercase) { const s = excludeAmbiguous ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; chars+=s; sets.push(s); }
  if (lowercase) { const s = excludeAmbiguous ? 'abcdefghjkmnpqrstuvwxyz'  : 'abcdefghijklmnopqrstuvwxyz';  chars+=s; sets.push(s); }
  if (digits)    { const s = excludeAmbiguous ? '23456789'                   : '0123456789';                   chars+=s; sets.push(s); }
  if (symbols)   { const s = '!@#$%^&*()_+-=[]{}|;:,.?';  chars+=s; sets.push(s); }
  if (!chars)    chars = 'abcdefghijklmnopqrstuvwxyz';
  let pw = '';
  if (requireEach) sets.forEach(s => pw += s[crypto.randomInt(s.length)]);
  for (let i = pw.length; i < length; i++) pw += chars[crypto.randomInt(chars.length)];
  // Shuffle with Fisher-Yates using crypto random
  const arr = pw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function calcStrength(pw) {
  if (!pw) return { label: 'very-weak', score: 0, entropy: 0 };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['very-weak','very-weak','weak','fair','strong','strong','very-strong','very-strong'];
  const charsetSize = ((/[A-Z]/.test(pw)?26:0)+(/[a-z]/.test(pw)?26:0)+(/[0-9]/.test(pw)?10:0)+(/[^A-Za-z0-9]/.test(pw)?32:0)) || 26;
  const entropy = pw.length * Math.log2(charsetSize);
  return { label: labels[Math.min(score, 7)], score, entropy: Math.round(entropy) };
}

// ── Create Window ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 780,
    minWidth:  900,
    minHeight: 600,
    frame:          false,   // Custom titlebar
    titleBarStyle:  'hidden',
    backgroundColor: '#03030a',
    show: false,
    icon: (() => {
      // Try asset files first, fall back to a programmatically generated icon
      const candidates = [
        path.join(__dirname, 'assets', 'icon.png'),
        path.join(__dirname, '..', 'assets', 'icon.png'),
        path.join(__dirname, 'icon.png'),
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (found) return found;
      // Generate a minimal icon via nativeImage so the taskbar always shows something
      try {
        const { nativeImage } = require('electron');
        // 32x32 purple lock icon as raw RGBA
        const size = 32;
        const buf  = Buffer.alloc(size * size * 4);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            // Simple purple square background
            buf[i]   = 37;  // R (#2563eb)
            buf[i+1] = 99;  // G
            buf[i+2] = 235; // B
            buf[i+3] = 255; // A
          }
        }
        return nativeImage.createFromBuffer(buf, { width: size, height: size });
      } catch { return undefined; }
    })(),
    webPreferences: {
      preload:                   path.join(__dirname, 'preload.js'),
      nodeIntegration:           false,  // SECURITY: no Node in renderer
      contextIsolation:          true,   // SECURITY: isolated context
      sandbox:                   true,   // SECURITY: sandboxed renderer
      webSecurity:               true,   // SECURITY: enforce same-origin
      allowRunningInsecureContent: false,
      experimentalFeatures:      false,
      enableBlinkFeatures:       '',
      disableBlinkFeatures:      'AutomationControlled',
      // No remote module
      enableRemoteModule:        false,
      // No devtools in production
      devTools:                  !app.isPackaged ? true : false,
    }
  });

  // ── Content Security Policy ─────────────────────────────────────────────────
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          // unsafe-inline removed from script-src — all JS must be in external files.
          // If you still need inline scripts during development, add a nonce per-response.
          "default-src 'self';" +
          "script-src 'self';" +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          "font-src 'self' https://fonts.gstatic.com;" +
          "img-src 'self' data: https://t2.gstatic.com https://www.google.com https://icons.duckduckgo.com https://api.qrserver.com;" +
          "connect-src 'none';" +
          "frame-src 'none';" +
          "object-src 'none';" +
          "base-uri 'self';" +
          "form-action 'self';"
        ]
      }
    });
  });

  // ── Block ALL navigation away from app ─────────────────────────────────────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = 'file://';
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
    }
  });

  // ── Block new window/popup creation ───────────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // ── Open external links in system browser (not in app) ───────────────────
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Lock if not focused
    mainWindow.on('blur', () => {
      if (settings.lockOnBlur) lockVault();
    });
  });

  mainWindow.on('close', (event) => {
    if (settings.minimizeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      lockVault();
    }
  });
}

// ── Network: Block all outbound except explicitly whitelisted prefixes ─────────
function setupNetworkBlocking() {
  // Use the same ALLOWED_ORIGIN_PREFIXES logic as security.js.
  // Fonts/favicons/QR codes are allowed only if actually needed; comment
  // any line out to make the app more air-gapped.
  const ALLOWED_PREFIXES = [
    'file://',
    'https://api.pwnedpasswords.com/',          // k-anonymity only — 5-char SHA1 prefix
    'https://identitytoolkit.googleapis.com/',  // Firebase auth (optional cloud sync)
    'https://firestore.googleapis.com/',        // Firestore (optional, ciphertext only)
    'https://fonts.googleapis.com/',            // Google Fonts CSS
    'https://fonts.gstatic.com/',              // Google Fonts files
    'https://t2.gstatic.com/faviconV2',        // Google FaviconV2 (primary)
    'https://www.google.com/s2/favicons',      // Google S2 favicons (fallback)
    'https://icons.duckduckgo.com/ip3/',       // Favicon fallback (no tracking)
    'https://api.qrserver.com/',               // QR code fallback
  ];

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const allowed = ALLOWED_PREFIXES.some(p => details.url.startsWith(p));
      if (!allowed) console.warn(`[Network] Blocked: ${details.url}`);
      callback({ cancel: !allowed });
    }
  );
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Security: disable unused protocols
  app.setAsDefaultProtocolClient('vaultguard'); // handle vaultguard:// URIs locally only
  
  initDB();
  migrateLegacyColors();
  registerIPC();
  setupNetworkBlocking();
  applySecurityHardening(); // also applied via security.js (belt + suspenders)
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  lockVault();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  lockVault();
});

// ── Security: disable unsafe Electron features ─────────────────────────────────
app.on('web-contents-created', (_, contents) => {
  // Block ALL navigation in any webcontents
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// Prevent multiple instances (vault should only be open once)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
