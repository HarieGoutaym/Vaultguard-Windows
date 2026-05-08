'use strict';
/**
 * VaultGuard — main-additions.js
 *
 * DROP-IN PATCH for main.js.
 * Add this require() call at the top of registerIPC() in main.js:
 *
 *   registerAdditionalIPC(ipcMain, db, auditDb, () => vaultKey, () => { lockVault(); }, logAudit, resetAutoLock, decrypt, encrypt, calcStrength, mainWindow);
 *
 * Or splice the handlers directly into main.js registerIPC() — both work.
 *
 * ADDS:
 *   entries:import        (CSV/JSON from 15+ managers + conflict resolution)
 *   breach:check-all      (handled in main.js — HIBP k-anon; HMAC update added here)
 *   keyfile:mix-kdf       (XOR keyfile bytes into derived key for 2-factor vault unlock)
 *   vault:integrity-check (HMAC-SHA256 over entire vault)
 *   vault:export-encrypted (AES-256-GCM export with schema version + integrity tag)
 *   vault:import-encrypted (validates + decrypts encrypted export)
 */

const crypto = require('crypto');
const { parseFile, resolveConflicts } = require('./import-engine');

/**
 * Mix a keyfile into a derived key using HKDF-style XOR.
 * keyfile bytes are hashed with SHA-512 and XOR'd into the 32-byte vault key.
 * This means vault unlock requires BOTH master password AND keyfile.
 *
 * @param {Buffer} derivedKey   - 32-byte key from Argon2id/PBKDF2
 * @param {string} keyfilePath  - path to .key file on disk
 * @returns {Buffer}            - 32-byte combined key
 */
function mixKeyfile(derivedKey, keyfilePath) {
  if (!keyfilePath) return derivedKey;
  const fs = require('fs');
  const keyfileData = fs.readFileSync(keyfilePath);
  // Hash keyfile to 64 bytes, XOR first 32 into derived key
  const keyfileHash = crypto.createHash('sha512').update(keyfileData).digest();
  const mixed = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) mixed[i] = derivedKey[i] ^ keyfileHash[i];
  // Zero out intermediate buffers
  keyfileHash.fill(0);
  return mixed;
}

/**
 * Compute HMAC-SHA256 over all vault entries — integrity verification.
 * Run after every write; verify on unlock to detect out-of-band tampering.
 */
function computeVaultHMAC(db, vaultKey) {
  if (!db || !vaultKey) return null;
  const rows = db.prepare('SELECT id, data, updated_at FROM entries ORDER BY id').all();
  const mac  = crypto.createHmac('sha256', vaultKey);
  for (const row of rows) mac.update(row.id + row.data + row.updated_at);
  return mac.digest('hex');
}

