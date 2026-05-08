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

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = {
  eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  shield: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  cloud: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  generate: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  history: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.54"/></svg>`,
  link: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  key: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
  x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><triangle points="10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  grid: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  heart: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
};

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
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z" fill="currentColor"/>
              <rect x="10" y="17" width="4" height="2" rx="1" fill="currentColor" opacity="0.7"/>
              <circle cx="12" cy="9" r="2" fill="white" opacity="0.9"/>
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
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z" fill="currentColor"/>
              <circle cx="12" cy="9" r="2" fill="white" opacity="0.9"/>
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
      const result = await API.passwords.strength(pw);
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
    
    const strength = await API.passwords.strength(password);
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
        <div class="sidebar-section">
          <div class="sidebar-label">Views</div>
          <div class="sidebar-item active" data-view="all">
            <span class="item-icon">🔐</span>
            All Items
            <span class="sidebar-count" id="count-all">0</span>
          </div>
          <div class="sidebar-item" data-view="favorites">
            <span class="item-icon">⭐</span>
            Favorites
            <span class="sidebar-count" id="count-fav">0</span>
          </div>
          <div class="sidebar-item" data-view="recent">
            <span class="item-icon">🕐</span>
            Recent
          </div>
          <div class="sidebar-item" data-view="weak">
            <span class="item-icon">⚠️</span>
            Weak Passwords
            <span class="sidebar-count" id="count-weak">0</span>
          </div>
          <div class="sidebar-item" data-view="breached">
            <span class="item-icon">🚨</span>
            Breached
            <span class="sidebar-count" id="count-breach">0</span>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">Categories</div>
          <div id="category-list"></div>
          <button class="sidebar-item" id="add-category-btn" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;color:var(--text-muted)">
            <span class="item-icon">${Icon.plus}</span>
            Add Category
          </button>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">Tools</div>
          <div class="sidebar-item" data-view="generator">
            <span class="item-icon">⚡</span>
            Password Generator
          </div>
          <div class="sidebar-item" data-view="security">
            <span class="item-icon">🛡️</span>
            Security Audit
          </div>
          <div class="sidebar-item" data-view="cloud">
            <span class="item-icon">☁️</span>
            Cloud Sync
          </div>
          <div class="sidebar-item" data-view="audit-log">
            <span class="item-icon">📋</span>
            Audit Log
          </div>
          <div class="sidebar-item" data-view="settings">
            <span class="item-icon">⚙️</span>
            Settings
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
          <!-- Entry List View -->
          <div id="view-entries" class="view active">
            <div class="entry-list-panel">
              <div id="entry-list-header" style="padding:10px 14px 6px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em"></div>
              <div class="entry-list" id="entry-list"></div>
            </div>
            <div class="detail-panel" id="detail-panel">
              <div class="detail-empty">
                <div class="detail-empty-icon">🔐</div>
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
  $$('.view').forEach(v => v.classList.remove('active'));

  const entryViews = ['all', 'favorites', 'recent', 'weak', 'breached'];
  if (entryViews.includes(view) || view.startsWith('cat-')) {
    state.currentView = view;
    $('#view-entries').classList.add('active');
    renderEntryList();
  } else {
    const viewEl = $(`#view-${view}`);
    if (viewEl) {
      viewEl.classList.add('active');
      if (view === 'audit-log') loadAuditLog();
      if (view === 'security') loadSecurityAudit();
      if (view === 'cloud') loadCloudStatus();
    }
  }
}

