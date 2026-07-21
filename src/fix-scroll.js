// Fix views and interaction
const fs = require('fs');

// 1. Fix CSS overflow issues in premium.css to allow scrolling and proper heights
let premiumCss = fs.readFileSync('/home/user/premium.css', 'utf8');

const cssFix = `
/* Layout Fixes for Scrolling & Height */
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

#main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

#screen-main {
  flex: 1;
  display: flex;
  width: 100%;
  overflow: hidden;
}

.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.view {
  display: none !important;
  flex: 1;
  overflow: hidden;
  height: 100%;
}

.view.active {
  display: flex !important;
}

#view-entries.active {
  flex-direction: row;
}

/* Ensure single pane views scroll */
#view-generator,
#view-security,
#view-cloud,
#view-audit-log,
#view-settings,
#view-enterprise {
  overflow-y: auto !important;
}

.enterprise-pane {
  padding-bottom: 40px;
}

/* List/Detail panels */
.entry-list-panel {
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  overflow: hidden;
}

.entry-list {
  flex: 1;
  overflow-y: auto;
}

.detail-panel {
  flex: 1;
  overflow-y: auto;
}

.pane-view {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
}

/* Updated Icons Base */
.item-icon svg {
  stroke-width: 1.5;
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
}

.sidebar-item.active .item-icon svg {
  stroke-width: 2;
  stroke: var(--accent);
}

.stat-icon svg {
  width: 24px;
  height: 24px;
}
`;

if (!premiumCss.includes('/* Layout Fixes for Scrolling & Height */')) {
  premiumCss += '\n' + cssFix;
  fs.writeFileSync('/home/user/premium.css', premiumCss);
}


// 2. Fix the app.js mock API interaction issue
let appJs = fs.readFileSync('/home/user/app.js', 'utf8');

// The navigateTo function was patched in the previous step, but let's make sure it handles native views correctly
// Also make sure Icon definitions are upgraded.

const iconFix = `
const Icon = {
  vault: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  star: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  zap: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  shieldCheck: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  key: '<svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  creditCard: '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
};
`;

// Replace the old Icon object with the upgraded one for better visibility in UI
if (appJs.includes('const Icon = {')) {
  const iconStart = appJs.indexOf('const Icon = {');
  let iconEnd = appJs.indexOf('};\n', iconStart);
  if (iconEnd === -1) iconEnd = appJs.indexOf('};\r\n', iconStart);
  if (iconEnd !== -1) {
    appJs = appJs.substring(0, iconStart) + iconFix + appJs.substring(iconEnd + 3);
  }
}

// In app.js navigateTo, ensure native views show up correctly if not enterprise view
const navPatched = `function navigateTo(view) {
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
}`;

const oldNavRegex = /function navigateTo\(view\) \{[\s\S]*?(?=\n\}\n)/;
appJs = appJs.replace(oldNavRegex, navPatched.slice(0, -2));

fs.writeFileSync('/home/user/app.js', appJs);

console.log("Applied scrolling and navigation fixes.");
