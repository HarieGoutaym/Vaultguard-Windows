'use strict';
/**
 * VaultGuard — Universal Import Engine
 *
 * Supports:
 *   VaultGuard JSON (v1, v2)
 *   Chrome CSV           (name, url, username, password)
 *   Firefox CSV          (url, username, password, httpRealm, formActionOrigin, guid, timeCreated, timeLastUsed, timePasswordChanged)
 *   Bitwarden JSON       (type, name, login.username, login.password, login.uris, notes, fields)
 *   Bitwarden CSV        (folder, favorite, type, name, notes, fields, reprompt, login_uri, login_username, login_password, login_totp)
 *   LastPass CSV         (url, username, password, totp, extra, name, grouping, fav)
 *   1Password 1PUX       (item.details.loginFields, item.urls)
 *   1Password CSV        (Title, Username, Password, URL, Notes, Type, OTPAuth)
 *   Dashlane JSON        (CREDENTIALS array)
 *   Dashlane CSV         (username, username2, username3, title, password, note, url, category, protection)
 *   KeePass XML          (Group > Entry > String > Key+Value)
 *   KeePassXC CSV        (Title, Username, Password, URL, Notes, TOTP, Icon, Last Modified, Created)
 *   NordPass CSV         (name, url, username, password, note, cardholdername, cardnumber, cvv, expirydate, zipcode, folder, full_name, phone_number, email, address1, city, country, state)
 *   Enpass JSON          (items array)
 *   RoboForm CSV         (Name, Url, Username, Password, Note)
 *
 * All parsers normalise to the VaultGuard entry schema.
 * Conflict resolution: skip / overwrite / duplicate (per import).
 */

const SCHEMA_VERSION = 2;

// ── Detect format from filename + content ─────────────────────────────────────
function detectFormat(filename, content) {
  const name = filename.toLowerCase();
  // JSON formats
  if (name.endsWith('.json') || name.endsWith('.1pux')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.encrypted !== undefined && parsed.folders !== undefined) return 'bitwarden_json';
      if (Array.isArray(parsed) && parsed[0]?.url && parsed[0]?.username_field !== undefined) return 'chrome_json_bookmark'; // rare
      if (parsed.items && Array.isArray(parsed.items) && parsed.items[0]?.fields) return 'enpass_json';
      if (parsed.CREDENTIALS || parsed.credentials) return 'dashlane_json';
      if (parsed.accounts || (parsed.data && parsed.data[0]?.loginFields)) return '1password_1pux';
      if (parsed.version && parsed.entries) return 'vaultguard_json';
      if (Array.isArray(parsed) && parsed[0]?.title && parsed[0]?.credentials) return 'vaultguard_json_v2';
      // Fallback JSON — try to auto-detect fields
      return 'generic_json';
    } catch { return 'unknown'; }
  }
  if (name.endsWith('.xml')) return 'keepass_xml';
  if (name.endsWith('.csv')) {
    // Detect CSV type from header row
    const firstLine = content.split('\n')[0].toLowerCase();
    if (firstLine.includes('login_uri') || firstLine.includes('login_username')) return 'bitwarden_csv';
    if (firstLine.includes('httprealm') || firstLine.includes('formactionorigin')) return 'firefox_csv';
    if (firstLine.includes('grouping') || (firstLine.includes('extra') && firstLine.includes('totp'))) return 'lastpass_csv';
    if (firstLine.includes('otpauth') || (firstLine.includes('title') && firstLine.includes('username') && firstLine.includes('password') && firstLine.includes('url') && firstLine.includes('notes') && firstLine.includes('type'))) return '1password_csv';
    if (firstLine.includes('keepassxc') || (firstLine.includes('title') && firstLine.includes('totp') && firstLine.includes('last modified'))) return 'keepassxc_csv';
    if (firstLine.includes('cardholdername') || firstLine.includes('cardnumber') || firstLine.includes('expirydate')) return 'nordpass_csv';
    if (firstLine.includes('username2') || firstLine.includes('protection')) return 'dashlane_csv';
    if (firstLine.includes('name') && firstLine.includes('url') && firstLine.includes('username') && firstLine.includes('password') && !firstLine.includes('folder')) return 'chrome_csv';
    if (firstLine.includes('folder') && firstLine.includes('favorite') && firstLine.includes('reprompt')) return 'bitwarden_csv';
    return 'generic_csv';
  }
  return 'unknown';
}

