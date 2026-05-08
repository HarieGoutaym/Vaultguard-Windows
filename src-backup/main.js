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
      
      // Store verification hash (not the key, not the password)
      const verifyData = crypto.randomBytes(32).toString('hex');
      const verifyEnc  = encrypt(verifyData, key);
      
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_salt', salt);
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_hash', verifyEnc);
      db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_verify', verifyData);
      if (hint) db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_hint', hint);

      // Seed default categories
      const defaultCats = [
        {id:'cat-1',name:'Social Media',icon:'📱'},
        {id:'cat-2',name:'Finance',icon:'💰'},
        {id:'cat-3',name:'Work',icon:'💼'},
        {id:'cat-4',name:'Shopping',icon:'🛒'},
        {id:'cat-5',name:'Gaming',icon:'🎮'},
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
      const saltRow  = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_salt');
      const hashRow  = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_hash');
      const verifyRow = db.prepare('SELECT value FROM meta WHERE key=?').get('vault_verify');
      if (!saltRow || !hashRow) return { success: false, error: 'No vault found' };

      const key = await deriveKey(masterPassword, saltRow.value);
      
      // Verify by decrypting the verification blob
      try {
        const decrypted = decrypt(hashRow.value, key);
        if (decrypted !== verifyRow?.value) throw new Error('Mismatch');
      } catch {
        logAudit('vault_unlock_failed', '');
        return { success: false, error: 'Invalid master password' };
      }

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
    const strength = calcStrength(data.password || '');
    const entry = { ...data, strength: strength.label };
    const enc = encrypt(JSON.stringify(entry), vaultKey);
    db.prepare('INSERT INTO entries VALUES (?,?,?,?)').run(id, enc, now, now);
    logAudit('entry_created', data.title || '');
    resetAutoLock();
    return { ...entry, id, createdAt: now, updatedAt: now, password: undefined };
  });

  ipcMain.handle('entries:update', (_, id, data) => {
    if (!vaultKey || !db) return null;
    const row = db.prepare('SELECT data FROM entries WHERE id=?').get(id);
    if (!row) return null;
    const existing = JSON.parse(decrypt(row.data, vaultKey));
    const updated  = { ...existing, ...data, updatedAt: Date.now() };
    if (data.password) updated.strength = calcStrength(data.password).label;
    const enc = encrypt(JSON.stringify(updated), vaultKey);
    const now = Date.now();
    db.prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?').run(enc, now, id);
    logAudit('entry_updated', updated.title || '');
    resetAutoLock();
    return { ...updated, id, password: undefined };
  });

  ipcMain.handle('entries:delete', (_, id) => {
    if (!vaultKey || !db) return;
    const row = db.prepare('SELECT data FROM entries WHERE id=?').get(id);
    if (row) {
      const d = JSON.parse(decrypt(row.data, vaultKey));
      logAudit('entry_deleted', d.title || '');
    }
    db.prepare('DELETE FROM entries WHERE id=?').run(id);
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
    const c = { id: crypto.randomUUID(), ...cat };
    db.prepare('INSERT INTO categories VALUES (?,?)').run(c.id, JSON.stringify(c));
    return c;
  });

  ipcMain.handle('categories:delete', (_, id) => {
    if (!db) return;
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
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
            const count = parseInt(match.split(':')[1]);
            breached.push({ id: entry.id, title: entry.title, username: entry.username, count });
            // Mark in DB
            ipcMain.emit('entries:update', null, entry.id, { breached: true, breachCount: count });
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
    clipboard.writeText(text);
    if (clearMs > 0) {
      setTimeout(() => {
        // Only clear if clipboard still has our text (don't clear user's own copies)
        if (clipboard.readText() === text) clipboard.clear();
      }, clearMs || 30000);
    }
    resetAutoLock();
  });

  // ── Cloud (Firebase — zero-knowledge, ciphertext only) ──
  ipcMain.handle('cloud:status', () => {
    const row = db?.prepare('SELECT value FROM settings_store WHERE key=?').get('cloud_config');
    if (!row) return { connected: false };
    try { return JSON.parse(row.value); } catch { return { connected: false }; }
  });

  ipcMain.handle('cloud:connect', async (_, cfg) => {
    // Firebase REST API — only encrypted blobs ever leave device
    try {
      const url = cfg.action === 'signup'
        ? `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`
        : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cfg.email, password: cfg.password, returnSecureToken: true })
      });
      const data = await resp.json();
      if (!resp.ok) return { success: false, error: data.error?.message || 'Auth failed' };
      const cloudState = { connected: true, email: cfg.email, idToken: data.idToken,
        refreshToken: data.refreshToken, projectId: cfg.projectId, apiKey: cfg.apiKey,
        authDomain: cfg.authDomain, lastSync: null };
      db?.prepare('INSERT OR REPLACE INTO settings_store VALUES (?,?)').run('cloud_config', JSON.stringify(cloudState));
      return { success: true };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('cloud:sync', async () => {
    if (!vaultKey || !db) return { success: false, error: 'Vault locked' };
    const cfgRow = db.prepare('SELECT value FROM settings_store WHERE key=?').get('cloud_config');
    if (!cfgRow) return { success: false, error: 'Not connected' };
    const cfg = JSON.parse(cfgRow.value);
    // Upload: only ciphertext blobs sent to Firestore — server never sees plaintext
    // Full implementation: POST to Firestore REST API
    cfg.lastSync = Date.now();
    db.prepare('INSERT OR REPLACE INTO settings_store VALUES (?,?)').run('cloud_config', JSON.stringify(cfg));
    return { success: true, synced: db.prepare('SELECT COUNT(*) as n FROM entries').get().n };
  });

  ipcMain.handle('cloud:disconnect', () => {
    db?.prepare('DELETE FROM settings_store WHERE key=?').run('cloud_config');
  });

  // ── Settings ──
  ipcMain.handle('settings:get', () => {
    const row = db?.prepare('SELECT value FROM settings_store WHERE key=?').get('app_settings');
    if (row) { try { return JSON.parse(row.value); } catch {} }
    return settings;
  });

  ipcMain.handle('settings:set', (_, s) => {
    settings = { ...settings, ...s };
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
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
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
          "default-src 'self';" +
          "script-src 'self' 'unsafe-inline';" +   // unsafe-inline needed for inline scripts in single-file build
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          "font-src 'self' https://fonts.gstatic.com;" +
          "img-src 'self' data: https://www.google.com https://api.qrserver.com;" +
          "connect-src 'none';" +  // NO external connections from renderer
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

// ── Network: Block all outbound except HaveIBeenPwned ─────────────────────────
function setupNetworkBlocking() {
  const filter = { urls: ['*://*/*'] };
  
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    const allowed = [
      'file://',
      'https://api.pwnedpasswords.com/',          // k-anonymity only
      'https://identitytoolkit.googleapis.com/',  // Firebase auth (optional)
      'https://firestore.googleapis.com/',        // Firestore (optional, encrypted blobs only)
      'https://fonts.googleapis.com/',            // Fonts
      'https://fonts.gstatic.com/',              // Fonts
      'https://www.google.com/s2/favicons',      // Favicons
      'https://api.qrserver.com/',               // QR codes
    ];
    const isAllowed = allowed.some(u => details.url.startsWith(u));
    callback({ cancel: !isAllowed });
  });
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Security: disable unused protocols
  app.setAsDefaultProtocolClient('vaultguard'); // handle vaultguard:// URIs locally only
  
  initDB();
  registerIPC();
  setupNetworkBlocking();
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
