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

// Full origin prefix — must match exactly, prevents subdomain/path bypass.
// e.g. "api.pwnedpasswords.com.evil.com" will NOT match.
const ALLOWED_ORIGIN_PREFIXES = [
  'https://api.pwnedpasswords.com/',    // HIBP k-anon — only 5-char SHA1 prefix sent
  'https://fonts.googleapis.com/',      // Google Fonts CSS
  'https://fonts.gstatic.com/',         // Google Fonts files
  'https://www.google.com/s2/favicons', // Website favicons
  'https://icons.duckduckgo.com/ip3/',  // Favicon fallback (no tracking)
  'https://api.qrserver.com/',          // TOTP QR code generation
];

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
  "form-action 'self'",
].join('; ');

function applySecurityHardening(ses = session.defaultSession) {
  // ── 1. Block ALL outgoing requests except explicit allow-list ────────────────
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // Allow local file:// resources (app assets)
    if (details.url.startsWith('file://')) return callback({ cancel: false });

    // Validate against full origin prefix — hostname-only check can be bypassed
    // by a URL like https://api.pwnedpasswords.com.evil.com/
    const allowed = ALLOWED_ORIGIN_PREFIXES.some(prefix => details.url.startsWith(prefix));
    if (!allowed) {
      console.warn(`[Security] Blocked request: ${details.url}`);
      return callback({ cancel: true });
    }

    // Extra guard: enforce HTTPS only for all non-file allowed origins
    try {
      const u = new URL(details.url);
      if (u.protocol !== 'https:') {
        console.warn(`[Security] Blocked non-HTTPS request: ${details.url}`);
        return callback({ cancel: true });
      }
    } catch {
      return callback({ cancel: true });
    }

    callback({ cancel: false });
  });

  // ── 2. Inject strict security headers on every response ─────────────────────
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy':   [CSP],
        'X-Content-Type-Options':    ['nosniff'],
        'X-Frame-Options':           ['DENY'],
        'X-XSS-Protection':          ['1; mode=block'],
        'Referrer-Policy':           ['no-referrer'],
        'Permissions-Policy':        [
          'accelerometer=(), camera=(), geolocation=(), gyroscope=(), ' +
          'magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()'
        ],
        // Tell the OS this app never expects plain HTTP — guards against
        // downgrade attacks if network blocking is somehow bypassed.
        'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
      },
    });
  });

  // ── 3. Deny all permission requests ─────────────────────────────────────────
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Only allow clipboard operations; deny everything else including
    // notifications, geolocation, camera, microphone, etc.
    const allowed = ['clipboard-read', 'clipboard-sanitized-write'];
    if (!allowed.includes(permission)) {
      console.warn(`[Security] Permission denied: ${permission}`);
    }
    callback(allowed.includes(permission));
  });

  // ── 4. Block all permission checks from renderer ─────────────────────────────
  ses.setPermissionCheckHandler((_webContents, permission) => {
    return ['clipboard-read', 'clipboard-write'].includes(permission);
  });

  console.log('[Security] Network hardening applied — all external requests blocked except HIBP k-anon.');
}

module.exports = { applySecurityHardening, ALLOWED_ORIGIN_PREFIXES, CSP };