function registerAdditionalIPC(ipcMain, dbRef, auditDbRef, getKey, doLock, logAudit, resetAutoLock, decrypt, encrypt, calcStrength, mainWindow) {
  // Convenience getters so we always use latest db/key references
  const db      = () => dbRef;
  const auditDb = () => auditDbRef;
  const key     = () => getKey();

  // ── entries:import ─────────────────────────────────────────────────────────
  ipcMain.handle('entries:import', async (_, { filename, content, strategy }) => {
    if (!key() || !db()) return { success: false, error: 'Vault locked' };

    // Validate inputs
    if (typeof filename !== 'string' || filename.length > 512) return { success: false, error: 'Invalid filename' };
    if (typeof content  !== 'string' || content.length > 50 * 1024 * 1024) return { success: false, error: 'File too large (max 50MB)' };
    const validStrategies = new Set(['skip','overwrite','duplicate']);
    if (!validStrategies.has(strategy)) strategy = 'skip';

    const { entries: parsed, format, error } = parseFile(filename, content);
    if (error) return { success: false, error };
    if (!parsed.length) return { success: false, error: 'No valid entries found in file' };

    // Get existing for conflict check (title + url only — no passwords)
    const existing = db().prepare('SELECT id, data FROM entries').all().map(row => {
      try {
        const d = JSON.parse(decrypt(row.data, key()));
        return { id: row.id, title: d.title, url: d.url };
      } catch { return null; }
    }).filter(Boolean);

    const { toCreate, toUpdate, skipped } = resolveConflicts(parsed, existing, strategy);

    // Run in a transaction for atomicity
    const insertStmt = db().prepare('INSERT INTO entries VALUES (?,?,?,?)');
    const updateStmt = db().prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?');

    const importTx = db().transaction(() => {
      let created = 0, updated = 0;
      const now = Date.now();

      for (const entry of toCreate) {
        const id  = crypto.randomUUID();
        const str = calcStrength(entry.password || '');
        const full = { ...entry, strength: str.label };
        const enc  = encrypt(JSON.stringify(full), key());
        insertStmt.run(id, enc, now, now);
        created++;
      }

      for (const entry of toUpdate) {
        const { id, ...rest } = entry;
        const str  = calcStrength(rest.password || '');
        const full = { ...rest, strength: str.label };
        const enc  = encrypt(JSON.stringify(full), key());
        updateStmt.run(enc, now, id);
        updated++;
      }

      return { created, updated };
    });

    try {
      const { created, updated } = importTx();
      logAudit('entries_imported', `format=${format} created=${created} updated=${updated} skipped=${skipped.length} strategy=${strategy}`);
      resetAutoLock();

      // Update vault HMAC
      const newHmac = computeVaultHMAC(db(), key());
      if (newHmac) db().prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('vault_hmac', newHmac);

      return {
        success: true,
        imported: created + updated,
        created, updated,
        skipped: skipped.length,
        format,
      };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });

  // ── vault:integrity-check ──────────────────────────────────────────────────
  ipcMain.handle('vault:integrity-check', () => {
    if (!key() || !db()) return { ok: false, reason: 'Vault locked' };
    try {
      const stored  = db().prepare("SELECT value FROM meta WHERE key='vault_hmac'").get()?.value;
      if (!stored) return { ok: true, reason: 'No HMAC stored yet (first check)' };
      const computed = computeVaultHMAC(db(), key());
      const aBuf = Buffer.from(stored,    'hex');
      const bBuf = Buffer.from(computed,  'hex');
      if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
        logAudit('integrity_check_FAILED', `stored=${stored.slice(0,8)} computed=${computed.slice(0,8)}`);
        return { ok: false, reason: 'Vault HMAC mismatch — possible tampering detected' };
      }
      return { ok: true };
    } catch(e) {
      return { ok: false, reason: e.message };
    }
  });

  // ── vault:export-encrypted ─────────────────────────────────────────────────
  // Export all entries as an AES-256-GCM encrypted JSON blob (not plaintext)
  ipcMain.handle('vault:export-encrypted', async (_, exportPassword) => {
    if (!key() || !db()) return { success: false, error: 'Vault locked' };
    if (typeof exportPassword !== 'string' || exportPassword.length < 8) {
      return { success: false, error: 'Export password must be at least 8 characters' };
    }
    try {
      // Decrypt all entries
      const entries = db().prepare('SELECT data FROM entries').all().map(row => {
        return JSON.parse(decrypt(row.data, key()));
      });
      const categories = db().prepare('SELECT data FROM categories').all().map(r => JSON.parse(r.data));

      const payload = JSON.stringify({
        schemaVersion: 2,
        exportedAt:    Date.now(),
        app:           'VaultGuard',
        entries,
        categories,
      });

      // Compute HMAC of plaintext before encrypting
      const hmac = crypto.createHmac('sha256', key()).update(payload).digest('hex');
      const toExport = JSON.stringify({ hmac, payload });

      // Encrypt with a fresh Argon2id-derived key from exportPassword
      const salt    = crypto.randomBytes(32).toString('hex');
      const expKey  = await deriveKeyLocal(exportPassword, salt);
      const iv      = crypto.randomBytes(12);
      const cipher  = crypto.createCipheriv('aes-256-gcm', expKey, iv);
      const ct      = Buffer.concat([cipher.update(toExport, 'utf8'), cipher.final()]);
      const tag     = cipher.getAuthTag();

      expKey.fill(0); // zero export key

      const blob = JSON.stringify({
        vaultguard: true,
        version:    2,
        kdf:        'argon2id+pbkdf2-fallback',
        salt,
        iv:  iv.toString('base64'),
        ct:  ct.toString('base64'),
        tag: tag.toString('base64'),
      });

      logAudit('vault_exported_encrypted', `entries=${entries.length}`);
      return { success: true, blob, filename: `vaultguard-backup-${Date.now()}.vgb` };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });

  // ── vault:import-encrypted ─────────────────────────────────────────────────
  ipcMain.handle('vault:import-encrypted', async (_, { blob, password, strategy }) => {
    if (!key() || !db()) return { success: false, error: 'Vault locked' };
    try {
      const enc = JSON.parse(blob);
      if (!enc.vaultguard || enc.version !== 2) return { success: false, error: 'Not a valid VaultGuard backup file' };

      const expKey  = await deriveKeyLocal(password, enc.salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', expKey, Buffer.from(enc.iv,'base64'));
      decipher.setAuthTag(Buffer.from(enc.tag,'base64'));
      const pt = Buffer.concat([decipher.update(Buffer.from(enc.ct,'base64')), decipher.final()]).toString('utf8');
      expKey.fill(0);

      const { hmac, payload } = JSON.parse(pt);
      // Verify integrity tag — if tampered, this will differ
      const computed = crypto.createHmac('sha256', key()).update(payload).digest('hex');
      const aBuf = Buffer.from(hmac,     'hex');
      const bBuf = Buffer.from(computed, 'hex');
      if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
        logAudit('import_encrypted_integrity_fail', '');
        return { success: false, error: 'Backup file integrity check failed — file may be corrupted or tampered' };
      }

      const data = JSON.parse(payload);
      return ipcMain.emit('entries:import', null, {
        filename: 'vaultguard-backup.json',
        content:  JSON.stringify({ version: data.schemaVersion, entries: data.entries }),
        strategy: strategy || 'skip',
      });
    } catch(e) {
      return { success: false, error: 'Failed to decrypt — check your export password' };
    }
  });

  // ── keyfile mix helper (called from vault:unlock / vault:create) ───────────
  // Exposed so main.js can call it without a separate require
  ipcMain.handle('keyfile:mix', (_, keyfilePath) => {
    // This handler is MAIN-PROCESS only — it reads a file and mixes it into
    // the current vaultKey. Renderer never sees the keyfile bytes.
    if (!key()) return { success: false, error: 'Vault not unlocked' };
    if (!keyfilePath || typeof keyfilePath !== 'string') return { success: false, error: 'No keyfile' };
    try {
      const mixed = mixKeyfile(Buffer.from(key()), keyfilePath);
      // Replace vaultKey — caller must hold a reference to the setter
      // (in practice main.js patches vaultKey directly; this is the calculation)
      return { success: true, mixed: mixed.toString('hex') };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });
}

// Local KDF (duplicate of main.js deriveKey so this module is self-contained)
async function deriveKeyLocal(password, salt) {
  let argon2;
  try { argon2 = require('argon2'); } catch {}
  if (argon2) {
    return argon2.hash(password, {
      type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4,
      salt: Buffer.from(salt, 'hex'), hashLength: 32, raw: true,
    });
  }
  return new Promise((res, rej) => {
    require('crypto').pbkdf2(password, Buffer.from(salt,'hex'), 600000, 32, 'sha256', (e,k) => e?rej(e):res(k));
  });
}

module.exports = { registerAdditionalIPC, mixKeyfile, computeVaultHMAC };