// ─── Category List ────────────────────────────────────────────────────────────
function renderCategoryList() {
  const list = $('#category-list');
  if (!list) return;
  list.innerHTML = '';
  state.categories.forEach(cat => {
    const count = state.entries.filter(e => e.categoryId === cat.id).length;
    const item = el('div', {
      class: 'sidebar-item',
      'data-view': `cat-${cat.id}`,
    });
    item.innerHTML = `
      <span class="item-icon">${cat.icon || '📁'}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cat.name)}</span>
      <span class="sidebar-count">${count}</span>
    `;
    item.onclick = () => {
      $$('[data-view]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navigateTo(`cat-${cat.id}`);
    };
    list.appendChild(item);
  });
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
  const item = el('div', { class: `entry-item${entry.id === state.selectedEntry?.id ? ' selected' : ''}` });
  
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

function getFaviconHtml(entry) {
  if (entry.url) {
    try {
      const domain = new URL(entry.url.startsWith('http') ? entry.url : `https://${entry.url}`).hostname;
      return `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" onerror="this.parentNode.innerHTML='${getTypeEmoji(entry.entryType)}'" />`;
    } catch {}
  }
  return getTypeEmoji(entry.entryType);
}

function getTypeEmoji(type) {
  const map = { login: '🔑', card: '💳', note: '📝', identity: '🪪', ssh: '🔐', api: '⚡', crypto: '₿', license: '📜' };
  return map[type] || '🔒';
}

// ─── Entry Detail ─────────────────────────────────────────────────────────────
async function selectEntry(entry) {
  // Full entry (with decrypted password)
  const full = await API.entries.get(entry.id);
  state.selectedEntry = full;

  $$('.entry-item').forEach(i => i.classList.remove('selected'));
  $$('.entry-item').forEach(i => {
    if (i.querySelector('.entry-title')?.textContent === (entry.title || 'Untitled')) {
      i.classList.add('selected');
    }
  });

  renderEntryDetail(full);
}

function renderEntryDetail(entry) {
  const panel = $('#detail-panel');
  if (!panel) return;
  
  const favicon = getFaviconHtml(entry);
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
        $('#detail-panel').innerHTML = `<div class="detail-empty"><div class="detail-empty-icon">🗑️</div><div>Entry deleted</div></div>`;
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
          ${entry.tags.map(t => `<span class="tag">🏷️ ${escHtml(t)}</span>`).join('')}
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
      <div class="tabs" style="margin-bottom:16px" id="type-tabs">
        <button class="tab${(!prefill.entryType || prefill.entryType === 'login') ? ' active' : ''}" data-type="login">🔑 Login</button>
        <button class="tab${prefill.entryType === 'card' ? ' active' : ''}" data-type="card">💳 Card</button>
        <button class="tab${prefill.entryType === 'note' ? ' active' : ''}" data-type="note">📝 Note</button>
        <button class="tab${prefill.entryType === 'identity' ? ' active' : ''}" data-type="identity">🪪 Identity</button>
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
      const result = await API.passwords.strength(pw);
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
      const s = await API.passwords.strength(data.password);
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
    <div style="padding:24px;width:100%;overflow-y:auto">
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
    <div style="padding:24px;width:100%;overflow-y:auto">
      <div class="settings-section-title">Security Audit</div>
      <div class="settings-section-desc">Identify and fix security issues in your vault</div>
      
      <div style="max-width:700px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px" id="security-stats">
          <div class="stat-card">
            <div class="stat-icon red">🚨</div>
            <div><div class="stat-value" id="sec-breached">-</div><div class="stat-label">Breached</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">⚠️</div>
            <div><div class="stat-value" id="sec-weak">-</div><div class="stat-label">Weak Passwords</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">🔁</div>
            <div><div class="stat-value" id="sec-reused">-</div><div class="stat-label">Reused Passwords</div></div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:20px">
          <button class="btn btn-primary" id="run-breach-check">
            🔍 Check for Breaches (HaveIBeenPwned)
          </button>
          <button class="btn btn-secondary" id="run-full-audit">
            🛡️ Full Security Audit
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
        resultsEl.innerHTML = `<div style="color:var(--accent-success);font-size:13px;padding:12px">✓ No breached passwords found!</div>`;
      }
      
      breachBtn.disabled = false;
      breachBtn.innerHTML = '🔍 Check for Breaches (HaveIBeenPwned)';
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
        html = `<div style="color:var(--accent-success);font-size:13px;padding:12px">🎉 Your vault looks great! No issues found.</div>`;
      }

      resultsEl.innerHTML = html;
    };
  }
}