// ── CSV parser (RFC 4180 compliant, handles quoted fields with commas/newlines) ─
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i+1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' && text[i+1] === '\n') { row.push(field); field=''; rows.push(row); row=[]; i+=2; continue; }
    if (ch === '\n') { row.push(field); field=''; rows.push(row); row=[]; i++; continue; }
    field += ch; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  // Remove empty trailing rows
  while (rows.length && rows[rows.length-1].every(c => !c.trim())) rows.pop();
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    return obj;
  });
}

// ── Normalise to VaultGuard schema ─────────────────────────────────────────────
function makeEntry(overrides = {}) {
  return {
    title:       '',
    entryType:   'login',
    username:    '',
    email:       '',
    password:    '',
    url:         '',
    notes:       '',
    tags:        [],
    isFavorite:  false,
    categoryId:  null,
    totpSecret:  '',
    cardNumber:  '',
    cardExpiry:  '',
    cardCvv:     '',
    cardHolder:  '',
    customFields: [],
    ...overrides,
  };
}

// ── Individual parsers ─────────────────────────────────────────────────────────

function parseVaultGuardJSON(content) {
  const raw = JSON.parse(content);
  const items = Array.isArray(raw) ? raw
    : Array.isArray(raw.entries) ? raw.entries : [];
  return items.map(e => makeEntry(e));
}

