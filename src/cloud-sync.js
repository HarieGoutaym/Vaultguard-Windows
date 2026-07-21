'use strict';
/**
 * VaultGuard — Cloud Sync Engine (Firebase Firestore, REST-only)
 *
 * Zero-knowledge model:
 *   • Master password NEVER leaves the device.
 *   • The 32-byte vault key derived from Argon2id is held in RAM only while
 *     the vault is unlocked. It is NOT uploaded.
 *   • Entries, categories, vault metadata, audit summaries — everything goes
 *     up as AES-256-GCM ciphertext blobs. Firestore stores opaque JSON; Google
 *     never sees plaintext.
 *   • The KDF salt + a verifier blob (random token encrypted with the key) ARE
 *     uploaded so that a second device (Android / browser) can re-derive the
 *     same key from the same master password and read the vault.
 *
 * Why REST (not the Firebase Web SDK)?
 *   • No 600 KB dependency to bundle into Electron.
 *   • Works the same in the main process as in any other Node app — easy to
 *     reuse for a future CLI sync tool.
 *   • The Android app uses the native Firebase SDK and the browser uses the
 *     web SDK; both produce the same documents we read/write here. The wire
 *     format is what makes interop work, not a shared library.
 *
 * Wire format / schema: see SCHEMA.md (companion file).
 */

const https  = require('https');
const crypto = require('crypto');

const FIRESTORE_HOST = 'firestore.googleapis.com';
const IDP_HOST       = 'identitytoolkit.googleapis.com';
const TOKEN_HOST     = 'securetoken.googleapis.com';

