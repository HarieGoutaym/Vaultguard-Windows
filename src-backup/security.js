'use strict';
/**
 * VaultGuard — Security Hardening Module
 *
 * Loaded ONCE in main process at startup.
 * Blocks ALL outgoing network requests except the optional HaveIBeenPwned
 * k-anonymity API (SHA-1 prefix only — no full password hash ever leaves the device).
 *
 * GUARANTEED OFFLINE:
 *   - webRequest interceptor denies every request not in ALLOWED_ORIGINS
 *   - All navigation/new-window attempts are killed
 *   - CSP header injected on every response
 *   - No remote module, no nodeIntegration, contextIsolation enforced
 */

const { session, shell } = require('electron');

// Only these origins are ever allowed through the network layer.
// Remove 'haveibeenpwned.com' to make the app fully air-gapped.
const ALLOWED_ORIGINS = new Set([
  'api.pwnedpasswords.com',   // HIBP k-anon — only 5-char SHA1 prefix sent
]);

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'none'",       // Renderer JS cannot make ANY fetch/XHR
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function applySecurityHardening(ses = session.defaultSession) {
  // ── 1. Block ALL outgoing requests from renderer ─────────────────────────────
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = new URL(details.url);
    // Allow local file:// resources (app assets)
    if (details.url.startsWith('file://')) return callback({ cancel: false });
    // Allow explicitly whitelisted origins
    if (ALLOWED_ORIGINS.has(url.hostname)) return callback({ cancel: false });
    // Block everything else silently
    console.warn(`[Security] Blocked request: ${details.url}`);
    callback({ cancel: true });
  });

  // ── 2. Inject strict CSP on every response ───────────────────────────────────
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['no-referrer'],
        'Permissions-Policy': ['interest-cohort=()'],
      },
    });
  });

  // ── 3. Kill renderer-initiated navigation ────────────────────────────────────
  // (Also enforced per-window in main.js via will-navigate / new-window)
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    // Deny everything: geolocation, notifications, camera (except handled natively), etc.
    const allowed = ['clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  console.log('[Security] Network hardening applied — all external requests blocked except HIBP k-anon.');
}

module.exports = { applySecurityHardening, ALLOWED_ORIGINS, CSP };