// ─── Cloud View ───────────────────────────────────────────────────────────────
function renderCloudView() {
  return `
    <div style="padding:24px;width:100%;overflow-y:auto">
      <div class="settings-section-title">Cloud Sync</div>
      <div class="settings-section-desc">Zero-knowledge encrypted sync via Google Cloud</div>
      
      <div style="max-width:500px">
        <div class="card" style="margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6">
            🔒 Your vault is encrypted locally before syncing. Google only stores encrypted blobs — 
            it's impossible for anyone without your master password to read your data.
          </div>
          <div id="cloud-status-detail"></div>
        </div>

        <div id="cloud-connect-form">
          <div class="section-header">Google Firebase Configuration</div>
          <div class="form-group">
            <label class="form-label">Firebase API Key</label>
            <input type="text" id="firebase-api-key" class="form-input" placeholder="AIza..." />
          </div>
          <div class="form-group">
            <label class="form-label">Project ID</label>
            <input type="text" id="firebase-project-id" class="form-input" placeholder="my-vaultguard-project" />
          </div>
          <div class="form-group">
            <label class="form-label">Auth Domain</label>
            <input type="text" id="firebase-auth-domain" class="form-input" placeholder="my-project.firebaseapp.com" />
          </div>
          <div class="divider"></div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="firebase-email" class="form-input" placeholder="you@email.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="firebase-password" class="form-input" />
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-primary" id="cloud-signin-btn">Sign In</button>
            <button class="btn btn-secondary" id="cloud-signup-btn">Create Account</button>
          </div>
        </div>

        <div id="cloud-connected-panel" style="display:none">
          <div style="display:flex;gap:10px;margin-bottom:12px">
            <button class="btn btn-primary" id="cloud-sync-now-btn">${Icon.cloud} Sync Now</button>
            <button class="btn btn-danger" id="cloud-disconnect-btn">Disconnect</button>
          </div>
          <div id="last-sync-info" style="font-size:12px;color:var(--text-muted)"></div>
        </div>
      </div>
    </div>
  `;
}

async function loadCloudStatus() {
  const status = await API.cloud.status();
  state.cloudStatus = status;
  updateCloudBadge();

  const detailEl = $('#cloud-status-detail');
  const formEl = $('#cloud-connect-form');
  const panelEl = $('#cloud-connected-panel');

  if (!detailEl) return;

  if (status.connected) {
    detailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;color:var(--accent-success)">
        <div class="cloud-dot" style="background:var(--accent-success)"></div>
        Connected as ${escHtml(status.email || '')}
      </div>
    `;
    formEl.style.display = 'none';
    panelEl.style.display = 'block';
    if (status.lastSync) {
      $('#last-sync-info').textContent = `Last synced: ${formatDate(new Date(status.lastSync).getTime())}`;
    }

    $('#cloud-sync-now-btn').onclick = async () => {
      const result = await API.cloud.sync();
      if (result.success) {
        toast(`Synced ${result.synced} entries`, 'success');
        $('#last-sync-info').textContent = `Last synced: just now`;
      } else toast(result.error, 'error');
    };

    $('#cloud-disconnect-btn').onclick = async () => {
      await API.cloud.disconnect();
      state.cloudStatus = { connected: false };
      updateCloudBadge();
      loadCloudStatus();
    };
  } else {
    detailEl.innerHTML = `<div style="color:var(--text-muted);font-size:12px">Not connected</div>`;
    formEl.style.display = 'block';
    panelEl.style.display = 'none';

    async function doConnect(action) {
      const config = {
        apiKey: $('#firebase-api-key').value,
        projectId: $('#firebase-project-id').value,
        authDomain: $('#firebase-auth-domain').value,
        email: $('#firebase-email').value,
        password: $('#firebase-password').value,
        action,
      };
      if (!config.apiKey || !config.projectId || !config.email || !config.password) {
        toast('Please fill in all fields', 'error');
        return;
      }
      const result = await API.cloud.connect(config);
      if (result.success) {
        state.cloudStatus = await API.cloud.status();
        updateCloudBadge();
        toast('Connected to Google Cloud!', 'success');
        loadCloudStatus();
      } else {
        toast(result.error, 'error');
      }
    }

    $('#cloud-signin-btn').onclick = () => doConnect('signin');
    $('#cloud-signup-btn').onclick = () => doConnect('signup');
  }
}

// ─── Audit Log View ───────────────────────────────────────────────────────────
function renderAuditLogView() {
  return `
    <div style="padding:24px;width:100%;overflow-y:auto">
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
    vault_created: '🆕', vault_unlocked: '🔓', vault_locked: '🔒',
    entry_viewed: '👁️', entry_created: '✅', entry_updated: '✏️', entry_deleted: '🗑️',
    master_password_changed: '🔑',
  };

  list.innerHTML = logs.map(log => `
    <div class="health-item" style="margin-bottom:6px">
      <span style="font-size:16px">${actionIcons[log.action] || '📋'}</span>
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
    <div style="padding:24px;width:100%;overflow-y:auto">
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

// ─── History Modal ────────────────────────────────────────────────────────────
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