// ── Minimal HTTPS helper (no external deps) ───────────────────────────────────
function httpsRequest(method, host, path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const req  = https.request({
      method, host, path,
      headers: {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'User-Agent':     'VaultGuard-Sync/1.0',
        ...(body ? { 'Content-Length': body.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  ()  => {
        const buf  = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { _raw: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const err = new Error(parsed?.error?.message || `HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.body   = parsed;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20_000, () => req.destroy(new Error('Network timeout')));
    if (body) req.write(body);
    req.end();
  });
}

// ── Firestore typed-value <-> JS conversion ───────────────────────────────────
// Firestore REST API uses a verbose "typed" JSON format. We always store the
// encrypted blob as a single `stringValue` to keep it short and binary-safe.
function toFirestoreValue(v) {
  if (v === null || v === undefined)        return { nullValue: null };
  if (typeof v === 'boolean')               return { booleanValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number')                return { doubleValue: v };
  if (typeof v === 'string')                return { stringValue: v };
  if (Array.isArray(v))                     return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const out = {};
    for (const [k, vv] of Object.entries(v)) out[k] = toFirestoreValue(vv);
    return { mapValue: { fields: out } };
  }
  return { stringValue: String(v) };
}

function fromFirestoreValue(fv) {
  if (!fv) return null;
  if ('nullValue'    in fv) return null;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return parseInt(fv.integerValue, 10);
  if ('doubleValue'  in fv) return fv.doubleValue;
  if ('stringValue'  in fv) return fv.stringValue;
  if ('timestampValue' in fv) return new Date(fv.timestampValue).getTime();
  if ('arrayValue'   in fv) return (fv.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue'     in fv) {
    const out = {};
    for (const [k, vv] of Object.entries(fv.mapValue.fields || {})) out[k] = fromFirestoreValue(vv);
    return out;
  }
  return null;
}

function fromFirestoreDoc(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) out[k] = fromFirestoreValue(v);
  // Last segment of doc.name is the document ID
  out._id        = doc.name?.split('/').pop();
  out._updatedAt = doc.updateTime ? new Date(doc.updateTime).getTime() : 0;
  return out;
}

// ── CloudSync class ───────────────────────────────────────────────────────────
class CloudSync {
  /**
   * @param {Object} cfg       Persisted cloud config (apiKey, projectId, idToken, refreshToken, uid, ...)
   * @param {Object} deps      { db, getKey, encrypt, decrypt, logAudit }
   */
  constructor(cfg, deps) {
    this.cfg  = cfg;
    this.deps = deps;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  static async signIn(apiKey, email, password) {
    return CloudSync._authCall(apiKey, 'accounts:signInWithPassword', { email, password, returnSecureToken: true });
  }
  static async signUp(apiKey, email, password) {
    return CloudSync._authCall(apiKey, 'accounts:signUp', { email, password, returnSecureToken: true });
  }
  static async _authCall(apiKey, endpoint, body) {
    const data = await httpsRequest('POST', IDP_HOST, `/v1/${endpoint}?key=${encodeURIComponent(apiKey)}`, {}, body);
    return {
      idToken:      data.idToken,
      refreshToken: data.refreshToken,
      uid:          data.localId,
      email:        data.email,
      expiresIn:    parseInt(data.expiresIn, 10) || 3600,
      issuedAt:     Date.now(),
    };
  }

  // Refresh idToken if it's within 5 minutes of expiry. Called before every
  // Firestore request — Firebase ID tokens expire after exactly 1 hour.
  async ensureFreshToken() {
    const c = this.cfg;
    const expiresAt = (c.issuedAt || 0) + ((c.expiresIn || 3600) * 1000);
    if (Date.now() < expiresAt - 5 * 60 * 1000) return;
    if (!c.refreshToken) throw new Error('No refresh token — please re-authenticate');
    const data = await httpsRequest('POST', TOKEN_HOST,
      `/v1/token?key=${encodeURIComponent(c.apiKey)}`,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      null,
    ).catch(() => null);
    // The token endpoint actually needs form-encoded body, not JSON. Redo properly:
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(c.refreshToken)}`;
    const fresh = await new Promise((resolve, reject) => {
      const req = https.request({
        method: 'POST', host: TOKEN_HOST,
        path: `/v1/token?key=${encodeURIComponent(c.apiKey)}`,
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end',  ()  => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (parsed.error) return reject(new Error(parsed.error.message || 'Token refresh failed'));
            resolve(parsed);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15_000, () => req.destroy(new Error('Token refresh timeout')));
      req.write(body);
      req.end();
    });
    this.cfg.idToken      = fresh.id_token || fresh.access_token;
    this.cfg.refreshToken = fresh.refresh_token || this.cfg.refreshToken;
    this.cfg.expiresIn    = parseInt(fresh.expires_in, 10) || 3600;
    this.cfg.issuedAt     = Date.now();
  }

  authHeaders() {
    return { 'Authorization': `Bearer ${this.cfg.idToken}` };
  }

  basePath() {
    return `/v1/projects/${this.cfg.projectId}/databases/(default)/documents/vaults/${this.cfg.uid}`;
  }

  // ── Low-level Firestore CRUD ────────────────────────────────────────────────
  async _patchDoc(relPath, fields, updateMask) {
    await this.ensureFreshToken();
    const mask = updateMask ? '&' + updateMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&') : '';
    // currentDocument.exists=false would force create-only; we want upsert, so omit.
    return httpsRequest('PATCH', FIRESTORE_HOST,
      `${this.basePath()}/${relPath}?${mask.slice(1) || ''}`,
      this.authHeaders(),
      { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)])) },
    );
  }

  async _getDoc(relPath) {
    await this.ensureFreshToken();
    try {
      return await httpsRequest('GET', FIRESTORE_HOST, `${this.basePath()}/${relPath}`, this.authHeaders(), null);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async _listDocs(collection, pageToken) {
    await this.ensureFreshToken();
    let path = `${this.basePath()}/${collection}?pageSize=300`;
    if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
    return httpsRequest('GET', FIRESTORE_HOST, path, this.authHeaders(), null);
  }

  async _listSince(collection, sinceMs) {
    // Firestore REST has no "where" on list — use runQuery (structured query)
    await this.ensureFreshToken();
    const body = {
      structuredQuery: {
        from:  [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field:  { fieldPath: 'clientUpdatedAt' },
            op:     'GREATER_THAN',
            value:  { integerValue: String(sinceMs || 0) },
          },
        },
        orderBy: [{ field: { fieldPath: 'clientUpdatedAt' }, direction: 'ASCENDING' }],
        limit:   1000,
      },
    };
    const parent = `/v1/projects/${this.cfg.projectId}/databases/(default)/documents/vaults/${this.cfg.uid}`;
    const res = await httpsRequest('POST', FIRESTORE_HOST, `${parent}:runQuery`, this.authHeaders(), body);
    return (res || []).map(r => r.document).filter(Boolean);
  }

  // ── Vault meta (salt + verifier — uploaded once, read by every device) ─────
  async pushVaultMeta() {
    const db = this.deps.db();
    const salt        = db.prepare("SELECT value FROM meta WHERE key='vault_salt'").get()?.value;
    const verifyEnc   = db.prepare("SELECT value FROM meta WHERE key='vault_hash'").get()?.value;
    const verifyHmac  = db.prepare("SELECT value FROM meta WHERE key='vault_verify_hmac'").get()?.value;
    const hint        = db.prepare("SELECT value FROM meta WHERE key='vault_hint'").get()?.value;
    if (!salt || !verifyEnc) throw new Error('Vault metadata missing');
    await this._patchDoc('meta/vault', {
      schemaVersion: 2,
      kdf:           'argon2id',
      kdfMemoryKiB:  65536,
      kdfIterations: 3,
      kdfParallel:   4,
      keyLength:     32,
      salt,
      verifyEnc,
      verifyHmac:    verifyHmac || '',
      hint:          hint || '',
      updatedAt:     Date.now(),
    });
  }

  async pullVaultMeta() {
    const doc = await this._getDoc('meta/vault');
    return doc ? fromFirestoreDoc(doc) : null;
  }

  // ── Push: encrypt each row again with a fresh IV+tag so the cloud copy is
  //          a *separate* AES-256-GCM ciphertext (defence-in-depth: even if a
  //          server-side IV/tag is leaked, the local DB still has its own).
  //          The KEY is the same vault key — only the device knows it. ──────
  encryptForCloud(plaintext) {
    const key    = this.deps.getKey();
    if (!key) throw new Error('Vault locked');
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return JSON.stringify({
      v:  2,
      iv: iv.toString('base64'),
      ct: ct.toString('base64'),
      tag: tag.toString('base64'),
    });
  }

  decryptFromCloud(blob) {
    const key = this.deps.getKey();
    if (!key) throw new Error('Vault locked');
    const { iv, ct, tag } = JSON.parse(blob);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  }

  // ── Full bidirectional sync ────────────────────────────────────────────────
  /**
   * Strategy:
   *   1. Pull remote changes since cfg.lastPullAt (server-side filter).
   *   2. For each remote doc: if local missing OR remote.clientUpdatedAt > local.updatedAt,
   *      decrypt remote and write to local DB. Tombstones (deleted:true) delete locally.
   *   3. Push local changes since cfg.lastPushAt: encrypt + upload.
   *   4. Update cfg.lastSync / lastPullAt / lastPushAt.
   *
   * Conflict resolution: last-write-wins per entry, based on clientUpdatedAt
   * (the device's local clock at write time). Acceptable because users rarely
   * edit the same entry on two devices within milliseconds. For finer-grained
   * merging we'd need CRDTs — overkill for a password vault.
   */
  async sync({ onProgress } = {}) {
    if (!this.deps.getKey()) throw new Error('Vault locked');
    const db = this.deps.db();
    const stats = { pulledEntries: 0, pulledCategories: 0, pushedEntries: 0, pushedCategories: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0 };

    const lastPullAt = this.cfg.lastPullAt || 0;
    const lastPushAt = this.cfg.lastPushAt || 0;
    const startedAt  = Date.now();

    onProgress?.('meta', 'Uploading vault metadata');
    // Ensure meta is uploaded (idempotent — only one document, cheap)
    await this.pushVaultMeta();

    // ── PULL entries ─────────────────────────────────────────────────────────
    onProgress?.('pull', 'Pulling remote changes');
    const remoteEntries = await this._listSince('entries', lastPullAt);
    for (const doc of remoteEntries) {
      const d = fromFirestoreDoc(doc);
      if (!d?._id) continue;
      const local = db.prepare('SELECT updated_at FROM entries WHERE id=?').get(d._id);
      if (d.deleted) {
        if (local) {
          db.prepare('DELETE FROM entries WHERE id=?').run(d._id);
          stats.deletedLocal++;
        }
        continue;
      }
      if (!d.ciphertext) continue;
      const remoteUpdated = d.clientUpdatedAt || d._updatedAt || 0;
      if (local && local.updated_at >= remoteUpdated) { stats.conflicts++; continue; }
      try {
        const plaintext = this.decryptFromCloud(d.ciphertext);
        // Re-encrypt with the *local* envelope (separate IV) so DB-level audit
        // matches existing entries' format.
        const enc = this.deps.encrypt(plaintext, this.deps.getKey());
        const now = remoteUpdated || Date.now();
        if (local) {
          db.prepare('UPDATE entries SET data=?, updated_at=? WHERE id=?').run(enc, now, d._id);
        } else {
          db.prepare('INSERT INTO entries (id, data, created_at, updated_at) VALUES (?,?,?,?)')
            .run(d._id, enc, d.createdAt || now, now);
        }
        stats.pulledEntries++;
      } catch (e) {
        // Decryption failure typically means wrong key (different master pw on
        // this device than the one used on the writing device). Surface but
        // don't abort the whole sync.
        this.deps.logAudit?.('cloud_decrypt_failed', `entry=${d._id}: ${e.message}`);
      }
    }

    // ── PULL categories ──────────────────────────────────────────────────────
    const remoteCats = await this._listSince('categories', lastPullAt);
    for (const doc of remoteCats) {
      const d = fromFirestoreDoc(doc);
      if (!d?._id) continue;
      if (d.deleted) {
        db.prepare('DELETE FROM categories WHERE id=?').run(d._id);
        stats.deletedLocal++;
        continue;
      }
      if (!d.ciphertext) continue;
      try {
        const plaintext = this.decryptFromCloud(d.ciphertext);
        // categories are stored plaintext locally (legacy schema). We still
        // upload them encrypted — server never sees category names.
        db.prepare('INSERT OR REPLACE INTO categories VALUES (?,?)').run(d._id, plaintext);
        stats.pulledCategories++;
      } catch (e) {
        this.deps.logAudit?.('cloud_decrypt_failed', `category=${d._id}: ${e.message}`);
      }
    }

    // Tombstones we need to publish (deleted locally since last push) live in
    // the tombstones table — created by the IPC delete handler.
    db.exec(`CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    )`);

    // ── PUSH entries ─────────────────────────────────────────────────────────
    onProgress?.('push', 'Uploading local changes');
    const localEntries = db.prepare('SELECT id, data, created_at, updated_at FROM entries WHERE updated_at > ?').all(lastPushAt);
    for (const row of localEntries) {
      try {
        const plaintext = this.deps.decrypt(row.data, this.deps.getKey());
        const cipherForCloud = this.encryptForCloud(plaintext);
        await this._patchDoc(`entries/${row.id}`, {
          ciphertext:      cipherForCloud,
          clientUpdatedAt: row.updated_at,
          createdAt:       row.created_at,
          deleted:         false,
        });
        stats.pushedEntries++;
      } catch (e) {
        this.deps.logAudit?.('cloud_push_failed', `entry=${row.id}: ${e.message}`);
      }
    }

    // Push category writes
    const localCats = db.prepare('SELECT id, data FROM categories').all();
    for (const row of localCats) {
      try {
        const cipherForCloud = this.encryptForCloud(row.data);
        await this._patchDoc(`categories/${row.id}`, {
          ciphertext:      cipherForCloud,
          clientUpdatedAt: Date.now(),
          deleted:         false,
        });
        stats.pushedCategories++;
      } catch (e) {
        this.deps.logAudit?.('cloud_push_failed', `category=${row.id}: ${e.message}`);
      }
    }

    // Push tombstones
    const tombs = db.prepare('SELECT id, collection FROM tombstones').all();
    for (const t of tombs) {
      try {
        await this._patchDoc(`${t.collection}/${t.id}`, {
          deleted:         true,
          clientUpdatedAt: Date.now(),
          ciphertext:      '', // explicit empty to overwrite
        });
        db.prepare('DELETE FROM tombstones WHERE id=?').run(t.id);
        stats.deletedRemote++;
      } catch (e) {
        // Leave tombstone in place; retry next sync
        this.deps.logAudit?.('cloud_tombstone_failed', `id=${t.id}: ${e.message}`);
      }
    }

    // ── Bookkeeping ──────────────────────────────────────────────────────────
    this.cfg.lastSync   = Date.now();
    this.cfg.lastPullAt = startedAt;     // anything created server-side AFTER we started pulling
    this.cfg.lastPushAt = startedAt;
    stats.durationMs    = Date.now() - startedAt;
    stats.lastSync      = this.cfg.lastSync;
    return stats;
  }
}

module.exports = { CloudSync, fromFirestoreDoc, toFirestoreValue };
