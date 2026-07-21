/**
 * VaultGuard - Renderer Application
 * Full-featured password manager UI
 */

'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────
const state = {
  entries: [],
  categories: [],
  selectedEntry: null,
  currentView: 'all',
  searchQuery: '',
  isEditing: false,
  cloudStatus: { connected: false },
  settings: {},
  totpIntervals: {},
};

// ─── API Shorthand ─────────────────────────────────────────────────────────────
const API = window.vaultAPI;
// Backwards-compat shims for new API surface added in this version
if (API && !API.importExport) {
  // Running in old Electron build — stub out so UI doesn't crash
  Object.defineProperty(API, 'importExport', { value: {
    import: (fn,c,s) => API.entries.import ? API.entries.import([]) : Promise.resolve({success:false,error:'Not supported in this build'}),
    exportEncrypted: () => Promise.resolve({success:false,error:'Not supported'}),
    importEncrypted: () => Promise.resolve({success:false,error:'Not supported'}),
  }, writable:false });
}

// ─── DOM Utils ─────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => c && e.append(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
};

// ─── SVG Icons (Lucide-style stroke icons) ────────────────────────────────────
const _svg = (path, size = 14, fill = 'none', strokeWidth = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;


const Icon = {
  vault: _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>', 18),
  star: _svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 18),
  clock: _svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 18),
  warning: _svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 18),
  alert: _svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18),
  plus: _svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18),
  zap: _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 18),
  shield: _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 18),
  cloud: _svg('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>', 18),
  list: _svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', 18),
  settings: _svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 18),
  lock: _svg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 18),
  users: _svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 18),
  shieldCheck: _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>', 18),
  search: _svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 18),
  user: _svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 18),
  key: _svg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>', 18),
  globe: _svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', 18),
  creditCard: _svg('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>', 18),
  fileText: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', 18),
  badge: _svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><circle cx="12" cy="11" r="3"/><rect x="9" y="16" width="6" height="2" rx="1"/>', 18),
  terminal: _svg('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', 18),
  bolt: _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 18),
  file: _svg('<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', 18),
  eye: _svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 18),
  eyeOff: _svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>', 18),
  copy: _svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 18),
  more: _svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', 18),
  trash: _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', 18),
  edit: _svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 18),
  check: _svg('<polyline points="20 6 9 17 4 12"/>', 18),
  x: _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 18),
  
  bitcoin: _svg('<circle cx="12" cy="12" r="10"/><path d="M16 8h-6v8h6a4 4 0 0 0 0-8"/><path d="M14 12H9"/><path d="M11 6v12"/><path d="M14 6v12"/>', 18),
  generate: _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 18),
  history: _svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.54"/>', 18),
  info: _svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', 18),
  link: _svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 18),
  rotate: _svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/>', 18),
  scroll: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', 18),
  tag: _svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>', 18),
  unlock: _svg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>', 18),

  refresh: _svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 18)
};
// ─── Entry-type icon ──────────────────────────────────────────────────────────
function getTypeIcon(type) {
  const map = {
    login:    Icon.user,
    card:     Icon.creditCard,
    note:     Icon.fileText,
    identity: Icon.badge,
    ssh:      Icon.terminal,
    api:      Icon.bolt,
    crypto:   Icon.bitcoin,
    license:  Icon.scroll,
  };
  return map[type] || Icon.lock;
}

// Backwards-compat shim for any callers still expecting an emoji-shaped helper
function getTypeEmoji(type) { return getTypeIcon(type); }

// Render a category's icon — supports legacy emoji glyphs (e.g. "📱")
// stored on existing categories. Wrapped in a tinted tile that uses the
// category color so emoji and modern icons share a visual language.
function categoryIconHtml(cat, size = 22) {
  const color = cat?.color || 'var(--accent-primary)';
  const icon  = cat?.icon  || Icon.file;
  return `<span class="cat-icon-tile" style="--cat-color:${color};width:${size}px;height:${size}px">${typeof icon === 'string' && icon.startsWith('<svg') ? icon : escHtml(icon)}</span>`;
}

// ─── Toast System ─────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', copy: '📋' };
  const container = $('#toast-container');
  const t = el('div', { class: `toast ${type}` });
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('exit');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ─── Modal System ─────────────────────────────────────────────────────────────
function showModal(content) {
  const overlay = $('#modal-overlay');
  const container = $('#modal-container');
  container.innerHTML = '';
  container.appendChild(content);
  overlay.classList.remove('hidden');
  container.classList.remove('hidden');

  overlay.onclick = closeModal;
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-container').classList.add('hidden');
}

// ─── App Init ────────────────────────────────────────────────────────────────
async function init() {
  setupTitlebar();
  
  const exists = await API.vault.checkExists();
  if (exists) {
    showScreen('unlock');
  } else {
    showScreen('setup');
  }

  // Listen for auto-lock
  API.onAutoLocked(() => {
    state.entries = [];
    state.selectedEntry = null;
    toast('Vault locked due to inactivity', 'warning');
    showScreen('unlock');
  });
}

function setupTitlebar() {
  $('#btn-minimize').onclick = () => API.window.minimize();
  $('#btn-maximize').onclick = () => API.window.maximize();
  $('#btn-close').onclick = () => API.window.close();
}

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`#screen-${name}`);
  if (screen) {
    screen.classList.add('active');
    screen.classList.remove('hidden');
  }
}

