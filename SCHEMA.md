# VaultGuard — Cloud Wire Format (v2)

This is the on-the-wire schema for Firestore documents. **Any client** that
follows this spec — Electron desktop, Android app, browser extension, web app,
CLI — will interoperate with the same encrypted vault.

The point of writing this down: the protocol is the API. Pick any language with
Argon2id + AES-256-GCM available and you can be a first-class VaultGuard client.

---

## 1. Crypto primitives (all clients MUST use these exact parameters)

| Primitive                  | Algorithm / params                                     |
|----------------------------|--------------------------------------------------------|
| KDF                        | **Argon2id**, memory `65536 KiB`, iterations `3`, parallelism `4`, output `32 bytes` |
| KDF fallback               | PBKDF2-HMAC-SHA-256, `600 000` iterations, output `32 bytes` (only if Argon2id unavailable) |
| Salt                       | 32 bytes from a CSPRNG, stored as lowercase hex        |
| Symmetric cipher           | **AES-256-GCM**, 12-byte IV (fresh per encryption), 16-byte auth tag |
| Verifier                   | A 32-byte random token encrypted with the vault key; an HMAC-SHA-256 of the *plaintext* token (using the vault key as HMAC key) is stored separately for fast verification |
| Integrity HMAC (per-vault) | HMAC-SHA-256(vaultKey, concat(id ‖ ciphertext ‖ updatedAt) ordered by id) |

The master password is **never** uploaded or stored on disk. Only the salt and
the verifier blob/HMAC ever leave the device.

---

## 2. Firestore document tree

```
vaults/
  {uid}/                          ← Firebase auth uid (one bucket per user)
    meta/
      vault                       ← single doc with KDF params + verifier
    entries/
      {entryId}                   ← UUID v4
    categories/
      {categoryId}                ← UUID v4 (or short slug for defaults)
```

All documents live under `vaults/{uid}` so the Firestore rules in
`firestore.rules` can lock per-user.

### 2.1 `vaults/{uid}/meta/vault`

```jsonc
{
  "schemaVersion": 2,
  "kdf":           "argon2id",
  "kdfMemoryKiB":  65536,
  "kdfIterations": 3,
  "kdfParallel":   4,
  "keyLength":     32,
  "salt":          "<64-hex-char string>",
  "verifyEnc":     "<envelope JSON, see §3>",
  "verifyHmac":    "<64-hex-char HMAC-SHA-256>",
  "hint":          "<optional plaintext hint shown on unlock screen>",
  "updatedAt":     1721000000000
}
```

`hint` is intentionally plaintext (it shows up *before* unlock); never put
anything sensitive in it.

### 2.2 `vaults/{uid}/entries/{entryId}`

```jsonc
{
  "ciphertext":      "<envelope JSON, see §3>",
  "clientUpdatedAt": 1721000123456,
  "createdAt":       1720990000000,
  "deleted":         false
}
```

Soft delete: to remove an entry on all devices, set
`deleted: true`, leave `ciphertext: ""`, and bump `clientUpdatedAt`. Clients
SHOULD garbage-collect tombstones older than 30 days from Firestore.

### 2.3 `vaults/{uid}/categories/{categoryId}`

Same shape as `entries`. The plaintext inside `ciphertext` is the full
category JSON (`{ id, name, icon, color, isDefault }`).

---

## 3. Envelope JSON (the value inside every `ciphertext` and `verifyEnc`)

```jsonc
{
  "v":   2,                 // envelope version, currently 2
  "iv":  "<base64, 12 bytes>",
  "ct":  "<base64, AES-256-GCM ciphertext>",
  "tag": "<base64, 16 bytes auth tag>"
}
```

Serialise this object as compact JSON (`JSON.stringify` with no spaces) and
store the resulting string as the document field value. Yes, base64-in-JSON-in-
JSON is a little redundant; the win is that the document is one short string,
which keeps Firestore reads cheap.

### Plaintext schema (entry)

