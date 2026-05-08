'use strict';
/**
 * VaultGuard Preload Script
 * 
 * This is the ONLY bridge between the sandboxed renderer and the main process.
 * Uses contextBridge to expose a minimal, typed API surface.
 * No raw Node.js, no ipcRenderer exposure — only explicit whitelisted functions.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of allowed IPC channels (renderer can only invoke these)
const ALLOWED_CHANNELS = new Set([
  'vault:check-exists', 'vault:create', 'vault:unlock', 'vault:lock',
  'entries:get-all', 'entries:get', 'entries:create', 'entries:update',
  'entries:delete', 'entries:get-history',
  'categories:get', 'categories:add', 'categories:delete',
  'passwords:generate', 'passwords:strength',
  'breach:check-all',
  'totp:generate', 'totp:setup',
  'clipboard:copy-secure',
  'cloud:status', 'cloud:connect', 'cloud:sync', 'cloud:disconnect',
  'settings:get', 'settings:set',
  'audit:get-log',
  'keyfile:select', 'keyfile:generate',
  'window:minimize', 'window:maximize', 'window:close',
]);

function invoke(channel, ...args) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Blocked IPC channel: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

// Expose typed API — this is everything the renderer can access
contextBridge.exposeInMainWorld('vaultAPI', {
  vault: {
    checkExists: ()     => invoke('vault:check-exists'),
    create:      (opts) => invoke('vault:create', opts),
    unlock:      (opts) => invoke('vault:unlock', opts),
    lock:        ()     => invoke('vault:lock'),
  },
  entries: {
    getAll:     ()         => invoke('entries:get-all'),
    get:        (id)       => invoke('entries:get', id),
    create:     (data)     => invoke('entries:create', data),
    update:     (id, data) => invoke('entries:update', id, data),
    delete:     (id)       => invoke('entries:delete', id),
    getHistory: (id)       => invoke('entries:get-history', id),
  },
  categories: {
    get:    ()    => invoke('categories:get'),
    add:    (cat) => invoke('categories:add', cat),
    delete: (id)  => invoke('categories:delete', id),
  },
  passwords: {
    generate: (opts) => invoke('passwords:generate', opts),
    strength: (pw)   => invoke('passwords:strength', pw),
  },
  breach: {
    checkAll: () => invoke('breach:check-all'),
  },
  totp: {
    generate: (secret)        => invoke('totp:generate', secret),
    setup:    (label, issuer) => invoke('totp:setup', label, issuer),
  },
  clipboard: {
    copySecure: (text, clearMs) => invoke('clipboard:copy-secure', text, clearMs),
  },
  cloud: {
    status:     ()    => invoke('cloud:status'),
    connect:    (cfg) => invoke('cloud:connect', cfg),
    sync:       ()    => invoke('cloud:sync'),
    disconnect: ()    => invoke('cloud:disconnect'),
  },
  settings: {
    get: ()  => invoke('settings:get'),
    set: (s) => invoke('settings:set', s),
  },
  audit: {
    getLog: () => invoke('audit:get-log'),
  },
  keyfile: {
    select:   () => invoke('keyfile:select'),
    generate: () => invoke('keyfile:generate'),
  },
  window: {
    minimize: () => invoke('window:minimize'),
    maximize: () => invoke('window:maximize'),
    close:    () => invoke('window:close'),
  },
  // One-way listener (main → renderer)
  onAutoLocked: (callback) => {
    ipcRenderer.on('auto-locked', () => callback());
  },
});