// ─── Unlock Screen ────────────────────────────────────────────────────────────
function renderUnlockScreen() {
  const container = $('#main-content');
  container.innerHTML = `
    <div id="screen-unlock" class="screen active">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
              <path d="M16 2 L28 6 V15 C28 22.5 22.5 28 16 30 C9.5 28 4 22.5 4 15 V6 Z" fill="white" fill-opacity="0.95"/>
              <circle cx="16" cy="15" r="3.2" fill="currentColor"/>
              <rect x="14.5" y="15" width="3" height="6" rx="1.2" fill="currentColor"/>
            </svg>
          </div>
        </div>
        <h1 class="auth-title">Welcome Back</h1>
        <p class="auth-subtitle">Enter your master password to unlock your vault</p>
        
        <div class="form-group">
          <label class="form-label">Master Password</label>
          <div class="form-input-wrapper">
            <input type="password" id="unlock-password" class="form-input" placeholder="Enter master password..." autocomplete="current-password" autofocus />
            <button class="btn-icon-sm input-action" id="unlock-toggle-vis" title="Toggle visibility">
              ${Icon.eye}
            </button>
          </div>
        </div>

        <div class="form-group" id="keyfile-section" style="display:none">
          <label class="form-label">Key File</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="keyfile-path" class="form-input" placeholder="No key file selected" readonly style="flex:1;cursor:pointer" />
            <button class="btn btn-secondary" id="select-keyfile-btn" style="flex-shrink:0">Browse</button>
          </div>
        </div>

        <div id="unlock-error" class="form-error hidden"></div>

        <button class="btn btn-primary btn-full btn-lg" id="unlock-btn" style="margin-top:8px">
          ${Icon.lock}
          Unlock Vault
        </button>

        <div style="margin-top:16px;text-align:center">
          <button class="btn btn-ghost" id="show-keyfile-toggle" style="font-size:12px;color:var(--text-muted)">
            Use key file
          </button>
        </div>
      </div>
    </div>
  `;

  let keyfilePath = null;
  let passwordVisible = false;

  const pwInput = $('#unlock-password');
  const errDiv = $('#unlock-error');

  $('#unlock-toggle-vis').onclick = () => {
    passwordVisible = !passwordVisible;
    pwInput.type = passwordVisible ? 'text' : 'password';
    $('#unlock-toggle-vis').innerHTML = passwordVisible ? Icon.eyeOff : Icon.eye;
  };

  $('#show-keyfile-toggle').onclick = () => {
    const sec = $('#keyfile-section');
    sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
  };

  $('#select-keyfile-btn').onclick = async () => {
    const result = await API.keyfile.select();
    if (!result.cancelled) {
      keyfilePath = result.path;
      $('#keyfile-path').value = result.path;
    }
  };

  async function doUnlock() {
    const password = pwInput.value;
    if (!password) { showError('Please enter your master password'); return; }

    const btn = $('#unlock-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Unlocking...';
    errDiv.classList.add('hidden');

    const result = await API.vault.unlock({ masterPassword: password, keyfilePath });
    
    if (result.success) {
      pwInput.value = ''; // Clear from DOM immediately
      await loadApp();
    } else {
      showError(result.error || 'Invalid master password');
      btn.disabled = false;
      btn.innerHTML = `${Icon.lock} Unlock Vault`;
      pwInput.value = '';
      pwInput.focus();
    }
  }

  function showError(msg) {
    errDiv.textContent = msg;
    errDiv.classList.remove('hidden');
  }

  $('#unlock-btn').onclick = doUnlock;
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function renderSetupScreen() {
  const container = $('#main-content');
  container.innerHTML = `
    <div id="screen-setup" class="screen active">
      <div class="auth-card" style="width:460px;max-height:80vh;overflow-y:auto">
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
              <path d="M16 2 L28 6 V15 C28 22.5 22.5 28 16 30 C9.5 28 4 22.5 4 15 V6 Z" fill="white" fill-opacity="0.95"/>
              <circle cx="16" cy="15" r="3.2" fill="currentColor"/>
              <rect x="14.5" y="15" width="3" height="6" rx="1.2" fill="currentColor"/>
            </svg>
          </div>
        </div>
        <h1 class="auth-title">Create Your Vault</h1>
        <p class="auth-subtitle">Set up your secure, encrypted password vault</p>

        <div class="form-group">
          <label class="form-label">Master Password <span style="color:var(--accent-danger)">*</span></label>
          <div class="form-input-wrapper">
            <input type="password" id="setup-password" class="form-input password-field" placeholder="Create a strong master password" />
            <button class="btn-icon-sm input-action" id="setup-toggle-vis">${Icon.eye}</button>
          </div>
          <div id="pw-strength-bar" class="strength-bar" data-strength="">
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <div id="pw-strength-label" class="strength-label" data-strength=""></div>
            <div id="pw-entropy" class="form-hint"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Confirm Password <span style="color:var(--accent-danger)">*</span></label>
          <input type="password" id="setup-confirm" class="form-input" placeholder="Repeat master password" />
          <div id="confirm-error" class="form-error hidden">Passwords do not match</div>
        </div>

        <div class="form-group">
          <label class="form-label">Password Hint (optional)</label>
          <input type="text" id="setup-hint" class="form-input" placeholder="A hint to remember your password" />
          <div class="form-hint">Stored unencrypted. Don't make it obvious!</div>
        </div>

        <div class="form-group">
          <label class="form-label">Key File (optional - recommended)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="setup-keyfile-path" class="form-input" placeholder="No key file (click Generate)" readonly style="flex:1" />
            <button class="btn btn-secondary" id="gen-keyfile-btn">Generate</button>
          </div>
          <div class="form-hint">A key file adds an extra layer of security (like 2FA for your vault)</div>
        </div>

        <div id="setup-error" class="form-error hidden"></div>

        <button class="btn btn-primary btn-full btn-lg" id="create-vault-btn" style="margin-top:8px">
          Create Vault
        </button>

        <div style="margin-top:16px;background:var(--bg-void);border-radius:var(--radius-md);padding:12px;font-size:11px;color:var(--text-muted);line-height:1.6">
          🔒 Your vault is encrypted with <strong style="color:var(--text-secondary)">AES-256-GCM</strong> and 
          your master password is never stored — only a verification token derived with <strong style="color:var(--text-secondary)">Argon2id</strong>.
        </div>
      </div>
    </div>
  `;

  let setupKeyfilePath = null;
  let setupPasswordVisible = false;
  let strengthTimeout = null;

  $('#setup-toggle-vis').onclick = () => {
    setupPasswordVisible = !setupPasswordVisible;
    $('#setup-password').type = setupPasswordVisible ? 'text' : 'password';
    $('#setup-toggle-vis').innerHTML = setupPasswordVisible ? Icon.eyeOff : Icon.eye;
  };

  $('#setup-password').addEventListener('input', () => {
    clearTimeout(strengthTimeout);
    strengthTimeout = setTimeout(async () => {
      const pw = $('#setup-password').value;
      if (!pw) return;
      const result = await API.vault.strength(pw);
      const bar = $('#pw-strength-bar');
      const label = $('#pw-strength-label');
      const entropyDiv = $('#pw-entropy');
      bar.dataset.strength = result.label;
      label.textContent = result.label.replace('-', ' ');
      label.dataset.strength = result.label;
      if (result.entropy) {
        entropyDiv.textContent = `~${Math.round(result.entropy)} bits entropy`;
      }
    }, 300);
  });

  $('#gen-keyfile-btn').onclick = async () => {
    const result = await API.keyfile.generate();
    if (!result.cancelled) {
      setupKeyfilePath = result.path;
      $('#setup-keyfile-path').value = result.path;
      toast('Key file generated! Keep it safe — you\'ll need it to unlock your vault.', 'success', 5000);
    }
  };

  $('#create-vault-btn').onclick = async () => {
    const password = $('#setup-password').value;
    const confirm = $('#setup-confirm').value;
    const hint = $('#setup-hint').value;
    const errDiv = $('#setup-error');

    if (!password) { errDiv.textContent = 'Please create a master password'; errDiv.classList.remove('hidden'); return; }
    if (password !== confirm) { $('#confirm-error').classList.remove('hidden'); return; }
    
    const strength = await API.vault.strength(password);
    if (strength.score < 2) {
      errDiv.textContent = 'Please use a stronger master password (at least "fair" strength)';
      errDiv.classList.remove('hidden');
      return;
    }

    const btn = $('#create-vault-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Creating vault...';

    const result = await API.vault.create({ masterPassword: password, keyfilePath: setupKeyfilePath, hint });

    if (result.success) {
      toast('Vault created successfully!', 'success');
      await loadApp();
    } else {
      errDiv.textContent = result.error;
      errDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = 'Create Vault';
    }
  };
}

// ─── Load Main App ─────────────────────────────────────────────────────────────
async function loadApp() {
  // Load data
  [state.entries, state.categories, state.cloudStatus, state.settings] = await Promise.all([
    API.entries.getAll(),
    API.categories.get(),
    API.cloud.status(),
    API.settings.get(),
  ]);

  renderMainApp();
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function renderMainApp() {
  const container = $('#main-content');
  container.innerHTML = `
    <div id="screen-main" class="screen active">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-sections-scroll">
        <div class="sidebar-section">
          <div class="sidebar-label">Views</div>
          <div class="sidebar-item active" data-view="all">
            <span class="item-icon">${Icon.vault}</span>
            All Items
            <span class="sidebar-count" id="count-all">0</span>
          </div>
          <div class="sidebar-item" data-view="favorites">
            <span class="item-icon">${Icon.star}</span>
            Favorites
            <span class="sidebar-count" id="count-fav">0</span>
          </div>
          <div class="sidebar-item" data-view="recent">
            <span class="item-icon">${Icon.clock}</span>
            Recent
          </div>
          <div class="sidebar-item" data-view="weak">
            <span class="item-icon">${Icon.warning}</span>
            Weak Passwords
            <span class="sidebar-count" id="count-weak">0</span>
          </div>
          <div class="sidebar-item" data-view="breached">
            <span class="item-icon">${Icon.alert}</span>
            Breached
            <span class="sidebar-count" id="count-breach">0</span>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">
            <span>Categories</span>
            <button class="sidebar-label-action" id="add-category-btn" title="New category">${Icon.plus}</button>
          </div>
          <div id="category-list"></div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">Team & Sharing <span class="badge-team">PRO</span></div>
          <div class="sidebar-item" data-view="team-vaults">
            <span class="item-icon">${Icon.users || Icon.vault}</span>
            Team Vaults
          </div>
          <div class="sidebar-item" data-view="access-roles">
            <span class="item-icon">${Icon.shieldCheck || Icon.shield}</span>
            Access & Roles
          </div>
          <div class="sidebar-item" data-view="data-breach">
            <span class="item-icon">${Icon.alert || Icon.alert}</span>
            Breach Scanner
          </div>
        </div>
        
        <div class="sidebar-section">
          <div class="sidebar-label">Tools</div>
          <div class="sidebar-item" data-view="generator">
            <span class="item-icon">${Icon.zap}</span>
            Password Generator
          </div>
          <div class="sidebar-item" data-view="security">
            <span class="item-icon">${Icon.shield}</span>
            Security Audit
          </div>
          <div class="sidebar-item" data-view="cloud">
            <span class="item-icon">${Icon.cloud}</span>
            Cloud Sync
          </div>
          <div class="sidebar-item" data-view="audit-log">
            <span class="item-icon">${Icon.list}</span>
            Audit Log
          </div>
          <div class="sidebar-item" data-view="settings">
            <span class="item-icon">${Icon.settings}</span>
            Settings
          </div>
        </div>
        </div>
        <div class="sidebar-bottom">
          <button class="sidebar-action-btn" id="sync-btn" title="Sync">
            ${Icon.cloud} Sync
          </button>
          <button class="sidebar-action-btn danger" id="lock-btn" title="Lock vault">
            ${Icon.lock} Lock
          </button>
        </div>
      </aside>

      <!-- Main Panel -->
      <div class="main-panel">
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="search-wrapper">
            <span class="search-icon">${Icon.search}</span>
            <input type="text" class="search-input" id="global-search" placeholder="Search entries, usernames, URLs..." />
          </div>
          <div class="toolbar-actions">
            <div id="cloud-status-badge" class="cloud-badge">
              <div class="cloud-dot"></div>
              <span>Offline</span>
            </div>
            <button class="btn btn-primary" id="add-entry-btn">
              ${Icon.plus} Add Entry
            </button>
          </div>
        </div>

        <!-- Views -->
        <div style="flex:1;display:flex;overflow:hidden">
          <!-- Enterprise View Container -->
          <div id="view-enterprise" class="view" style="width:100%;overflow-y:auto;padding:24px;"></div>
          <!-- Entry List View -->
          <div id="view-entries" class="view active">
            <div class="entry-list-panel">
              <div id="entry-list-header" style="padding:10px 14px 6px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em"></div>
              <div class="entry-list" id="entry-list"></div>
            </div>
            <div class="detail-panel" id="detail-panel">
              <div class="detail-empty">
                <div class="detail-empty-icon">${_svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/>', 56)}</div>
                <div style="font-size:14px;font-weight:500">Select an entry to view details</div>
                <div style="font-size:12px">or create a new entry</div>
              </div>
            </div>
          </div>

          <!-- Generator View -->
          <div id="view-generator" class="view">
            ${renderGeneratorView()}
          </div>

          <!-- Security View -->
          <div id="view-security" class="view">
            ${renderSecurityView()}
          </div>

          <!-- Cloud View -->
          <div id="view-cloud" class="view">
            ${renderCloudView()}
          </div>

          <!-- Audit Log View -->
          <div id="view-audit-log" class="view">
            ${renderAuditLogView()}
          </div>

          <!-- Settings View -->
          <div id="view-settings" class="view">
            ${renderSettingsView()}
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind sidebar navigation
  $$('[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      $$('[data-view]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navigateTo(view);
    });
  });

  // Bind actions
  $('#lock-btn').onclick = async () => {
    await API.vault.lock();
    state.entries = [];
    state.selectedEntry = null;
    renderUnlockScreen();
  };

  $('#sync-btn').onclick = async () => {
    if (!state.cloudStatus.connected) {
      navigateTo('cloud');
      return;
    }
    toast('Syncing...', 'info');
    const result = await API.cloud.sync();
    if (result.success) {
      toast(`Synced ${result.synced} entries`, 'success');
    } else {
      toast(result.error, 'error');
    }
  };

  $('#add-entry-btn').onclick = () => showAddEntryModal();

  // Add-category button (sidebar header)
  const addCatBtn = $('#add-category-btn');
  if (addCatBtn) {
    addCatBtn.onclick = (e) => {
      e.stopPropagation();
      showCategoryFormModal();
    };
  }
  
  // Search
  let searchTimeout;
  $('#global-search').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value;
      renderEntryList();
    }, 200);
  });

  // Render initial data
  renderCategoryList();
  renderEntryList();
  updateCounts();
  updateCloudBadge();

  // Init generator
  initGenerator();

  // Start TOTP auto-refresh
  startTotpTimer();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigateTo(view) {
  if (['team-vaults', 'access-roles', 'data-breach'].includes(view)) {
    $$('.sidebar-item').forEach(el => el.classList.remove('active'));
    let matched = $('.sidebar-item[data-view="'+view+'"]');
    if(matched) matched.classList.add('active');
    
    $$('.view').forEach(v => v.classList.remove('active'));
    let entView = $('#view-enterprise');
    entView.classList.add('active');
    entView.innerHTML = window.renderEnterpriseView(view);
    return;
  }

  $$('.sidebar-item').forEach(el => el.classList.remove('active'));
  const activeItem = $('.sidebar-item[data-view="'+view+'"]');
  if (activeItem) activeItem.classList.add('active');

  $$('.view').forEach(v => v.classList.remove('active'));

  const entryViews = ['all', 'favorites', 'recent', 'weak', 'breached'];
  if (entryViews.includes(view) || view.startsWith('cat-')) {
    state.currentView = view;
    $('#view-entries').classList.add('active');
    renderEntryList();
  } else {
    const viewEl = $('#view-' + view);
    if (viewEl) {
      viewEl.classList.add('active');
      if (view === 'generator') renderGeneratorView();
      if (view === 'security') renderSecurityView();
      if (view === 'cloud') renderCloudView();
      if (view === 'settings') renderSettingsView && renderSettingsView();
      if (view === 'audit-log') renderAuditLogView && renderAuditLogView();
    }
  }
}

// ─── Category List ────────────────────────────────────────────────────────────
function renderCategoryList() {
  const list = $('#category-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.categories.length) {
    list.innerHTML = `<div class="sidebar-empty">No categories yet</div>`;
    return;
  }
  state.categories.forEach(cat => {
    const count = state.entries.filter(e => e.categoryId === cat.id).length;
    const item = el('div', {
      class: 'sidebar-item category-item',
      'data-view': `cat-${cat.id}`,
    });
    const tile = `<span class="cat-icon-tile" style="--cat-color:${cat.color || '#2563eb'}">${escHtml(cat.icon || Icon.file).startsWith('&lt;svg') ? (cat.icon || Icon.file) : escHtml(cat.icon || '📁')}</span>`;
    item.innerHTML = `
      <span class="item-icon">${tile}</span>
      <span class="category-name">${escHtml(cat.name)}</span>
      <span class="sidebar-count" data-cat-count>${count}</span>
      <span class="category-actions">
        <button class="category-action" data-action="edit" title="Edit category">${Icon.edit}</button>
        <button class="category-action danger" data-action="delete" title="Delete category">${Icon.trash}</button>
      </span>
    `;
    item.onclick = (e) => {
      // Skip selection if user clicked one of the action buttons
      const action = e.target.closest('[data-action]');
      if (action) {
        e.stopPropagation();
        if (action.dataset.action === 'edit')   showCategoryFormModal(cat);
        if (action.dataset.action === 'delete') confirmDeleteCategory(cat);
        return;
      }
      $$('[data-view]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navigateTo(`cat-${cat.id}`);
    };
    list.appendChild(item);
  });
}

// ─── Category create / edit / delete ──────────────────────────────────────────
const CATEGORY_ICONS = [
  '🌐','💳','💼','🛒','🎮','📧','🔑','🏠','🎬','🎵','📚','🏥',
  '✈️','🚗','💰','🏦','📷','💻','🛡️','📱','🎓','🎁','💪','☕',
];
const CATEGORY_COLORS = [
  '#2563eb','#0ea5e9','#06b6d4','#10b981','#22c55e','#84cc16',
  '#eab308','#f59e0b','#f97316','#ef4444','#ec4899','#64748b',
];

function showCategoryFormModal(existing = null) {
  const isEdit = !!existing;
  const initIcon  = existing?.icon  || CATEGORY_ICONS[0];
  const initColor = existing?.color || CATEGORY_COLORS[0];

  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Category' : 'New Category'}</div>
      <button class="btn-icon-sm" id="modal-close" aria-label="Close">${Icon.x}</button>
    </div>
    <div class="modal-body">
      <div class="category-preview" id="cat-preview">
        <span class="cat-icon-tile cat-icon-tile-lg" id="cat-preview-tile" style="--cat-color:${initColor}">${escHtml(initIcon)}</span>
        <div>
          <div class="cat-preview-label">Preview</div>
          <div class="cat-preview-name" id="cat-preview-name">${escHtml(existing?.name || 'New Category')}</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="cat-name" class="form-input" maxlength="64" placeholder="e.g. Personal, Work, Travel" value="${escHtml(existing?.name || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label">Icon</label>
        <div class="icon-picker" id="cat-icon-picker">
          ${CATEGORY_ICONS.map(i => `
            <button type="button" class="icon-swatch ${i === initIcon ? 'selected' : ''}" data-icon="${escHtml(i)}">${escHtml(i)}</button>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker" id="cat-color-picker">
          ${CATEGORY_COLORS.map(c => `
            <button type="button" class="color-swatch ${c.toLowerCase() === initColor.toLowerCase() ? 'selected' : ''}" data-color="${c}" style="--swatch:${c}" aria-label="${c}"></button>
          `).join('')}
        </div>
      </div>

      <div id="cat-error" class="form-error hidden"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="cat-save">${isEdit ? 'Save Changes' : 'Add Category'}</button>
    </div>
  `;
  showModal(modal);

  let pickedIcon  = initIcon;
  let pickedColor = initColor;
  const tileEl    = $('#cat-preview-tile');
  const nameLabel = $('#cat-preview-name');

  $$('.icon-swatch', modal).forEach(b => {
    b.onclick = () => {
      $$('.icon-swatch', modal).forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      pickedIcon = b.dataset.icon;
      tileEl.textContent = pickedIcon;
    };
  });
  $$('.color-swatch', modal).forEach(b => {
    b.onclick = () => {
      $$('.color-swatch', modal).forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      pickedColor = b.dataset.color;
      tileEl.style.setProperty('--cat-color', pickedColor);
    };
  });

  $('#cat-name').addEventListener('input', e => {
    nameLabel.textContent = e.target.value.trim() || 'New Category';
  });

  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;

  $('#cat-save').onclick = async () => {
    const name = $('#cat-name').value.trim();
    const errEl = $('#cat-error');
    errEl.classList.add('hidden');
    if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }

    const payload = { name, icon: pickedIcon, color: pickedColor };
    let result;
    if (isEdit) {
      result = await API.categories.update(existing.id, payload);
    } else {
      result = await API.categories.add({ ...payload, id: `cat-${Date.now()}` });
    }
    if (!result) { errEl.textContent = 'Failed to save category'; errEl.classList.remove('hidden'); return; }

    state.categories = await API.categories.get();
    renderCategoryList();
    closeModal();
    toast(isEdit ? 'Category updated' : 'Category added', 'success');
  };
}

function confirmDeleteCategory(cat) {
  const usage = state.entries.filter(e => e.categoryId === cat.id).length;
  const detail = usage
    ? `\n\n${usage} entr${usage === 1 ? 'y' : 'ies'} will be moved to "No category".`
    : '';
  showConfirmModal(
    'Delete Category',
    `Are you sure you want to delete "${cat.name}"?${detail}`,
    async () => {
      const result = await API.categories.delete(cat.id);
      if (result?.success) {
        state.categories = await API.categories.get();
        state.entries    = await API.entries.getAll();
        renderCategoryList();
        renderEntryList();
        updateCounts();
        if (state.currentView === `cat-${cat.id}`) navigateTo('all');
        toast('Category deleted', 'success');
      } else {
        toast('Failed to delete category', 'error');
      }
    },
    'danger'
  );
}

// ─── Entry List ───────────────────────────────────────────────────────────────
function renderEntryList() {
  const listEl = $('#entry-list');
  const headerEl = $('#entry-list-header');
  if (!listEl) return;

  let entries = [...state.entries];

  // Filter by search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    entries = entries.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.username || '').toLowerCase().includes(q) ||
      (e.url || '').toLowerCase().includes(q) ||
      (e.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // Filter by view
  const view = state.currentView;
  if (view === 'favorites') {
    entries = entries.filter(e => e.isFavorite);
    headerEl.textContent = `Favorites (${entries.length})`;
  } else if (view === 'recent') {
    entries = entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    headerEl.textContent = `Recently Modified`;
  } else if (view === 'weak') {
    entries = entries.filter(e => ['very-weak', 'weak'].includes(e.strength));
    headerEl.textContent = `Weak Passwords (${entries.length})`;
  } else if (view === 'breached') {
    entries = entries.filter(e => e.breached);
    headerEl.textContent = `Breached Passwords (${entries.length})`;
  } else if (view.startsWith('cat-')) {
    const catId = view.slice(4);
    const cat = state.categories.find(c => c.id === catId);
    entries = entries.filter(e => e.categoryId === catId);
    headerEl.textContent = `${cat?.name || 'Category'} (${entries.length})`;
  } else {
    headerEl.textContent = `All Items (${entries.length})`;
  }

  listEl.innerHTML = '';

  if (!entries.length) {
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">${state.searchQuery ? 'No results found' : 'No entries yet'}</div>`;
    return;
  }

  entries.forEach(entry => {
    const item = createEntryListItem(entry);
    listEl.appendChild(item);
  });
}

function createEntryListItem(entry) {
  const item = el('div', { class: `entry-item${entry.id === state.selectedEntry?.id ? ' selected' : ''}`, 'data-entry-id': entry.id });
  
  const favicon = getFaviconHtml(entry);
  const badges = [];
  if (entry.isFavorite) badges.push(`<span class="badge fav">★</span>`);
  if (entry.hasTotp) badges.push(`<span class="badge totp">OTP</span>`);
  if (['very-weak', 'weak'].includes(entry.strength)) badges.push(`<span class="badge weak">Weak</span>`);
  if (entry.breached) badges.push(`<span class="badge breach">Breached</span>`);

  item.innerHTML = `
    <div class="entry-favicon">${favicon}</div>
    <div class="entry-info">
      <div class="entry-title">${escHtml(entry.title || 'Untitled')}</div>
      <div class="entry-meta">${escHtml(entry.username || entry.url || entry.entryType || '')}</div>
    </div>
    ${badges.length ? `<div class="entry-badges">${badges.join('')}</div>` : ''}
  `;

  item.onclick = () => selectEntry(entry);
  return item;
}

// ─── Favicon helpers ──────────────────────────────────────────────────────────
// In-memory cache so we don't re-probe the same domain more than once per session.
// Session favicon cache: domain → 'gstatic' | 'google' | 'ddg' | 'letter'
const _faviconCache = new Map();

/** Called inline from onerror — must be a named global (no closure escaping). */
window._faviconFallback = function(img, domain) {
  if (!img.dataset.step) img.dataset.step = '0';
  const step = parseInt(img.dataset.step);
  img.dataset.step = String(step + 1);
  if (step === 0) {
    // Step 1 → classic Google S2 API
    img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32';
  } else if (step === 1) {
    // Step 2 → DuckDuckGo CDN (no tracking)
    img.src = 'https://icons.duckduckgo.com/ip3/' + domain + '.ico';
  } else {
    // Step 3 → local letter-avatar (zero network, always works)
    img.onerror = null;
    img.src = _letterAvatarDataUrl(domain);
    img.style.padding = '0';
    img.style.opacity = '1';
    _faviconCache.set(domain, 'letter');
  }
};

window._faviconLoaded = function(img, domain) {
  if (domain && !_faviconCache.has(domain)) {
    const step = parseInt(img.dataset.step || '0');
    _faviconCache.set(domain, step === 0 ? 'gstatic' : step === 1 ? 'google' : 'ddg');
  }
  img.style.opacity = '1';
};

function _letterAvatarDataUrl(domain) {
  const base   = domain.replace(/^www\./, '');
  const letter = base[0]?.toUpperCase() || '?';
  const hue    = [...base].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const sat    = 45 + (hue % 20);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="hsl(${hue},${sat}%,28%)"/>` +
    `<text x="16" y="22" font-family="Inter,sans-serif" font-size="17" font-weight="700" ` +
    `fill="white" text-anchor="middle">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * Returns an HTML string for the favicon tile of an entry.
 * Fallback chain:
 *   1. Google FaviconV2 (t2.gstatic.com) — highest quality, supports SVG/PNG
 *   2. Google S2 favicons API (www.google.com/s2/favicons)
 *   3. DuckDuckGo CDN (icons.duckduckgo.com) — no tracking
 *   4. Letter-avatar generated locally — zero network, always succeeds
 *
 * All via plain <img> tags — no CORS restrictions on image loads.
 */
function getFaviconHtml(entry, size = 32) {
  if (entry.url) {
    try {
      const raw  = entry.url.startsWith('http') ? entry.url : `https://${entry.url}`;
      const host = new URL(raw).hostname;
      // Reject hostnames with characters outside [a-z0-9.-] to prevent attribute injection
      if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('bad host');

      const safeHost = escHtml(host).replace(/'/g, '&#039;');
      const domain   = encodeURIComponent(host);
      const px       = size + 'px';

      // Already resolved to letter-avatar this session — skip network
      if (_faviconCache.get(host) === 'letter') {
        return `<img src="${_letterAvatarDataUrl(host)}" style="width:${px};height:${px};border-radius:6px;opacity:1" alt="" />`;
      }

      // Known-good source from a previous render this session
      const known = _faviconCache.get(host);
      let src;
      if (known === 'ddg') {
        src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
      } else if (known === 'google') {
        src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      } else {
        // Default first attempt: Google FaviconV2 — best quality
        src = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size}`;
      }

      return (
        `<img ` +
        `src="${src}" ` +
        `loading="lazy" ` +
        `alt="" ` +
        `data-step="0" ` +
        `style="width:${px};height:${px};border-radius:6px;opacity:0;transition:opacity 0.2s ease" ` +
        `onload="window._faviconLoaded(this,'${safeHost}')" ` +
        `onerror="window._faviconFallback(this,'${safeHost}')" ` +
        `/>`
      );
    } catch { /* fall through to type-glyph */ }
  }
  // No URL — render a type-icon glyph (no network)
  return `<span class="entry-type-icon">${getTypeIcon(entry.entryType)}</span>`;
}


// ─── Entry Detail ─────────────────────────────────────────────────────────────
async function selectEntry(entry) {
  // Full entry (with decrypted password)
  const full = await API.entries.get(entry.id);
  state.selectedEntry = full;

  // Match by id (the previous title-based match selected unrelated entries
  // when two items shared the same title)
  $$('.entry-item').forEach(i => i.classList.toggle('selected', i.dataset.entryId === entry.id));

  renderEntryDetail(full);
}

function renderEntryDetail(entry) {
  const panel = $('#detail-panel');
  if (!panel) return;
  
  const favicon = getFaviconHtml(entry, 48);
  const isLogin = entry.entryType !== 'note' && entry.entryType !== 'card';
  
  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-favicon">${favicon}</div>
      <div class="detail-title-block">
        <div class="detail-title">${escHtml(entry.title || 'Untitled')}</div>
        ${entry.url ? `<div class="detail-url">${escHtml(entry.url)}</div>` : ''}
      </div>
      <div class="detail-actions">
        <button class="btn-icon" id="fav-btn" title="${entry.isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
          style="${entry.isFavorite ? 'color:var(--accent-warning);background:rgba(255,179,0,0.1)' : ''}">
          ${Icon.star}
        </button>
        <button class="btn-icon" id="edit-entry-btn" title="Edit">${Icon.edit}</button>
        <button class="btn-icon" id="history-btn" title="History">${Icon.history}</button>
        <button class="btn-icon" id="delete-entry-btn" title="Delete" style="color:var(--accent-danger)">${Icon.trash}</button>
      </div>
    </div>
    <div class="detail-body" id="detail-body">
      ${renderEntryFields(entry)}
    </div>
  `;

  // Action bindings
  $('#fav-btn').onclick = async () => {
    await API.entries.update(entry.id, { isFavorite: !entry.isFavorite });
    state.entries = await API.entries.getAll();
    entry.isFavorite = !entry.isFavorite;
    renderEntryList();
    renderEntryDetail(entry);
    updateCounts();
  };

  $('#edit-entry-btn').onclick = () => showEditEntryModal(entry);

  $('#delete-entry-btn').onclick = () => {
    showConfirmModal(
      'Delete Entry',
      `Are you sure you want to delete "${entry.title}"? This cannot be undone.`,
      async () => {
        await API.entries.delete(entry.id);
        state.entries = await API.entries.getAll();
        state.selectedEntry = null;
        renderEntryList();
        renderCategoryList();
        updateCounts();
        $('#detail-panel').innerHTML = `<div class="detail-empty"><div class="detail-empty-icon">${_svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 56)}</div><div>Entry deleted</div></div>`;
      },
      'danger'
    );
  };

  $('#history-btn').onclick = () => showHistoryModal(entry);

  // Wire copy buttons
  $$('[data-copy]', panel).forEach(btn => {
    btn.onclick = () => {
      const text = btn.dataset.copy;
      API.clipboard.copySecure(text, 30000);
      toast('Copied to clipboard (clears in 30s)', 'copy');
    };
  });

  // Wire show/hide buttons
  $$('[data-toggle-field]', panel).forEach(btn => {
    btn.onclick = () => {
      const fieldId = btn.dataset.toggleField;
      const field = $(`#field-${fieldId}`, panel);
      if (!field) return;
      if (field.dataset.shown === 'true') {
        field.textContent = '••••••••••••';
        field.dataset.shown = 'false';
        btn.innerHTML = Icon.eye;
      } else {
        field.textContent = field.dataset.value;
        field.dataset.shown = 'true';
        btn.innerHTML = Icon.eyeOff;
      }
    };
  });

  // Start TOTP if needed
  if (entry.totpSecret) {
    startTotpForEntry(entry.id, entry.totpSecret);
  }
}

function renderEntryFields(entry) {
  let html = '';

  if (entry.username) {
    html += fieldHtml('Username', entry.username, { copyable: true, id: 'username' });
  }

  if (entry.password) {
    html += fieldHtml('Password', entry.password, { 
      copyable: true, 
      id: 'password',
      sensitive: true,
      showStrength: true,
      strength: entry.strength,
    });
  }

  if (entry.url) {
    html += fieldHtml('Website', entry.url, { 
      copyable: true,
      id: 'url',
      extra: `<a href="${escHtml(entry.url)}" style="color:var(--accent-secondary);font-size:12px;text-decoration:none" onclick="event.preventDefault();require('electron').shell.openExternal('${escHtml(entry.url)}')">${Icon.link}</a>`
    });
  }

  if (entry.totpSecret) {
    html += `
      <div class="field-group">
        <div class="field-label">Authenticator Code (TOTP)</div>
        <div class="totp-widget" id="totp-widget-${entry.id}">
          <div id="totp-token-${entry.id}" class="totp-token">------</div>
          <div style="flex:1;font-size:11px;color:var(--text-muted)">Refreshes automatically</div>
          <button class="btn-icon-sm" id="totp-copy-${entry.id}" title="Copy code">${Icon.copy}</button>
          <div class="totp-timer" title="Time remaining">
            <svg width="32" height="32" viewBox="0 0 32 32" class="totp-timer-ring">
              <circle class="totp-timer-track" cx="16" cy="16" r="13"/>
              <circle class="totp-timer-progress" id="totp-ring-${entry.id}" cx="16" cy="16" r="13" 
                stroke-dasharray="${2 * Math.PI * 13}" stroke-dashoffset="0"/>
            </svg>
            <div class="totp-secs" id="totp-secs-${entry.id}">30</div>
          </div>
        </div>
      </div>
    `;
  }

  if (entry.cardNumber) {
    html += fieldHtml('Card Number', entry.cardNumber, { copyable: true, sensitive: true, id: 'card' });
    if (entry.cardExpiry) html += fieldHtml('Expiry', entry.cardExpiry, { copyable: true, id: 'expiry' });
    if (entry.cardCvv) html += fieldHtml('CVV', entry.cardCvv, { copyable: true, sensitive: true, id: 'cvv' });
    if (entry.cardHolder) html += fieldHtml('Cardholder', entry.cardHolder, { copyable: true, id: 'holder' });
  }

  if (entry.notes) {
    html += `
      <div class="field-group">
        <div class="field-label">Notes</div>
        <div class="field-value" style="align-items:flex-start;min-height:60px">
          <div class="field-text" style="white-space:pre-wrap;user-select:text">${escHtml(entry.notes)}</div>
        </div>
      </div>
    `;
  }

  // Custom fields
  if (entry.customFields?.length) {
    html += `<div class="divider"></div><div class="section-header">Custom Fields</div>`;
    entry.customFields.forEach((f, i) => {
      html += fieldHtml(f.label, f.value, { copyable: true, sensitive: f.hidden, id: `custom-${i}` });
    });
  }

  // Tags
  if (entry.tags?.length) {
    html += `
      <div class="field-group">
        <div class="field-label">Tags</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${entry.tags.map(t => `<span class="tag">${Icon.tag}<span>${escHtml(t)}</span></span>`).join('')}
          </div>
      </div>
    `;
  }

  // Timestamps
  html += `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)">
        <span>Created: ${formatDate(entry.createdAt)}</span>
        <span>Modified: ${formatDate(entry.updatedAt)}</span>
      </div>
    </div>
  `;

  return html;
}

function fieldHtml(label, value, { copyable = false, sensitive = false, id = '', showStrength = false, strength = '', extra = '' } = {}) {
  const censored = sensitive ? '••••••••••••' : '';
  return `
    <div class="field-group">
      <div class="field-label">${escHtml(label)}</div>
      <div class="field-value">
        <div class="field-text${sensitive ? ' censored' : ''}" 
             id="field-${id}"
             data-value="${escHtml(value)}"
             data-shown="${sensitive ? 'false' : 'true'}"
             style="user-select:text">${sensitive ? censored : escHtml(value)}</div>
        <div class="field-actions">
          ${extra}
          ${sensitive ? `<button class="btn-icon-sm" data-toggle-field="${id}" title="Show/Hide">${Icon.eye}</button>` : ''}
          ${copyable ? `<button class="btn-icon-sm" data-copy="${escHtml(value)}" title="Copy">${Icon.copy}</button>` : ''}
        </div>
      </div>
      ${showStrength && strength ? `
        <div class="strength-bar" data-strength="${strength}" style="margin-top:6px">
          <div class="strength-segment"></div><div class="strength-segment"></div>
          <div class="strength-segment"></div><div class="strength-segment"></div>
          <div class="strength-segment"></div>
        </div>
        <div class="strength-label" data-strength="${strength}" style="font-size:10px;margin-top:3px">${strength.replace('-', ' ')}</div>
      ` : ''}
    </div>
  `;
}

// ─── TOTP Timer ───────────────────────────────────────────────────────────────
function startTotpForEntry(entryId, secret) {
  if (state.totpIntervals[entryId]) clearInterval(state.totpIntervals[entryId]);
  
  async function refresh() {
    const tokenEl = $(`#totp-token-${entryId}`);
    const secsEl = $(`#totp-secs-${entryId}`);
    const ringEl = $(`#totp-ring-${entryId}`);
    const copyBtn = $(`#totp-copy-${entryId}`);
    if (!tokenEl) { clearInterval(state.totpIntervals[entryId]); return; }
    
    const result = await API.totp.generate(secret);
    const { token, remaining } = result;
    
    tokenEl.textContent = token.replace(/(.{3})/, '$1 ');
    if (secsEl) secsEl.textContent = remaining;
    
    if (ringEl) {
      const circumference = 2 * Math.PI * 13;
      const offset = circumference * (1 - remaining / 30);
      ringEl.style.strokeDashoffset = offset;
      ringEl.style.stroke = remaining <= 5 ? 'var(--accent-danger)' : 'var(--accent-secondary)';
    }
    
    if (copyBtn) {
      copyBtn.onclick = () => {
        API.clipboard.copySecure(token, 30000);
        toast('TOTP code copied!', 'copy');
      };
    }
  }
  
  refresh();
  state.totpIntervals[entryId] = setInterval(refresh, 1000);
}

function startTotpTimer() {
  // Refresh active TOTP widgets every second
  setInterval(() => {
    Object.keys(state.totpIntervals).forEach(id => {
      if (!$(`#totp-token-${id}`)) {
        clearInterval(state.totpIntervals[id]);
        delete state.totpIntervals[id];
      }
    });
  }, 5000);
}

// ─── Add/Edit Entry Modal ─────────────────────────────────────────────────────
function showAddEntryModal(prefill = {}) {
  showEntryFormModal(null, prefill);
}

function showEditEntryModal(entry) {
  showEntryFormModal(entry, entry);
}

function showEntryFormModal(entry, prefill = {}) {
  const isEdit = !!entry;
  const categories = state.categories;

  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Entry' : 'New Entry'}</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      <!-- Entry Type Tabs -->
      <div class="tabs tabs-icon" style="margin-bottom:16px" id="type-tabs">
        <button class="tab${(!prefill.entryType || prefill.entryType === 'login') ? ' active' : ''}" data-type="login">${Icon.user}<span>Login</span></button>
        <button class="tab${prefill.entryType === 'card' ? ' active' : ''}" data-type="card">${Icon.creditCard}<span>Card</span></button>
        <button class="tab${prefill.entryType === 'note' ? ' active' : ''}" data-type="note">${Icon.fileText}<span>Note</span></button>
      </div>

      <div class="form-group">
        <label class="form-label">Title *</label>
        <input type="text" id="ef-title" class="form-input" placeholder="e.g. Gmail, GitHub, Netflix..." value="${escHtml(prefill.title || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="ef-category" class="form-select">
          <option value="">No Category</option>
          ${categories.map(c => `<option value="${c.id}" ${prefill.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
        </select>
      </div>

      <!-- Login fields -->
      <div id="login-fields">
        <div class="form-group">
          <label class="form-label">Username / Email</label>
          <input type="text" id="ef-username" class="form-input" placeholder="username@email.com" value="${escHtml(prefill.username || '')}" autocomplete="off" />
        </div>

        <div class="form-group">
          <label class="form-label">Password</label>
          <div style="display:flex;gap:8px">
            <div class="form-input-wrapper" style="flex:1">
              <input type="password" id="ef-password" class="form-input password-field" placeholder="Enter or generate..." value="${escHtml(prefill.password || '')}" autocomplete="new-password" />
              <button class="btn-icon-sm input-action" id="ef-toggle-pw">${Icon.eye}</button>
            </div>
            <button class="btn btn-secondary" id="ef-generate-pw" title="Generate password">${Icon.generate}</button>
          </div>
          <div id="ef-strength-bar" class="strength-bar" data-strength="" style="margin-top:8px">
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div>
          </div>
          <div style="display:flex;justify-content:space-between">
            <div id="ef-strength-label" class="strength-label" data-strength=""></div>
            <div id="ef-breach-indicator" class="form-hint"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Website URL</label>
          <input type="url" id="ef-url" class="form-input" placeholder="https://example.com" value="${escHtml(prefill.url || '')}" />
        </div>

        <div class="form-group">
          <label class="form-label">TOTP Secret (Authenticator)</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="ef-totp" class="form-input font-mono" placeholder="JBSWY3DPEHPK3PXP (Base32)" value="${escHtml(prefill.totpSecret || '')}" />
            <button class="btn btn-secondary" id="ef-setup-totp">Setup</button>
          </div>
        </div>
      </div>

      <!-- Card fields -->
      <div id="card-fields" style="display:none">
        <div class="form-group">
          <label class="form-label">Card Number</label>
          <input type="text" id="ef-card-number" class="form-input font-mono" placeholder="4242 4242 4242 4242" maxlength="19" value="${escHtml(prefill.cardNumber || '')}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">Expiry</label>
            <input type="text" id="ef-card-expiry" class="form-input" placeholder="MM/YY" maxlength="5" value="${escHtml(prefill.cardExpiry || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">CVV</label>
            <input type="text" id="ef-card-cvv" class="form-input" placeholder="123" maxlength="4" value="${escHtml(prefill.cardCvv || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Cardholder Name</label>
          <input type="text" id="ef-card-holder" class="form-input" placeholder="JOHN DOE" value="${escHtml(prefill.cardHolder || '')}" />
        </div>
      </div>

      <!-- Notes field (always visible) -->
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea id="ef-notes" class="form-textarea" placeholder="Additional notes...">${escHtml(prefill.notes || '')}</textarea>
      </div>

      <!-- Tags -->
      <div class="form-group">
        <label class="form-label">Tags</label>
        <input type="text" id="ef-tags" class="form-input" placeholder="work, personal, social (comma-separated)" value="${(prefill.tags || []).join(', ')}" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Save Changes' : 'Add Entry'}</button>
    </div>
  `;

  showModal(modal);

  // Tab switching
  let currentType = prefill.entryType || 'login';
  $$('.tab', modal).forEach(tab => {
    tab.onclick = () => {
      $$('.tab', modal).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      $('#login-fields').style.display = currentType === 'login' ? 'block' : 'none';
      $('#card-fields').style.display = currentType === 'card' ? 'block' : 'none';
    };
  });

  // Password visibility
  let pwVisible = false;
  $('#ef-toggle-pw').onclick = () => {
    pwVisible = !pwVisible;
    $('#ef-password').type = pwVisible ? 'text' : 'password';
    $('#ef-toggle-pw').innerHTML = pwVisible ? Icon.eyeOff : Icon.eye;
  };

  // Password strength
  let strengthTimeout;
  $('#ef-password').addEventListener('input', () => {
    clearTimeout(strengthTimeout);
    strengthTimeout = setTimeout(async () => {
      const pw = $('#ef-password').value;
      if (!pw) return;
      const result = await API.vault.strength(pw);
      $('#ef-strength-bar').dataset.strength = result.label;
      $('#ef-strength-label').textContent = result.label.replace('-', ' ');
      $('#ef-strength-label').dataset.strength = result.label;
    }, 300);
  });

  // Generate password
  $('#ef-generate-pw').onclick = () => showPasswordGeneratorInModal('#ef-password');

  // TOTP setup
  $('#ef-setup-totp').onclick = () => showTotpSetupModal($('#ef-title').value || 'VaultGuard');

  // Save
  $('#modal-save').onclick = async () => {
    const title = $('#ef-title').value.trim();
    if (!title) { toast('Title is required', 'error'); return; }

    const data = {
      title,
      entryType: currentType,
      categoryId: $('#ef-category').value || null,
      username: $('#ef-username')?.value || '',
      password: $('#ef-password')?.value || '',
      url: $('#ef-url')?.value || '',
      notes: $('#ef-notes').value,
      totpSecret: $('#ef-totp')?.value?.replace(/\s/g, '') || null,
      cardNumber: $('#ef-card-number')?.value || null,
      cardExpiry: $('#ef-card-expiry')?.value || null,
      cardCvv: $('#ef-card-cvv')?.value || null,
      cardHolder: $('#ef-card-holder')?.value || null,
      tags: $('#ef-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    };

    // Get password strength
    if (data.password) {
      const s = await API.vault.strength(data.password);
      data.passwordStrength = s.label;
    }

    const btn = $('#modal-save');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    if (isEdit) {
      await API.entries.update(entry.id, data);
      toast('Entry updated', 'success');
    } else {
      await API.entries.create(data);
      toast('Entry added', 'success');
    }

    closeModal();
    state.entries = await API.entries.getAll();
    renderEntryList();
    renderCategoryList();
    updateCounts();
  };

  $('#modal-cancel').onclick = closeModal;
  $('#modal-close').onclick = closeModal;
}

// ─── Password Generator View ──────────────────────────────────────────────────
function renderGeneratorView() {
  return `
    <div class="pane-view">
      <div class="settings-section-title">Password Generator</div>
      <div class="settings-section-desc">Generate cryptographically secure passwords</div>

      <div style="max-width:600px">
        <!-- Type Tabs -->
        <div class="tabs" style="margin-bottom:20px" id="gen-type-tabs">
          <button class="tab active" data-gentype="random">Random</button>
          <button class="tab" data-gentype="passphrase">Passphrase</button>
          <button class="tab" data-gentype="pin">PIN</button>
          <button class="tab" data-gentype="memorable">Memorable</button>
        </div>

        <!-- Output -->
        <div class="generator-output">
          <div class="generator-password" id="gen-output" style="user-select:text">Click Generate</div>
          <button class="btn-icon" id="gen-copy-btn" title="Copy">${Icon.copy}</button>
          <button class="btn-icon" id="gen-refresh-btn" title="Regenerate">${Icon.refresh}</button>
        </div>

        <!-- Strength -->
        <div id="gen-strength-area" style="margin-bottom:16px">
          <div id="gen-strength-bar" class="strength-bar" data-strength="">
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div><div class="strength-segment"></div>
            <div class="strength-segment"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <div id="gen-strength-label" class="strength-label" data-strength=""></div>
            <div id="gen-entropy" class="form-hint"></div>
          </div>
        </div>

        <!-- Options - Random -->
        <div id="gen-options-random">
          <div class="card" style="margin-bottom:14px">
            <div class="form-group">
              <label class="form-label">Length: <span id="gen-length-val">20</span></label>
              <input type="range" id="gen-length" min="8" max="128" value="20" style="width:100%;accent-color:var(--accent-primary)" />
            </div>
            <div class="generator-options">
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Uppercase (A-Z)</span>
                <label class="toggle"><input type="checkbox" id="gen-upper" checked /><div class="toggle-track"></div></label>
              </label>
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Lowercase (a-z)</span>
                <label class="toggle"><input type="checkbox" id="gen-lower" checked /><div class="toggle-track"></div></label>
              </label>
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Numbers (0-9)</span>
                <label class="toggle"><input type="checkbox" id="gen-digits" checked /><div class="toggle-track"></div></label>
              </label>
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Symbols (!@#...)</span>
                <label class="toggle"><input type="checkbox" id="gen-symbols" checked /><div class="toggle-track"></div></label>
              </label>
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Exclude Ambiguous</span>
                <label class="toggle"><input type="checkbox" id="gen-noambig" /><div class="toggle-track"></div></label>
              </label>
              <label class="toggle-wrapper" style="cursor:pointer">
                <span>Require Each Type</span>
                <label class="toggle"><input type="checkbox" id="gen-require" checked /><div class="toggle-track"></div></label>
              </label>
            </div>
          </div>
        </div>

        <!-- Options - Passphrase -->
        <div id="gen-options-passphrase" style="display:none">
          <div class="card" style="margin-bottom:14px">
            <div class="form-group">
              <label class="form-label">Word Count: <span id="gen-words-val">5</span></label>
              <input type="range" id="gen-words" min="3" max="10" value="5" style="width:100%;accent-color:var(--accent-primary)" />
            </div>
            <div class="form-group">
              <label class="form-label">Separator</label>
              <input type="text" id="gen-separator" class="form-input" value="-" maxlength="3" style="max-width:100px" />
            </div>
            <label class="toggle-wrapper">
              <span>Capitalize words</span>
              <label class="toggle"><input type="checkbox" id="gen-capitalize" checked /><div class="toggle-track"></div></label>
            </label>
            <label class="toggle-wrapper">
              <span>Include number</span>
              <label class="toggle"><input type="checkbox" id="gen-includenum" checked /><div class="toggle-track"></div></label>
            </label>
          </div>
        </div>

        <!-- Options - PIN -->
        <div id="gen-options-pin" style="display:none">
          <div class="card" style="margin-bottom:14px">
            <div class="form-group">
              <label class="form-label">PIN Length: <span id="gen-pin-len-val">6</span></label>
              <input type="range" id="gen-pin-len" min="4" max="12" value="6" style="width:100%;accent-color:var(--accent-primary)" />
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-full btn-lg" id="gen-generate-btn">
          ${Icon.generate} Generate Password
        </button>
      </div>
    </div>
  `;
}

function initGenerator() {
  const genBtn = $('#gen-generate-btn');
  if (!genBtn) return;

  let genType = 'random';

  $$('[data-gentype]').forEach(tab => {
    tab.onclick = () => {
      $$('[data-gentype]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      genType = tab.dataset.gentype;
      ['random', 'passphrase', 'pin', 'memorable'].forEach(t => {
        const el = $(`#gen-options-${t}`);
        if (el) el.style.display = t === genType ? 'block' : 'none';
      });
      generatePassword();
    };
  });

  async function generatePassword() {
    const options = { type: genType };

    if (genType === 'random') {
      options.length = parseInt($('#gen-length').value);
      options.uppercase = $('#gen-upper').checked;
      options.lowercase = $('#gen-lower').checked;
      options.digits = $('#gen-digits').checked;
      options.symbols = $('#gen-symbols').checked;
      options.excludeAmbiguous = $('#gen-noambig').checked;
      options.requireEach = $('#gen-require').checked;
    } else if (genType === 'passphrase') {
      options.wordCount = parseInt($('#gen-words').value);
      options.wordSeparator = $('#gen-separator').value;
      options.capitalizeWords = $('#gen-capitalize').checked;
      options.includeNumber = $('#gen-includenum').checked;
    } else if (genType === 'pin') {
      options.pinLength = parseInt($('#gen-pin-len').value);
    }

    const result = await API.passwords.generate(options);
    $('#gen-output').textContent = result.password;

    const bar = $('#gen-strength-bar');
    const label = $('#gen-strength-label');
    const entropy = $('#gen-entropy');
    bar.dataset.strength = result.strength;
    label.textContent = result.strength.replace('-', ' ');
    label.dataset.strength = result.strength;
    if (result.entropy) entropy.textContent = `~${Math.round(result.entropy)} bits`;
  }

  genBtn.onclick = generatePassword;
  $('#gen-refresh-btn').onclick = generatePassword;
  $('#gen-copy-btn').onclick = () => {
    const pw = $('#gen-output').textContent;
    if (pw && pw !== 'Click Generate') {
      API.clipboard.copySecure(pw, 30000);
      toast('Copied to clipboard (clears in 30s)', 'copy');
    }
  };

  // Live update on slider changes
  $$('#gen-length, #gen-words, #gen-pin-len, #gen-upper, #gen-lower, #gen-digits, #gen-symbols, #gen-noambig, #gen-require, #gen-capitalize, #gen-includenum').forEach(input => {
    input.addEventListener('input', () => {
      if (input.id === 'gen-length') $('#gen-length-val').textContent = input.value;
      if (input.id === 'gen-words') $('#gen-words-val').textContent = input.value;
      if (input.id === 'gen-pin-len') $('#gen-pin-len-val').textContent = input.value;
      generatePassword();
    });
  });

  generatePassword();
}

// ─── Security Audit View ──────────────────────────────────────────────────────
function renderSecurityView() {
  return `
    <div class="pane-view">
      <div class="settings-section-title">Security Audit</div>
      <div class="settings-section-desc">Identify and fix security issues in your vault</div>
      
      <div style="max-width:700px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px" id="security-stats">
          <div class="stat-card">
            <div class="stat-icon red">${Icon.alert}</div>
            <div><div class="stat-value" id="sec-breached">-</div><div class="stat-label">Breached</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">${Icon.warning}</div>
            <div><div class="stat-value" id="sec-weak">-</div><div class="stat-label">Weak Passwords</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">${Icon.rotate}</div>
            <div><div class="stat-value" id="sec-reused">-</div><div class="stat-label">Reused Passwords</div></div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
          <button class="btn btn-primary" id="run-breach-check">
            ${Icon.search} Check for Breaches (HaveIBeenPwned)
          </button>
          <button class="btn btn-secondary" id="run-full-audit">
            ${Icon.shieldCheck} Full Security Audit
          </button>
        </div>

        <div id="security-results"></div>
      </div>
    </div>
  `;
}

async function loadSecurityAudit() {
  // Analyze current entries
  const weakEntries = state.entries.filter(e => ['very-weak', 'weak'].includes(e.strength));
  
  // Find reused passwords (need full decrypted data - do client-side)
  const passwordMap = {};
  state.entries.forEach(e => {
    if (e.password) {
      if (!passwordMap[e.password]) passwordMap[e.password] = [];
      passwordMap[e.password].push(e);
    }
  });
  const reusedGroups = Object.values(passwordMap).filter(g => g.length > 1);

  const secWeak = $('#sec-weak');
  const secReused = $('#sec-reused');
  if (secWeak) secWeak.textContent = weakEntries.length;
  // Each reused password counts every entry sharing it once — not the
  // doubled value the previous reduce produced.
  if (secReused) secReused.textContent = reusedGroups.reduce((a, g) => a + g.length, 0);

  // Wire buttons
  const breachBtn = $('#run-breach-check');
  if (breachBtn) {
    breachBtn.onclick = async () => {
      breachBtn.disabled = true;
      breachBtn.innerHTML = '<div class="spinner"></div> Checking... (this may take a while)';
      
      const result = await API.breach.checkAll();
      const secBreached = $('#sec-breached');
      if (secBreached) secBreached.textContent = result.breached?.length || 0;
      
      const resultsEl = $('#security-results');
      if (resultsEl && result.breached?.length) {
        resultsEl.innerHTML = `
          <div class="section-header">Breached Passwords</div>
          ${result.breached.map(b => `
            <div class="health-item">
              <div class="health-status-dot bad"></div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${escHtml(b.title)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${b.username || ''} — found ${b.count?.toLocaleString()} times in data breaches</div>
              </div>
              <span class="badge breach">Breached</span>
            </div>
          `).join('')}
        `;
      } else if (resultsEl) {
        resultsEl.innerHTML = `<div class="audit-success">${Icon.check} No breached passwords found</div>`;
      }
      
      breachBtn.disabled = false;
      breachBtn.innerHTML = `${Icon.search} Check for Breaches (HaveIBeenPwned)`;
    };
  }

  if ($('#run-full-audit')) {
    $('#run-full-audit').onclick = () => {
      const resultsEl = $('#security-results');
      if (!resultsEl) return;
      let html = '';

      if (weakEntries.length) {
        html += `<div class="section-header" style="margin-top:16px">Weak Passwords (${weakEntries.length})</div>`;
        html += weakEntries.map(e => `
          <div class="health-item">
            <div class="health-status-dot warn"></div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${escHtml(e.title)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${escHtml(e.username || '')}</div>
            </div>
            <span class="badge weak">${e.strength}</span>
          </div>
        `).join('');
      }

      if (reusedGroups.length) {
        html += `<div class="section-header" style="margin-top:16px">Reused Passwords</div>`;
        reusedGroups.forEach(group => {
          html += group.map(e => `
            <div class="health-item">
              <div class="health-status-dot warn"></div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${escHtml(e.title)}</div>
                <div style="font-size:11px;color:var(--text-muted)">Shared password with ${group.filter(g => g.id !== e.id).map(g => g.title).join(', ')}</div>
              </div>
              <span class="badge" style="background:rgba(255,179,0,0.1);color:var(--accent-warning)">Reused</span>
            </div>
          `).join('');
        });
      }

      if (!html) {
        html = `<div class="audit-success">${Icon.shieldCheck} Your vault looks great — no issues found.</div>`;
      }

      resultsEl.innerHTML = html;
    };
  }
}

// ─── Cloud View ───────────────────────────────────────────────────────────────
function renderCloudView() {
  return `
    <div class="cloud-page">
      <div class="settings-section-title">Cloud Sync</div>
      <div class="settings-section-desc">End-to-end encrypted. Only ciphertext leaves this device.</div>

      <!-- Compact status strip (no big icon) -->
      <div class="cloud-status-strip" id="cloud-status-strip">
        <span class="pulse-dot"></span>
        <div class="status-text">
          <div class="status-title" id="cloud-status-title">Loading…</div>
          <div class="status-sub" id="cloud-status-sub">Checking connection</div>
        </div>
      </div>

      <div class="cloud-chips">
        <div class="cloud-chip ok">${Icon.shieldCheck}<span>AES-256-GCM</span></div>
        <div class="cloud-chip ok">${Icon.key}<span>Argon2id KDF</span></div>
        <div class="cloud-chip">${Icon.cloud}<span>Firebase</span></div>
        <div class="cloud-chip">${Icon.shield}<span>Zero-knowledge</span></div>
      </div>

      <div id="cloud-connect-form">
        <div class="cloud-segments">
          <button type="button" class="cloud-segment active" data-mode="signin">Sign In</button>
          <button type="button" class="cloud-segment" data-mode="signup">Create Account</button>
        </div>

        <div class="cloud-form-card">
          <div class="cloud-form-section">
            <div class="cloud-form-section-head">
              <span class="cloud-form-section-title">Firebase Project</span>
              <button type="button" class="cloud-help-link" id="cloud-setup-help">${Icon.info}<span>Setup guide</span></button>
            </div>
            <div class="cloud-form-grid">
              <div class="form-group full">
                <label class="form-label">API Key</label>
                <input type="text" id="firebase-api-key" class="form-input" placeholder="AIzaSy…" autocomplete="off" spellcheck="false" />
              </div>
              <div class="form-group">
                <label class="form-label">Project ID</label>
                <input type="text" id="firebase-project-id" class="form-input" placeholder="my-vault-app" autocomplete="off" spellcheck="false" />
              </div>
              <div class="form-group">
                <label class="form-label">Auth Domain</label>
                <input type="text" id="firebase-auth-domain" class="form-input" placeholder="auto" autocomplete="off" spellcheck="false" />
              </div>
            </div>
          </div>

          <div class="cloud-form-section">
            <div class="cloud-form-section-head">
              <span class="cloud-form-section-title">Account</span>
            </div>
            <div class="cloud-form-grid">
              <div class="form-group full">
                <label class="form-label">Email</label>
                <input type="email" id="firebase-email" class="form-input" placeholder="you@example.com" autocomplete="off" />
              </div>
              <div class="form-group full">
                <label class="form-label">Firebase Password <span style="color:var(--text-tertiary);font-weight:400;margin-left:6px">— not your vault password</span></label>
                <input type="password" id="firebase-password" class="form-input" autocomplete="new-password" />
              </div>
            </div>
          </div>

          <div class="cloud-actions">
            <button class="btn btn-primary" id="cloud-submit-btn">Sign In</button>
          </div>
        </div>
      </div>

      <div id="cloud-connected-panel" style="display:none">
        <div class="cloud-stats-grid">
          <div class="cloud-stat up"><div class="cloud-stat-value" id="stat-pushed">0</div><div class="cloud-stat-label">Pushed</div></div>
          <div class="cloud-stat down"><div class="cloud-stat-value" id="stat-pulled">0</div><div class="cloud-stat-label">Pulled</div></div>
          <div class="cloud-stat del"><div class="cloud-stat-value" id="stat-deleted">0</div><div class="cloud-stat-label">Deleted</div></div>
          <div class="cloud-stat conf"><div class="cloud-stat-value" id="stat-conflicts">0</div><div class="cloud-stat-label">Conflicts</div></div>
        </div>

        <div class="cloud-progress-track" id="cloud-progress-track"><div class="cloud-progress-bar"></div></div>
        <div class="cloud-progress-msg" id="cloud-progress"></div>
        <div class="cloud-last-sync" id="last-sync-info">${Icon.clock}<span>Last synced: never</span></div>

        <div class="cloud-toggle-row">
          <div class="cloud-toggle-label">
            ${Icon.refresh}
            <div>
              <div class="cloud-toggle-text-main">Auto-sync</div>
              <div class="cloud-toggle-text-sub">Sync every 5 minutes while unlocked</div>
            </div>
          </div>
          <div class="toggle-switch on" id="cloud-autosync-toggle" role="switch" aria-checked="true" tabindex="0"></div>
        </div>

        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn btn-primary" id="cloud-sync-now-btn" style="flex:1;height:42px">${Icon.cloud} Sync Now</button>
        </div>

        <div class="cloud-danger-zone">
          <div class="left">
            <div class="title">Disconnect cloud</div>
            <div class="sub">Removes credentials from this device. Encrypted backup in Firebase is preserved.</div>
          </div>
          <button class="btn btn-danger" id="cloud-disconnect-btn">Disconnect</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Cloud helpers ────────────────────────────────────────────────────────────
let _cloudListenersRegistered = false;
function _registerCloudListeners() {
  if (_cloudListenersRegistered || !API.cloud.onProgress) return;
  _cloudListenersRegistered = true;
  API.cloud.onProgress(({ stage, msg }) => {
    const track = document.getElementById('cloud-progress-track');
    const el    = document.getElementById('cloud-progress');
    if (track) track.classList.add('visible');
    if (el) el.textContent = msg || stage || '';
  });
  API.cloud.onAutoSyncDone?.(({ stats }) => {
    state.cloudStatus = { ...(state.cloudStatus || {}), lastSync: Date.now() };
    updateCloudBadge();
    if (document.getElementById('last-sync-info')) loadCloudStatus();
  });
  API.cloud.onAutoSyncFail?.(({ error }) => {
    const el = document.getElementById('cloud-progress');
    if (el) el.textContent = 'Auto-sync failed: ' + error;
  });
}

function _relativeTime(ts) {
  if (!ts) return 'never';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5)    return 'just now';
  if (d < 60)   return d + 's ago';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

async function loadCloudStatus() {
  _registerCloudListeners();
  const status = await API.cloud.status();
  state.cloudStatus = status;
  updateCloudBadge();

  const strip   = $('#cloud-status-strip');
  const title   = $('#cloud-status-title');
  const sub     = $('#cloud-status-sub');
  const formEl  = $('#cloud-connect-form');
  const panelEl = $('#cloud-connected-panel');
  if (!strip) return;

  if (status.connected) {
    strip.classList.add('connected');
    title.textContent = `Connected · ${status.email || ''}`;
    sub.textContent   = `${status.projectId || ''} · ${(status.uid || '').slice(0, 16)}…`;
    formEl.style.display = 'none';
    panelEl.style.display = 'block';

    const refreshLastSync = () => {
      const info = $('#last-sync-info');
      if (info) info.innerHTML = `${Icon.clock}<span>Last synced: ${_relativeTime(status.lastSync)}</span>`;
    };
    refreshLastSync();
    if (window._lastSyncTimer) clearInterval(window._lastSyncTimer);
    window._lastSyncTimer = setInterval(refreshLastSync, 30_000);

    const toggle = $('#cloud-autosync-toggle');
    const setToggle = (on) => {
      toggle.classList.toggle('on', on);
      toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    };
    setToggle(status.autoSync !== false);
    const toggleHandler = async () => {
      status.autoSync = status.autoSync === false ? true : false;
      setToggle(status.autoSync);
      await API.settings.set({ cloudAutoSync: status.autoSync });
      toast('Auto-sync ' + (status.autoSync ? 'enabled' : 'disabled'), 'info');
    };
    toggle.onclick = toggleHandler;
    toggle.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleHandler(); } };

    $('#cloud-sync-now-btn').onclick = async () => {
      const btn   = $('#cloud-sync-now-btn');
      const track = $('#cloud-progress-track');
      btn.disabled = true;
      btn.innerHTML = `${Icon.cloud} Syncing…`;
      track?.classList.add('visible');
      const result = await API.cloud.sync();
      track?.classList.remove('visible');
      btn.disabled = false;
      btn.innerHTML = `${Icon.cloud} Sync Now`;
      $('#cloud-progress').textContent = '';
      if (result.success) {
        status.lastSync = result.lastSync || Date.now();
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v || 0; };
        set('#stat-pushed',    result.pushedEntries);
        set('#stat-pulled',    result.pulledEntries);
        set('#stat-deleted',  (result.deletedLocal || 0) + (result.deletedRemote || 0));
        set('#stat-conflicts', result.conflicts);
        toast(`Sync complete in ${Math.round((result.durationMs||0)/100)/10}s`, 'success');
        refreshLastSync();
        try { await loadAllEntries?.(); renderEntryList?.(); } catch {}
      } else {
        toast(result.error || 'Sync failed', 'error');
      }
    };

    $('#cloud-disconnect-btn').onclick = () => {
      showConfirmModal('Disconnect cloud sync?',
        'Your local vault stays intact. The encrypted copy in Firebase is preserved.',
        async () => {
          await API.cloud.disconnect();
          state.cloudStatus = { connected: false };
          updateCloudBadge();
          loadCloudStatus();
        });
    };
  } else {
    strip.classList.remove('connected');
    title.textContent = 'Not connected';
    sub.textContent   = 'Sign in with a Firebase account to enable sync';
    formEl.style.display = 'block';
    panelEl.style.display = 'none';

    let mode = 'signin';
    const segs = $$('.cloud-segment');
    segs.forEach(b => {
      b.onclick = () => {
        segs.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        mode = b.dataset.mode;
        const sub = $('#cloud-submit-btn');
        if (sub) sub.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
      };
    });

    const help = $('#cloud-setup-help');
    if (help) help.onclick = (e) => { e.preventDefault(); showFirebaseSetupModal(); };

    $('#cloud-submit-btn').onclick = async () => {
      const config = {
        apiKey:     $('#firebase-api-key').value.trim(),
        projectId:  $('#firebase-project-id').value.trim(),
        authDomain: $('#firebase-auth-domain').value.trim(),
        email:      $('#firebase-email').value.trim(),
        password:   $('#firebase-password').value,
        action:     mode,
      };
      if (!config.apiKey || !config.projectId || !config.email || !config.password) {
        toast('Please fill all required fields', 'error');
        return;
      }
      const btn = $('#cloud-submit-btn');
      btn.disabled = true;
      const origLabel = btn.textContent;
      btn.innerHTML = `<span class="spinner"></span> Connecting…`;
      const result = await API.cloud.connect(config);
      btn.disabled = false;
      btn.textContent = origLabel;
      if (result.success) {
        state.cloudStatus = await API.cloud.status();
        updateCloudBadge();
        toast('Connected — pushing initial vault…', 'success');
        loadCloudStatus();
        setTimeout(() => $('#cloud-sync-now-btn')?.click(), 700);
      } else {
        toast(result.error || 'Connection failed', 'error');
      }
    };
  }
}

// ─── Firebase setup guide modal ────────────────────────────────────────────────
function showFirebaseSetupModal() {
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${Icon.cloud} Firebase Setup — 2 minutes</div>
      <button class="btn-icon-sm" id="fb-help-close" aria-label="Close">${Icon.x}</button>
    </div>
    <div class="modal-body">
      <div class="setup-guide">
        <div class="setup-step">
          <div class="setup-step-num">1</div>
          <div class="setup-step-body">
            <div class="setup-step-title">Create a Firebase project</div>
            <div class="setup-step-desc">Open the Firebase console and click <b>Add project</b>. The free Spark tier covers personal vaults.</div>
            <button class="setup-step-action" data-open="https://console.firebase.google.com/">${Icon.link}<span>Open Firebase Console</span></button>
          </div>
        </div>
        <div class="setup-step">
          <div class="setup-step-num">2</div>
          <div class="setup-step-body">
            <div class="setup-step-title">Enable Email/Password authentication</div>
            <div class="setup-step-desc">In your project: <code>Build → Authentication → Get started</code>, enable <b>Email/Password</b>.</div>
          </div>
        </div>
        <div class="setup-step">
          <div class="setup-step-num">3</div>
          <div class="setup-step-body">
            <div class="setup-step-title">Create the Firestore database</div>
            <div class="setup-step-desc">Go to <code>Build → Firestore Database → Create database</code>. Start in <b>production mode</b>.</div>
          </div>
        </div>
        <div class="setup-step">
          <div class="setup-step-num">4</div>
          <div class="setup-step-body">
            <div class="setup-step-title">Copy your apiKey and projectId</div>
            <div class="setup-step-desc"><code>Project settings ⚙ → General → Your apps</code>, click <code>&lt;/&gt;</code>, register an app. Copy the <b>apiKey</b> and <b>projectId</b> into the form.</div>
          </div>
        </div>
        <div class="setup-step">
          <div class="setup-step-num">5</div>
          <div class="setup-step-body">
            <div class="setup-step-title">Lock down Firestore (recommended)</div>
            <div class="setup-step-desc">Open <code>Firestore → Rules</code> and paste the contents of <code>firestore.rules</code>.</div>
            <button class="setup-step-action" id="copy-rules-btn">${Icon.copy}<span>Copy security rules</span></button>
          </div>
        </div>
      </div>
      <div class="setup-footer-note">
        ${Icon.shieldCheck}
        <span><b>Your master password never leaves this device.</b> Firebase only stores opaque AES-256-GCM ciphertext.</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="fb-help-done">${Icon.check} Got it</button>
    </div>
  `;
  showModal(modal);
  $('#fb-help-close').onclick = closeModal;
  $('#fb-help-done').onclick  = closeModal;
  $$('.setup-step-action[data-open]', modal).forEach(b => {
    b.onclick = async (e) => {
      e.preventDefault();
      const url = b.dataset.open;
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast('Opening in browser…', 'info');
      } catch {
        try { await navigator.clipboard.writeText(url); toast('URL copied: ' + url, 'info'); }
        catch { toast(url, 'info', 6000); }
      }
    };
  });
  $('#copy-rules-btn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES_TEXT);
      toast('Security rules copied to clipboard', 'success');
    } catch {
      toast('Open firestore.rules from your VaultGuard folder', 'info');
    }
  };
}

const FIRESTORE_RULES_TEXT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    function hasUpdatedAt() {
      return request.resource.data.clientUpdatedAt is int
          && request.resource.data.clientUpdatedAt > 0;
    }
    function sizeOK() { return request.resource.size() < 1048576; }
    match /vaults/{uid} {
      allow read, write: if false;
      match /meta/{docId} {
        allow read:  if isOwner(uid);
        allow write: if isOwner(uid) && sizeOK();
      }
      match /entries/{entryId} {
        allow read:   if isOwner(uid);
        allow create, update: if isOwner(uid) && sizeOK() && hasUpdatedAt();
        allow delete: if isOwner(uid);
      }
      match /categories/{catId} {
        allow read:   if isOwner(uid);
        allow create, update: if isOwner(uid) && sizeOK() && hasUpdatedAt();
        allow delete: if isOwner(uid);
      }
    }
    match /{document=**} { allow read, write: if false; }
  }
}`;

// ─── Audit Log View ───────────────────────────────────────────────────────────
function renderAuditLogView() {
  return `
    <div class="pane-view">
      <div class="settings-section-title">Audit Log</div>
      <div class="settings-section-desc">Track all actions performed on your vault</div>
      <div id="audit-log-list"></div>
    </div>
  `;
}

async function loadAuditLog() {
  const logs = await API.audit.getLog();
  const list = $('#audit-log-list');
  if (!list) return;

  const actionIcons = {
    vault_created: Icon.plus, vault_unlocked: Icon.unlock, vault_locked: Icon.lock,
    entry_viewed:  Icon.eye,        entry_created:  Icon.plus,   entry_updated: Icon.edit,
    entry_deleted: Icon.trash,      master_password_changed: Icon.key,
    category_added: Icon.file,    category_updated: Icon.edit, category_deleted: Icon.trash,
    vault_change_password_failed: Icon.alert, vault_password_changed: Icon.key,
  };

  list.innerHTML = logs.map(log => `
    <div class="health-item" style="margin-bottom:6px">
      <span class="audit-glyph">${actionIcons[log.action] || Icon.list}</span>
      <div style="flex:1">
        <div style="font-size:12.5px;font-weight:500">${escHtml(log.action.replace(/_/g, ' '))}</div>
        ${log.details ? `<div style="font-size:11px;color:var(--text-muted)">${escHtml(log.details)}</div>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-muted)">${formatDate(log.timestamp)}</div>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:13px">No audit entries yet</div>';
}

// ─── Settings View ────────────────────────────────────────────────────────────
function renderSettingsView() {
  return `
    <div class="pane-view">
      <div class="settings-section-title">Settings</div>
      <div class="settings-section-desc">Customize VaultGuard's behavior and security</div>

      <div style="max-width:560px">
        <div class="section-header">Security</div>
        <div class="settings-group">
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Auto-Lock Timeout</div>
              <div class="settings-item-desc">Automatically lock after inactivity</div>
            </div>
            <select class="form-select" id="setting-autolock" style="width:150px">
              <option value="0">Never</option>
              <option value="60000">1 minute</option>
              <option value="300000" selected>5 minutes</option>
              <option value="600000">10 minutes</option>
              <option value="1800000">30 minutes</option>
              <option value="3600000">1 hour</option>
            </select>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Clipboard Clear Time</div>
              <div class="settings-item-desc">Clear clipboard after copying</div>
            </div>
            <select class="form-select" id="setting-clipboard" style="width:150px">
              <option value="10000">10 seconds</option>
              <option value="30000" selected>30 seconds</option>
              <option value="60000">1 minute</option>
              <option value="0">Never</option>
            </select>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Change Master Password</div>
              <div class="settings-item-desc">Re-encrypt vault with new password</div>
            </div>
            <button class="btn btn-secondary" id="change-master-btn">Change</button>
          </div>
        </div>

        <div class="section-header" style="margin-top:20px">Data Management</div>
        <div class="settings-group">
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Export Vault</div>
              <div class="settings-item-desc">Download all entries as JSON or CSV</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary" id="export-json-btn">JSON</button>
              <button class="btn btn-secondary" id="export-csv-btn">CSV</button>
            </div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Import</div>
              <div class="settings-item-desc">Import from other password managers</div>
            </div>
            <button class="btn btn-secondary" id="import-btn">Import</button>
          </div>
        </div>

        <div class="section-header" style="margin-top:20px">About</div>
        <div class="settings-group">
          <div class="settings-item">
            <div class="settings-item-label">VaultGuard</div>
            <div style="font-size:12px;color:var(--text-muted)">v1.0.0</div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Encryption</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:right">AES-256-GCM + Argon2id</div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Key Derivation</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:right">Argon2id + HKDF</div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Breach Checking</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);text-align:right">HaveIBeenPwned (k-anonymity)</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Settings Wiring ──────────────────────────────────────────────────────────
function loadSettings() {
  // Auto-lock select
  const autolockEl = $('#setting-autolock');
  if (autolockEl) {
    autolockEl.value = String(state.settings.autoLockMs ?? 300000);
    autolockEl.onchange = () => {
      state.settings.autoLockMs = parseInt(autolockEl.value);
      API.settings.set({ autoLockMs: state.settings.autoLockMs });
      toast('Auto-lock setting saved', 'success');
    };
  }

  // Clipboard clear select
  const clipboardEl = $('#setting-clipboard');
  if (clipboardEl) {
    clipboardEl.value = String(state.settings.clipboardClearMs ?? 30000);
    clipboardEl.onchange = () => {
      state.settings.clipboardClearMs = parseInt(clipboardEl.value);
      API.settings.set({ clipboardClearMs: state.settings.clipboardClearMs });
      toast('Clipboard setting saved', 'success');
    };
  }

  // Change master password
  const changeMasterBtn = $('#change-master-btn');
  if (changeMasterBtn) {
    changeMasterBtn.onclick = () => showChangeMasterPasswordModal();
  }

  // Export JSON
  const exportJsonBtn = $('#export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.onclick = async () => {
      const entries = state.entries;
      if (!entries.length) { toast('No entries to export', 'warning'); return; }
      // Fetch full (decrypted) entries
      const full = await Promise.all(entries.map(e => API.entries.get(e.id)));
      const json = JSON.stringify({ version: 1, exported: new Date().toISOString(), entries: full }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'vaultguard-export.json'; a.click();
      URL.revokeObjectURL(url);
      toast('Vault exported as JSON', 'success');
    };
  }

  // Export CSV
  const exportCsvBtn = $('#export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.onclick = async () => {
      const entries = state.entries;
      if (!entries.length) { toast('No entries to export', 'warning'); return; }
      const full = await Promise.all(entries.map(e => API.entries.get(e.id)));
      const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
      const header = ['title','username','email','password','url','notes','entryType','tags'].join(',');
      const rows = full.map(e =>
        [e.title,e.username,e.email,e.password,e.url,e.notes,e.entryType,(e.tags||[]).join(';')].map(esc).join(',')
      );
      const csv = [header, ...rows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'vaultguard-export.csv'; a.click();
      URL.revokeObjectURL(url);
      toast('Vault exported as CSV', 'success');
    };
  }

  // Import
  const importBtn = $('#import-btn');
  if (importBtn) {
    importBtn.onclick = () => showImportModal();
  }
}

// ─── Change Master Password Modal ─────────────────────────────────────────────
function showChangeMasterPasswordModal() {
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Change Master Password</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
        Your vault will be re-encrypted with the new password. This cannot be undone.
      </p>
      <div class="form-group">
        <label class="form-label">Current Password</label>
        <input type="password" id="cmp-current" class="form-input" placeholder="Current master password" />
      </div>
      <div class="form-group">
        <label class="form-label">New Password</label>
        <input type="password" id="cmp-new" class="form-input" placeholder="New master password" />
      </div>
      <div class="form-group">
        <label class="form-label">Confirm New Password</label>
        <input type="password" id="cmp-confirm" class="form-input" placeholder="Repeat new password" />
      </div>
      <div id="cmp-error" class="form-error hidden"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="cmp-save">Change Password</button>
    </div>
  `;
  showModal(modal);
  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;
  $('#cmp-save').onclick = async () => {
    const current = $('#cmp-current').value;
    const next    = $('#cmp-new').value;
    const confirm = $('#cmp-confirm').value;
    const errEl   = $('#cmp-error');
    errEl.classList.add('hidden');

    if (!current) { errEl.textContent = 'Enter your current password'; errEl.classList.remove('hidden'); return; }
    if (!next)    { errEl.textContent = 'Enter a new password'; errEl.classList.remove('hidden'); return; }
    if (next !== confirm) { errEl.textContent = 'New passwords do not match'; errEl.classList.remove('hidden'); return; }

    const strength = await API.vault.strength(next);
    if (strength.score < 2) {
      errEl.textContent = 'New password is too weak — use at least "fair" strength';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = $('#cmp-save');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Changing...';

    // Use the dedicated re-encryption IPC. The previous flow called
    // vault.create() after unlock() which only rewrote the salt + verify
    // metadata while leaving every existing entry encrypted under the OLD
    // key — effectively nuking the vault. The new IPC re-encrypts every
    // entry inside one transaction.
    const result = await API.vault.changeMasterPassword({
      currentPassword: current,
      newPassword: next,
    });
    if (result.success) {
      toast(`Master password changed (${result.reencrypted ?? 0} entries re-encrypted)`, 'success');
      closeModal();
    } else {
      errEl.textContent = result.error || 'Failed to change password';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = 'Change Password';
    }
  };
}

// ─── Import Modal (Universal — 15+ password managers) ──────────────────────────
const IMPORT_FORMATS = [
  { label: 'Auto-detect',    value: 'auto',           accept: '.csv,.json,.xml,.1pux,.vgb' },
  { label: 'VaultGuard JSON', value: 'vaultguard_json', accept: '.json' },
  { label: 'Chrome CSV',      value: 'chrome_csv',     accept: '.csv' },
  { label: 'Firefox CSV',     value: 'firefox_csv',    accept: '.csv' },
  { label: 'Bitwarden',       value: 'bitwarden',      accept: '.json,.csv' },
  { label: 'LastPass CSV',    value: 'lastpass_csv',   accept: '.csv' },
  { label: '1Password',       value: '1password',      accept: '.csv,.1pux' },
  { label: 'KeePass / KeePassXC', value: 'keepass',   accept: '.xml,.csv' },
  { label: 'Dashlane',        value: 'dashlane',       accept: '.json,.csv' },
  { label: 'NordPass CSV',    value: 'nordpass_csv',   accept: '.csv' },
  { label: 'Enpass JSON',     value: 'enpass_json',    accept: '.json' },
  { label: 'RoboForm CSV',    value: 'roboform_csv',   accept: '.csv' },
  { label: 'Encrypted Backup (.vgb)', value: 'vgb',   accept: '.vgb' },
];

function showImportModal() {
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Import Passwords</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">

      <!-- Format selector -->
      <div>
        <div class="field-label" style="margin-bottom:6px">Source / Format</div>
        <select id="import-format-select" class="form-input" style="width:100%">
          ${IMPORT_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
        </select>
      </div>

      <!-- Conflict resolution -->
      <div>
        <div class="field-label" style="margin-bottom:6px">If entry already exists</div>
        <div style="display:flex;gap:8px">
          ${[
            ['skip',      'Skip',      '↷', 'Keep existing — skip duplicates'],
            ['overwrite', 'Overwrite', '↺', 'Replace existing with imported'],
            ['duplicate', 'Add Both',  '+',  'Import as copy with "(imported)" suffix'],
          ].map(([val, label, icon, tip]) => `
            <label style="flex:1;display:flex;align-items:center;gap:8px;padding:9px 12px;
              background:var(--bg-elevated);border:1px solid var(--border-normal);border-radius:8px;
              cursor:pointer;font-size:12px;color:var(--text-secondary);transition:all 0.15s"
              class="conflict-opt" data-val="${val}">
              <input type="radio" name="conflict" value="${val}" ${val==='skip'?'checked':''} style="display:none">
              <span style="font-size:15px">${icon}</span>
              <div><div style="font-weight:600;color:var(--text-primary)">${label}</div>
              <div style="font-size:10px;opacity:0.7">${tip}</div></div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- VGB password (only shown for encrypted backup) -->
      <div id="vgb-password-section" style="display:none">
        <div class="field-label" style="margin-bottom:6px">Backup Password</div>
        <input type="password" id="vgb-password" class="form-input" placeholder="Enter export password" style="width:100%">
      </div>

      <!-- Drop zone -->
      <div id="import-dropzone" style="
        border:2px dashed var(--border-normal);border-radius:10px;padding:28px 20px;
        text-align:center;cursor:pointer;transition:all 0.2s;background:var(--bg-void)">
        <div class="import-dropzone-icon">${_svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 36)}</div>
        <div style="font-size:13px;color:var(--text-primary);font-weight:500">Drop file here or click to browse</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="import-accept-hint">Accepts CSV, JSON, XML, .1pux, .vgb</div>
        <input type="file" id="import-file-input" style="display:none">
      </div>

      <!-- Preview (hidden until file loaded) -->
      <div id="import-preview" style="display:none">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div id="import-summary" style="flex:1;font-size:13px;color:var(--text-secondary)"></div>
          <div id="import-format-badge" style="font-size:10px;padding:2px 8px;background:rgba(99,102,241,0.15);color:var(--accent-primary);border-radius:10px;font-weight:500"></div>
          <button class="btn btn-ghost" id="import-clear-btn" style="font-size:11px;padding:4px 10px">✕ Clear</button>
        </div>
        <!-- Stats row -->
        <div id="import-stats" style="display:flex;gap:8px;margin-bottom:8px"></div>
        <!-- Entry list preview -->
        <div id="import-entry-list" style="
          max-height:200px;overflow-y:auto;border:1px solid var(--border-subtle);
          border-radius:8px;background:var(--bg-elevated)"></div>
        <div id="import-warnings" style="margin-top:8px;font-size:11px;color:var(--accent-warning)"></div>
      </div>

      <div id="import-error" class="form-error hidden"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="import-confirm-btn" disabled>Import</button>
    </div>
  `;
  showModal(modal);

  // ── State ──────────────────────────────────────────────────────────────────
  let fileContent = null;
  let fileName    = null;
  let parsedCount = 0;

  const formatSelect = $('#import-format-select');
  const dropzone     = $('#import-dropzone');
  const fileInput    = $('#import-file-input');
  const preview      = $('#import-preview');
  const summary      = $('#import-summary');
  const badgeEl      = $('#import-format-badge');
  const entryList    = $('#import-entry-list');
  const warnings     = $('#import-warnings');
  const errEl        = $('#import-error');
  const confirmBtn   = $('#import-confirm-btn');
  const vgbSection   = $('#vgb-password-section');
  const hintEl       = $('#import-accept-hint');

  // ── Conflict radio styling ─────────────────────────────────────────────────
  $$('.conflict-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.conflict-opt').forEach(o => { o.style.borderColor='var(--border-normal)'; o.style.background='var(--bg-elevated)'; });
      opt.style.borderColor = 'var(--accent-primary)';
      opt.style.background  = 'rgba(99,102,241,0.08)';
      opt.querySelector('input').checked = true;
    });
  });
  // Activate default
  $$('.conflict-opt')[0].click();

  // ── Format change ──────────────────────────────────────────────────────────
  formatSelect.addEventListener('change', () => {
    const fmt = IMPORT_FORMATS.find(f => f.value === formatSelect.value);
    fileInput.accept = fmt?.accept || '*';
    hintEl.textContent = `Accepts: ${fmt?.accept || 'any file'}`;
    vgbSection.style.display = formatSelect.value === 'vgb' ? '' : 'none';
    resetPreview();
  });

  // ── Drag + drop ────────────────────────────────────────────────────────────
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-primary)';
    dropzone.style.background  = 'rgba(99,102,241,0.05)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-normal)';
    dropzone.style.background  = 'var(--bg-void)';
  });
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-normal)';
    dropzone.style.background  = 'var(--bg-void)';
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

  // ── Clear ──────────────────────────────────────────────────────────────────
  $('#import-clear-btn').onclick = resetPreview;

  // ── Read file ──────────────────────────────────────────────────────────────
  function readFile(file) {
    errEl.classList.add('hidden');
    if (file.size > 50 * 1024 * 1024) { showError('File too large (max 50 MB).'); return; }

    fileName = file.name;
    const reader = new FileReader();
    reader.onerror = () => showError('Could not read file.');
    reader.onload = e => {
      fileContent = e.target.result;

      if (formatSelect.value === 'vgb') {
        // Encrypted backup — just show ready state, decrypt on confirm
        preview.style.display  = '';
        dropzone.style.display = 'none';
        summary.textContent    = 'Encrypted VaultGuard backup ready';
        badgeEl.textContent    = '.vgb';
        entryList.innerHTML    = '<div style="padding:12px;font-size:12px;color:var(--text-muted)">Contents will be decrypted and previewed after you enter your backup password and click Import.</div>';
        parsedCount = 1; // fake count so button enables
        confirmBtn.disabled = false;
        return;
      }

      previewFile(fileContent, fileName);
    };
    reader.readAsText(file);
  }

  function previewFile(content, name) {
    // Send to main process for parse (or we can do a quick client-side preview)
    // For preview, we use a lightweight client-side parse
    try {
      const rows = quickParseForPreview(name, content);
      if (!rows || rows.length === 0) { showError('No entries found. Check the file format.'); return; }

      parsedCount = rows.length;

      preview.style.display  = '';
      dropzone.style.display = 'none';
      summary.textContent    = `${rows.length} entr${rows.length===1?'y':'ies'} ready to import`;
      badgeEl.textContent    = detectFormatLabel(name, content);

      // Stats
      const withPw  = rows.filter(r => r.password).length;
      const withTotp = rows.filter(r => r.totpSecret).length;
      const withNotes = rows.filter(r => r.notes).length;
      $('#import-stats').innerHTML = [
        withPw   ? `<span class="import-stat-pill success">${Icon.key} ${withPw} passwords</span>` : '',
        withTotp ? `<span class="import-stat-pill primary">${Icon.shieldCheck} ${withTotp} TOTP</span>` : '',
        withNotes? `<span class="import-stat-pill warning">${Icon.fileText} ${withNotes} notes</span>` : '',
      ].join('');

      entryList.innerHTML = rows.slice(0, 60).map(e => `
        <div class="import-row">
          <span class="import-row-icon">${getTypeIcon(e.entryType || 'login')}</span>
          <div style="flex:1;min-width:0">
            <div class="import-row-title">${escHtml(e.title||e.username||'Untitled')}</div>
            <div class="import-row-meta">${escHtml(e.username||e.url||'')}</div>
          </div>
          <span class="import-row-flags" aria-label="flags">
            ${e.password ? Icon.key : ''}
            ${e.totpSecret ? Icon.shieldCheck : ''}
          </span>
        </div>
      `).join('') + (rows.length > 60 ? `<div class="import-row-more">… and ${rows.length - 60} more</div>` : '');

      confirmBtn.disabled = false;
    } catch(e) {
      showError(`Preview failed: ${e.message}. Import will still attempt the full parse.`);
      parsedCount = 1;
      confirmBtn.disabled = false;
    }
  }

  // ── Quick client-side preview parse ───────────────────────────────────────
  function quickParseForPreview(name, content) {
    const n = name.toLowerCase();
    if (n.endsWith('.xml')) {
      const matches = content.match(/<Entry>/g);
      return matches ? Array(matches.length).fill({ entryType:'login', title:'Entry', username:'', password:'', totpSecret:'', notes:'' }) : [];
    }
    if (n.endsWith('.json') || n.endsWith('.1pux')) {
      try {
        const p = JSON.parse(content);
        const items = Array.isArray(p) ? p : (p.entries || p.items || p.CREDENTIALS || p.credentials || []);
        return items.map(e => ({
          title:      e.name || e.title || e.note_title || '',
          username:   e.username || e.login || (e.login_fields||[]).find(f=>f.designation==='username')?.value || '',
          password:   e.password || (e.login_fields||[]).find(f=>f.designation==='password')?.value || '',
          totpSecret: e.totp || (e.login||{}).totp || '',
          notes:      e.notes || e.note || '',
          entryType:  e.type === 3 ? 'card' : 'login',
        }));
      } catch { return []; }
    }
    // CSV
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].toLowerCase().split(',');
    const getIdx = (...keys) => { for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i>=0) return i; } return -1; };
    const ti = getIdx('name','title','service');
    const ui = getIdx('username','user','login');
    const pi = getIdx('password','pass');
    const oi = getIdx('totp','otp');
    const ni = getIdx('note','extra','comment');
    return lines.slice(1).filter(l=>l.trim()).map(line => {
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const g = i => i>=0 ? (cols[i]||'').replace(/^"|"$/g,'').trim() : '';
      return { title:g(ti), username:g(ui), password:g(pi), totpSecret:g(oi), notes:g(ni), entryType:'login' };
    });
  }

  function detectFormatLabel(name, content) {
    const n = name.toLowerCase();
    if (n.includes('bitwarden')) return 'Bitwarden';
    if (n.includes('lastpass'))  return 'LastPass';
    if (n.includes('1password') || n.endsWith('.1pux')) return '1Password';
    if (n.includes('keepass'))   return 'KeePass';
    if (n.includes('dashlane'))  return 'Dashlane';
    if (n.includes('nordpass'))  return 'NordPass';
    if (n.endsWith('.xml'))      return 'KeePass XML';
    if (n.endsWith('.json'))     return 'JSON';
    if (n.endsWith('.csv')) {
      const h = content.split('\n')[0].toLowerCase();
      if (h.includes('login_uri')) return 'Bitwarden CSV';
      if (h.includes('httprealm')) return 'Firefox CSV';
      if (h.includes('grouping'))  return 'LastPass CSV';
      if (h.includes('totp') && h.includes('last modified')) return 'KeePassXC CSV';
      if (h.includes('cardnumber')) return 'NordPass CSV';
      return 'Generic CSV';
    }
    return 'Unknown';
  }

  function resetPreview() {
    fileContent = null; fileName = null; parsedCount = 0;
    preview.style.display  = 'none';
    dropzone.style.display = '';
    errEl.classList.add('hidden');
    confirmBtn.disabled = true;
    fileInput.value = '';
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    resetPreview();
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  confirmBtn.onclick = async () => {
    if (!fileContent || !fileName) return;
    const strategy = document.querySelector('input[name="conflict"]:checked')?.value || 'skip';

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="spinner"></div> Importing…';

    let result;

    if (formatSelect.value === 'vgb' || fileName.endsWith('.vgb')) {
      // Encrypted backup
      const pass = $('#vgb-password')?.value;
      if (!pass) { showError('Enter the backup password.'); confirmBtn.disabled=false; confirmBtn.innerHTML='Import'; return; }
      result = await API.importExport.importEncrypted({ blob: fileContent, password: pass, strategy });
    } else {
      // Plain CSV / JSON / XML
      result = await API.importExport.import(fileName, fileContent, strategy);
    }

    if (result?.success) {
      closeModal();
      state.entries = await API.entries.getAll();
      renderEntryList();
      renderCategoryList();
      updateCounts();
      const msg = result.updated > 0
        ? `✓ Imported ${result.created} new, updated ${result.updated}, skipped ${result.skipped}`
        : `✓ Imported ${result.imported || result.created} entr${result.imported===1?'y':'ies'} successfully`;
      toast(msg, 'success', 5000);
    } else {
      errEl.textContent = result?.error || 'Import failed — please try again.';
      errEl.classList.remove('hidden');
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = 'Import';
    }
  };

  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;
}


// ─── History Modal ─────────────────────────────────────────────────────────────
async function showHistoryModal(entry) {
  const history = await API.entries.getHistory(entry.id);

  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Password History — ${escHtml(entry.title)}</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      ${history.length ? history.map(h => `
        <div class="health-item" style="margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text-muted)">${formatDate(h.changedAt)}</div>
            <div style="font-size:13px;margin-top:2px">${escHtml(h.title)}</div>
          </div>
        </div>
      `).join('') : '<div style="color:var(--text-muted);font-size:13px">No history available</div>'}
    </div>
  `;

  showModal(modal);
  $('#modal-close').onclick = closeModal;
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function showConfirmModal(title, message, onConfirm, type = 'default') {
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${escHtml(title)}</div>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);font-size:13px">${escHtml(message)}</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
      <button class="btn btn-${type === 'danger' ? 'danger' : 'primary'}" id="confirm-ok">Confirm</button>
    </div>
  `;
  showModal(modal);
  $('#confirm-cancel').onclick = closeModal;
  $('#confirm-ok').onclick = () => { closeModal(); onConfirm(); };
}

// ─── TOTP Setup Modal ─────────────────────────────────────────────────────────
async function showTotpSetupModal(label) {
  const result = await API.totp.setup(label, 'VaultGuard');
  
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Setup Authenticator</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body" style="text-align:center">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Scan this QR code with Google Authenticator, Authy, or any TOTP app</p>
      <img src="${result.qrCode}" style="border-radius:12px;border:1px solid var(--border-normal)" width="200" height="200" />
      <div style="margin-top:16px">
        <div class="field-label">Or enter this secret manually:</div>
        <div class="field-value" style="margin-top:6px">
          <div class="field-text font-mono" style="user-select:text;word-break:break-all">${result.secret}</div>
          <button class="btn-icon-sm" data-copy="${result.secret}">${Icon.copy}</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="totp-done">Done — copy secret to entry</button>
    </div>
  `;
  
  showModal(modal);
  $('#modal-close').onclick = closeModal;
  $('#totp-done').onclick = () => {
    const totpInput = $('#ef-totp');
    if (totpInput) totpInput.value = result.secret;
    closeModal();
  };
  $$('[data-copy]', modal).forEach(btn => {
    btn.onclick = () => { API.clipboard.copySecure(btn.dataset.copy, 30000); toast('Copied!', 'copy'); };
  });
}

// ─── Generator In Modal ────────────────────────────────────────────────────────
async function showPasswordGeneratorInModal(targetSelector) {
  const result = await API.passwords.generate({ type: 'random', length: 20 });
  
  const modal = el('div', { class: 'modal' });
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">Quick Generate</div>
      <button class="btn-icon-sm" id="modal-close">${Icon.x}</button>
    </div>
    <div class="modal-body">
      <div class="generator-output">
        <div class="generator-password" id="quick-gen-output" style="user-select:text">${result.password}</div>
        <button class="btn-icon" id="quick-refresh">${Icon.refresh}</button>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">Length: <span id="quick-len-val">20</span></label>
        <input type="range" id="quick-length" min="8" max="64" value="20" style="width:100%;accent-color:var(--accent-primary)" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="use-password">Use This Password</button>
    </div>
  `;
  
  showModal(modal);
  
  async function regen() {
    const r = await API.passwords.generate({ type: 'random', length: parseInt($('#quick-length').value) });
    $('#quick-gen-output').textContent = r.password;
  }
  
  $('#quick-refresh').onclick = regen;
  $('#quick-length').oninput = () => { $('#quick-len-val').textContent = $('#quick-length').value; regen(); };
  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;
  $('#use-password').onclick = () => {
    const pw = $('#quick-gen-output').textContent;
    const target = document.querySelector(targetSelector);
    if (target) {
      target.value = pw;
      target.dispatchEvent(new Event('input'));
    }
    closeModal();
  };
}

// ─── Counts & Badges ──────────────────────────────────────────────────────────
function updateCounts() {
  const total = state.entries.length;
  const fav = state.entries.filter(e => e.isFavorite).length;
  const weak = state.entries.filter(e => ['very-weak', 'weak'].includes(e.strength)).length;
  const breached = state.entries.filter(e => e.breached).length;

  const e = (id, val) => { const el = $(`#${id}`); if (el) el.textContent = val; };
  e('count-all', total);
  e('count-fav', fav);
  e('count-weak', weak);
  e('count-breach', breached);
}

function updateCloudBadge() {
  const badge = $('#cloud-status-badge');
  if (!badge) return;
  const connected = state.cloudStatus?.connected;
  badge.className = `cloud-badge${connected ? ' connected' : ''}`;
  badge.innerHTML = `<div class="cloud-dot"></div><span>${connected ? 'Synced' : 'Offline'}</span>`;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Never';
  const d = new Date(Number(timestamp));
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTitlebar();

  const exists = await API.vault.checkExists();
  if (exists) {
    renderUnlockScreen();
  } else {
    renderSetupScreen();
  }

  // Listen for auto-lock
  API.onAutoLocked(() => {
    Object.values(state.totpIntervals).forEach(clearInterval);
    state.totpIntervals = {};
    state.entries = [];
    state.selectedEntry = null;
    toast('Vault locked due to inactivity', 'warning');
    renderUnlockScreen();
  });
});