function parseBitwardenJSON(content) {
  const raw = JSON.parse(content);
  const items = raw.items || [];
  return items.map(item => {
    const login = item.login || {};
    const card  = item.card || {};
    const uris  = (login.uris || []).map(u => u.uri).join(', ');
    return makeEntry({
      title:      item.name || '',
      entryType:  item.type === 3 ? 'card' : item.type === 2 ? 'note' : 'login',
      username:   login.username || '',
      password:   login.password || '',
      url:        uris,
      notes:      item.notes || '',
      totpSecret: login.totp || '',
      isFavorite: item.favorite || false,
      cardNumber: card.number || '',
      cardHolder: card.cardholderName || '',
      cardExpiry: card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear}` : '',
      cardCvv:    card.code || '',
      customFields: (item.fields || []).map(f => ({ label: f.name, value: f.value, hidden: f.type === 1 })),
    });
  });
}

function parseBitwardenCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:      r['name'] || r['title'] || '',
    entryType:  r['type'] === 'login' || !r['type'] ? 'login' : r['type'],
    username:   r['login_username'] || r['username'] || '',
    password:   r['login_password'] || r['password'] || '',
    url:        r['login_uri'] || r['url'] || '',
    notes:      r['notes'] || '',
    totpSecret: r['login_totp'] || '',
    isFavorite: r['favorite'] === '1' || r['favorite'] === 'true',
  }));
}

function parseChromeCsv(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:    r['name'] || r['title'] || new URL(r['url'] || 'http://x').hostname,
    username: r['username'] || r['login'] || '',
    password: r['password'] || '',
    url:      r['url'] || '',
  }));
}

function parseFirefoxCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:    new URL(r['url'] || 'http://x').hostname,
    username: r['username'] || '',
    password: r['password'] || '',
    url:      r['url'] || '',
    notes:    r['httprealm'] || '',
  }));
}

function parseLastPassCSV(content) {
  return csvToObjects(content).map(r => {
    const isNote = r['url'] === 'http://sn';
    return makeEntry({
      title:      r['name'] || '',
      entryType:  isNote ? 'note' : 'login',
      username:   r['username'] || '',
      password:   r['password'] || '',
      url:        isNote ? '' : r['url'] || '',
      notes:      r['extra'] || '',
      totpSecret: r['totp'] || '',
      isFavorite: r['fav'] === '1',
      tags:       r['grouping'] ? [r['grouping']] : [],
    });
  });
}

function parse1PasswordCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:      r['title'] || '',
    username:   r['username'] || '',
    password:   r['password'] || '',
    url:        r['url'] || r['website'] || '',
    notes:      r['notes'] || r['note'] || '',
    totpSecret: extractTOTPSecret(r['otpauth'] || r['one-time password'] || ''),
    entryType:  (r['type'] || '').toLowerCase().includes('credit') ? 'card' : 'login',
  }));
}

function parseKeePassXCCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:      r['title'] || '',
    username:   r['username'] || '',
    password:   r['password'] || '',
    url:        r['url'] || '',
    notes:      r['notes'] || '',
    totpSecret: extractTOTPSecret(r['totp'] || ''),
    tags:       r['group'] ? [r['group']] : [],
  }));
}

function parseKeePassXML(content) {
  // Simple DOM-less XML parser for KeePass format
  const entries = [];
  const entryRegex = /<Entry>([\s\S]*?)<\/Entry>/g;
  const stringRegex = /<String>\s*<Key>(.*?)<\/Key>\s*<Value(?:[^>]*Protected="True"[^>]*)?>([^<]*)<\/Value>\s*<\/String>/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(content)) !== null) {
    const block = entryMatch[1];
    const fields = {};
    let sm;
    while ((sm = stringRegex.exec(block)) !== null) {
      fields[sm[1].toLowerCase()] = sm[2];
    }
    if (!fields['title'] && !fields['password']) continue;
    entries.push(makeEntry({
      title:    fields['title'] || '',
      username: fields['username'] || fields['username*'] || '',
      password: fields['password'] || '',
      url:      fields['url'] || '',
      notes:    fields['notes'] || '',
      totpSecret: extractTOTPSecret(fields['otp'] || fields['totp'] || ''),
    }));
  }
  return entries;
}

function parseDashlaneJSON(content) {
  const raw = JSON.parse(content);
  const creds = raw.CREDENTIALS || raw.credentials || [];
  return creds.map(c => makeEntry({
    title:    c.title || c.note_title || c.domain || '',
    username: c.username || c.login || '',
    password: c.password || '',
    url:      c.url || c.domain || '',
    notes:    c.note || c.extra || '',
    email:    c.email || '',
    tags:     c.category ? [c.category] : [],
  }));
}

function parseDashlaneCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:    r['title'] || r['name'] || '',
    username: r['username'] || r['login'] || '',
    password: r['password'] || '',
    url:      r['url'] || r['website'] || '',
    notes:    r['note'] || '',
    email:    r['username2'] || '',
    tags:     r['category'] ? [r['category']] : [],
  }));
}

function parseNordPassCSV(content) {
  return csvToObjects(content).map(r => {
    const isCard = r['cardnumber'] || r['cardholdername'];
    return makeEntry({
      title:      r['name'] || r['title'] || '',
      entryType:  isCard ? 'card' : 'login',
      username:   r['username'] || '',
      password:   r['password'] || '',
      url:        r['url'] || '',
      notes:      r['note'] || r['notes'] || '',
      tags:       r['folder'] ? [r['folder']] : [],
      cardHolder: r['cardholdername'] || `${r['full_name'] || ''}`.trim(),
      cardNumber: r['cardnumber'] || '',
      cardCvv:    r['cvv'] || '',
      cardExpiry: r['expirydate'] || '',
    });
  });
}

function parseEnpassJSON(content) {
  const raw = JSON.parse(content);
  const items = raw.items || [];
  return items.map(item => {
    const fields = {};
    (item.fields || []).forEach(f => {
      const key = (f.label || '').toLowerCase();
      if (key.includes('username') || key === 'login name') fields.username = f.value;
      else if (key === 'password') fields.password = f.value;
      else if (key === 'url' || key === 'website') fields.url = f.value;
      else if (key === 'email' || key === 'e-mail') fields.email = f.value;
      else if (key === 'totp' || key === 'one-time password') fields.totp = extractTOTPSecret(f.value);
    });
    return makeEntry({
      title:      item.title || '',
      entryType:  (item.category || '').toLowerCase().includes('credit') ? 'card' : 'login',
      username:   fields.username || '',
      password:   fields.password || '',
      url:        fields.url || (item.urls || [])[0]?.url || '',
      email:      fields.email || '',
      notes:      item.note || '',
      totpSecret: fields.totp || '',
      tags:       item.folders || [],
    });
  });
}

function parseRoboFormCSV(content) {
  return csvToObjects(content).map(r => makeEntry({
    title:    r['name'] || r['title'] || '',
    url:      r['url'] || '',
    username: r['username'] || r['user'] || '',
    password: r['password'] || r['pwd'] || '',
    notes:    r['note'] || r['comment'] || '',
  }));
}

function parseGenericCSV(content) {
  const rows = csvToObjects(content);
  return rows.map(r => {
    // Try to find fields by common name variations
    const get = (...keys) => { for (const k of keys) if (r[k]) return r[k]; return ''; };
    return makeEntry({
      title:    get('name','title','site','service','label'),
      username: get('username','user','login','email','user_name'),
      password: get('password','pass','passwd','pwd','secret'),
      url:      get('url','website','site_url','web','uri','host'),
      notes:    get('notes','note','comment','memo','description','extra'),
    });
  }).filter(e => e.title || e.username || e.password);
}

function parseGenericJSON(content) {
  const raw = JSON.parse(content);
  const items = Array.isArray(raw) ? raw : (raw.items || raw.entries || raw.passwords || []);
  return items.map(e => makeEntry({
    title:    e.name || e.title || e.service || '',
    username: e.username || e.user || e.login || e.email || '',
    password: e.password || e.pass || e.secret || '',
    url:      e.url || e.website || e.uri || '',
    notes:    e.notes || e.note || e.extra || '',
  })).filter(e => e.title || e.username || e.password);
}

// ── TOTP secret extraction ─────────────────────────────────────────────────────
function extractTOTPSecret(value) {
  if (!value) return '';
  // Already a raw base32 secret
  if (/^[A-Z2-7]{16,}$/i.test(value)) return value.toUpperCase();
  // otpauth:// URI
  try {
    const url = new URL(value);
    if (url.protocol === 'otpauth:') {
      return url.searchParams.get('secret') || '';
    }
  } catch {}
  return '';
}

// ── Master parse dispatcher ────────────────────────────────────────────────────
function parseFile(filename, content) {
  const format = detectFormat(filename, content);
  let entries;
  try {
    switch (format) {
      case 'vaultguard_json':
      case 'vaultguard_json_v2':  entries = parseVaultGuardJSON(content);  break;
      case 'bitwarden_json':      entries = parseBitwardenJSON(content);   break;
      case 'bitwarden_csv':       entries = parseBitwardenCSV(content);    break;
      case 'chrome_csv':          entries = parseChromeCsv(content);       break;
      case 'firefox_csv':         entries = parseFirefoxCSV(content);      break;
      case 'lastpass_csv':        entries = parseLastPassCSV(content);     break;
      case '1password_csv':       entries = parse1PasswordCSV(content);    break;
      case '1password_1pux':      entries = parseVaultGuardJSON(content);  break; // already JSON-like
      case 'keepassxc_csv':       entries = parseKeePassXCCSV(content);    break;
      case 'keepass_xml':         entries = parseKeePassXML(content);      break;
      case 'dashlane_json':       entries = parseDashlaneJSON(content);    break;
      case 'dashlane_csv':        entries = parseDashlaneCSV(content);     break;
      case 'nordpass_csv':        entries = parseNordPassCSV(content);     break;
      case 'enpass_json':         entries = parseEnpassJSON(content);      break;
      case 'roboform_csv':        entries = parseRoboFormCSV(content);     break;
      case 'generic_csv':         entries = parseGenericCSV(content);      break;
      case 'generic_json':        entries = parseGenericJSON(content);     break;
      default: return { error: `Unrecognised file format (${filename}). Try CSV or JSON.`, entries: [], format };
    }
  } catch(e) {
    return { error: `Parse error: ${e.message}`, entries: [], format };
  }

  // Sanitise
  entries = entries
    .filter(e => e.title || e.username || e.password || e.url)
    .map(e => ({
      ...e,
      title:    String(e.title    || '').slice(0, 256),
      username: String(e.username || '').slice(0, 512),
      password: String(e.password || '').slice(0, 4096),
      url:      String(e.url      || '').slice(0, 2048),
      notes:    String(e.notes    || '').slice(0, 8192),
    }));

  return { entries, format, error: null };
}

// ── Conflict resolution ────────────────────────────────────────────────────────
/**
 * @param {Array} incoming  - parsed entries from file
 * @param {Array} existing  - current vault entries (titles + urls)
 * @param {'skip'|'overwrite'|'duplicate'} strategy
 * @returns {{ toCreate, toUpdate, skipped }}
 */
function resolveConflicts(incoming, existing, strategy = 'skip') {
  const existingMap = new Map();
  for (const e of existing) {
    const key = `${e.title?.toLowerCase()}|${(e.url||'').toLowerCase()}`;
    existingMap.set(key, e);
  }

  const toCreate = [], toUpdate = [], skipped = [];

  for (const entry of incoming) {
    const key = `${entry.title?.toLowerCase()}|${(entry.url||'').toLowerCase()}`;
    const match = existingMap.get(key);

    if (!match) {
      toCreate.push(entry);
    } else if (strategy === 'overwrite') {
      toUpdate.push({ ...entry, id: match.id });
    } else if (strategy === 'duplicate') {
      toCreate.push({ ...entry, title: `${entry.title} (imported)` });
    } else {
      skipped.push(entry);
    }
  }

  return { toCreate, toUpdate, skipped };
}

module.exports = { parseFile, resolveConflicts, detectFormat, SCHEMA_VERSION };