```jsonc
{
  "title":        "GitHub",
  "entryType":    "login",        // one of: login, card, note, identity, ssh, api, crypto, license
  "username":     "octocat",
  "email":        "",
  "password":     "hunter2",
  "url":          "https://github.com",
  "notes":        "",
  "tags":         ["work"],
  "isFavorite":   false,
  "categoryId":   "cat-3",
  "totpSecret":   "JBSWY3DPEHPK3PXP",
  "cardNumber":   "",
  "cardExpiry":   "",
  "cardCvv":      "",
  "cardHolder":   "",
  "customFields": [
    { "label": "API ID", "value": "abc-123", "hidden": false }
  ]
}
```

Clients SHOULD ignore unknown keys (forward compatibility) and SHOULD round-trip
unknown keys when re-encrypting (so a v3 client doesn't lose v4 fields).

---

## 4. Sync algorithm (recommended, last-write-wins)

```
sync(localDB, cloud):
  meta = cloud.read("meta/vault")
  if meta and localDB.meta != meta:
      localDB.meta = meta              # newer KDF params from any device win

  # PULL
  for doc in cloud.query("entries").where("clientUpdatedAt > ?", localDB.lastPullAt):
      local = localDB.entry(doc.id)
      if doc.deleted:
          localDB.delete(doc.id)
      elif !local or doc.clientUpdatedAt > local.updated_at:
          localDB.put(doc.id, decrypt(doc.ciphertext), updated=doc.clientUpdatedAt)

  # PUSH
  for entry in localDB.entries.where("updated_at > ?", localDB.lastPushAt):
      cloud.put("entries/" + entry.id, {
          ciphertext:      encrypt(entry.plaintext),
          clientUpdatedAt: entry.updated_at,
          createdAt:       entry.created_at,
          deleted:         false
      })

  # TOMBSTONES
  for tomb in localDB.tombstones:
      cloud.put(tomb.collection + "/" + tomb.id, {
          deleted: true, clientUpdatedAt: now(), ciphertext: ""
      })
      localDB.tombstones.delete(tomb.id)

  localDB.lastPullAt = localDB.lastPushAt = startedAt
```

**Conflict resolution:** if two devices edit the same entry concurrently, the
write with the higher `clientUpdatedAt` wins. This is acceptable for a vault
because:

* You almost never edit the *same* credential on two devices in the same
  minute.
* The losing write is still retrievable from `entries:get-history` (if the
  client tracks history) or from Firestore document versions.

For richer merging, a future v3 envelope could carry a CRDT timestamp per
field — out of scope here.

---

## 5. Multi-device first run

When a fresh install (e.g. the Android app) signs into an existing Firebase
account:

1. `signInWithEmailAndPassword(email, fbPassword)` → ID token + uid.
2. Read `vaults/{uid}/meta/vault`. If missing, treat as brand-new account.
3. Prompt the user for their **master password** (different from `fbPassword`).
4. Derive `key = argon2id(masterPassword, meta.salt, …)` with the params in the
   meta document.
5. Verify: decrypt `meta.verifyEnc` with `key`, compute
   `HMAC-SHA-256(key, plaintext)`, constant-time compare with `meta.verifyHmac`.
   Mismatch ⇒ wrong master password, retry.
6. Run the sync algorithm above.

Step 5 means a new device can join *without* the user re-entering the salt or
exporting anything from the original device — the meta doc is the device-pairing
bootstrap.

---

## 6. Why this is safe

* Firebase only sees: salt (random), verifier (random plaintext encrypted under
  the key — looks random), and per-entry ciphertext blobs. None of this leaks
  the master password or the plaintext data.
* An attacker with read access to Firestore (e.g. a stolen Google account)
  still has to break Argon2id-64MiB or AES-256-GCM to read anything. With the
  parameters above, brute-forcing even a 10-character random master password
  costs more electricity than the GDP of a small country.
* The verifier uses HMAC of the plaintext token rather than just decrypt-and-
  compare so that a constant-time comparison is possible without leaking the
  token's structure via timing.

If you find a weakness in this spec, please open an issue.
