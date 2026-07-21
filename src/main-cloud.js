'use strict';
/**
 * VaultGuard — Cloud IPC handlers
 *
 * Replaces the stubbed `cloud:status`, `cloud:connect`, `cloud:sync`,
 * `cloud:disconnect` handlers in main.js with real Firebase-backed sync.
 *
 * Wire-up in main.js (one line, after registerAdditionalIPC):
 *
 *   const { registerCloudIPC } = require('./main-cloud');
 *   registerCloudIPC({
 *     ipcMain, db: () => db, getKey: () => vaultKey, encrypt, decrypt,
 *     logAudit, resetAutoLock, sendToRenderer: (ch, p) => mainWindow?.webContents.send(ch, p),
 *   });
 *
 * IMPORTANT: when you wire this in, REMOVE the existing four `cloud:*`
 * handlers from main.js (the ones inside registerIPC). Otherwise
 * `ipcMain.handle` will throw because the channel is already taken.
 *
 * Also call `markTombstone(id, 'entries')` from inside your
 * `entries:delete` handler so deletes propagate to other devices.
 */

const { CloudSync } = require('./cloud-sync');

function registerCloudIPC({ ipcMain, db, getKey, encrypt, decrypt, logAudit, resetAutoLock, sendToRenderer }) {

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function loadCfg() {
    const row = db()?.prepare('SELECT value FROM settings_store WHERE key=?').get('cloud_config');
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  }
  function saveCfg(cfg) {
    db()?.prepare('INSERT OR REPLACE INTO settings_store VALUES (?,?)').run('cloud_config', JSON.stringify(cfg));
  }
  function makeClient() {
    const cfg = loadCfg();
    if (!cfg?.connected) return null;
    return new CloudSync(cfg, { db, getKey, encrypt, decrypt, logAudit });
  }

  // Public API used by main.js delete handler to schedule a remote delete
  function markTombstone(id, collection = 'entries') {
    if (!db()) return;
    db().exec(`CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    )`);
    db().prepare('INSERT OR REPLACE INTO tombstones VALUES (?,?,?)').run(id, collection, Date.now());
  }

  // ── IPC: status ─────────────────────────────────────────────────────────────
  ipcMain.handle('cloud:status', () => {
    const cfg = loadCfg();
    if (!cfg) return { connected: false };
    // Never expose tokens to renderer
    const { idToken, refreshToken, ...safe } = cfg;
    return safe;
  });

  // ── IPC: connect (sign-in / sign-up) ───────────────────────────────────────
  ipcMain.handle('cloud:connect', async (_, opts) => {
    try {
      // Validate input
      const { action, apiKey, projectId, email, password, authDomain } = opts || {};
      if (!apiKey || !projectId || !email || !password) {
        return { success: false, error: 'apiKey, projectId, email, and password are required' };
      }
      if (!/^[A-Za-z0-9_\-]{20,}$/.test(apiKey))      return { success: false, error: 'Invalid API key format' };
      if (!/^[a-z0-9-]{4,30}$/.test(projectId))       return { success: false, error: 'Invalid project ID' };
      if (password.length < 6)                        return { success: false, error: 'Password too short' };

      const auth = action === 'signup'
        ? await CloudSync.signUp(apiKey, email, password)
        : await CloudSync.signIn(apiKey, email, password);

      const cfg = {
        connected:    true,
        apiKey, projectId, authDomain: authDomain || `${projectId}.firebaseapp.com`,
        email:        auth.email,
        uid:          auth.uid,
        idToken:      auth.idToken,
        refreshToken: auth.refreshToken,
        expiresIn:    auth.expiresIn,
        issuedAt:     auth.issuedAt,
        lastSync:     null,
        lastPullAt:   0,
        lastPushAt:   0,
        autoSync:     true,
      };
      saveCfg(cfg);

      // Push vault metadata immediately so any other device can pull and unlock
      try {
        const client = new CloudSync(cfg, { db, getKey, encrypt, decrypt, logAudit });
        if (getKey()) await client.pushVaultMeta();
        // Persist any refreshed tokens
        saveCfg(client.cfg);
      } catch (e) {
        logAudit?.('cloud_initial_meta_push_failed', e.message);
      }

      logAudit?.('cloud_connected', email);
      return { success: true, uid: auth.uid };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── IPC: sync ──────────────────────────────────────────────────────────────
  let syncInFlight = false;
  ipcMain.handle('cloud:sync', async () => {
    if (syncInFlight) return { success: false, error: 'Sync already in progress' };
    if (!getKey())    return { success: false, error: 'Vault is locked' };
    const client = makeClient();
    if (!client)      return { success: false, error: 'Not connected to cloud' };

    syncInFlight = true;
    try {
      const stats = await client.sync({
        onProgress: (stage, msg) => sendToRenderer?.('cloud-progress', { stage, msg }),
      });
      // Persist updated tokens / cursors
      saveCfg(client.cfg);
      logAudit?.('cloud_sync_completed', `pushed=${stats.pushedEntries} pulled=${stats.pulledEntries} delLocal=${stats.deletedLocal} delRemote=${stats.deletedRemote}`);
      resetAutoLock?.();
      return { success: true, ...stats };
    } catch (e) {
      logAudit?.('cloud_sync_failed', e.message);
      return { success: false, error: e.message };
    } finally {
      syncInFlight = false;
    }
  });

  // ── IPC: disconnect ────────────────────────────────────────────────────────
  ipcMain.handle('cloud:disconnect', () => {
    db()?.prepare('DELETE FROM settings_store WHERE key=?').run('cloud_config');
    logAudit?.('cloud_disconnected', '');
    return { success: true };
  });

  // ── IPC: pull-meta (used by setup screen "I have a vault on another device") ─
  // Lets a fresh install fetch the salt + verifier so the user can unlock with
  // their existing master password and then sync.
  ipcMain.handle('cloud:pull-meta', async (_, opts) => {
    try {
      const { apiKey, projectId, email, password } = opts || {};
      const auth = await CloudSync.signIn(apiKey, email, password);
      const tempCfg = { apiKey, projectId, idToken: auth.idToken, refreshToken: auth.refreshToken,
                         expiresIn: auth.expiresIn, issuedAt: auth.issuedAt, uid: auth.uid };
      const client = new CloudSync(tempCfg, { db, getKey, encrypt, decrypt, logAudit });
      const meta = await client.pullVaultMeta();
      if (!meta) return { success: false, error: 'No vault found in this account' };
      return {
        success: true,
        salt:        meta.salt,
        verifyEnc:   meta.verifyEnc,
        verifyHmac:  meta.verifyHmac,
        hint:        meta.hint,
        uid:         auth.uid,
        idToken:     auth.idToken,
        refreshToken: auth.refreshToken,
        expiresIn:   auth.expiresIn,
        issuedAt:    auth.issuedAt,
        email:       auth.email,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Background auto-sync ───────────────────────────────────────────────────
  // Runs every 5 min while the vault is unlocked AND auto-sync is on AND a
  // sync is not already in flight. Failures are logged but don't surface to
  // the UI — the user will see them next time they open the cloud screen.
  let autoSyncTimer = null;
  function startAutoSync() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    autoSyncTimer = setInterval(async () => {
      if (syncInFlight || !getKey()) return;
      const cfg = loadCfg();
      if (!cfg?.connected || cfg.autoSync === false) return;
      try {
        const client = makeClient();
        if (!client) return;
        const stats = await client.sync();
        saveCfg(client.cfg);
        sendToRenderer?.('cloud-auto-sync-done', { stats });
      } catch (e) {
        sendToRenderer?.('cloud-auto-sync-failed', { error: e.message });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
  function stopAutoSync() {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
  }
  startAutoSync();

  return { markTombstone, stopAutoSync };
}

module.exports = { registerCloudIPC };
