# What changed and why

## Goal

Take VaultGuard from a polished but **offline-only** Electron app with stubbed
cloud sync, into a **multi-device password manager** with:

* Real, working, zero-knowledge cloud sync.
* A documented wire protocol so Android and browser clients can join the same
  vault.
* Production-quality polish for the cloud UX, so non-technical people can
  actually use it.

We picked **Firebase** because you wanted free + Android + browser:

| Why                                | Detail                                                                 |
|------------------------------------|------------------------------------------------------------------------|
| Free Spark tier covers most users  | 1 GiB Firestore storage, 50 K reads/day, 20 K writes/day — way more than a personal vault. |
| First-class Android SDK            | `firebase-auth-ktx` + `firebase-firestore-ktx`, plain Gradle deps.     |
| First-class Web SDK                | Same `firebase` npm package powers SPA *and* MV3 extensions.           |
| REST API works without SDK         | The Electron main process talks REST → no 600 KB SDK bundle.           |
| Per-user security rules            | `firestore.rules` enforces "you can only touch your own bucket".       |
| Zero-knowledge fits naturally      | Documents hold opaque ciphertext strings; rules don't need to inspect plaintext. |

---

## Files added

| File                | Purpose                                                                  |
|---------------------|--------------------------------------------------------------------------|
| `cloud-sync.js`     | Firebase Auth + Firestore REST client + the bidirectional sync engine.   |
| `main-cloud.js`     | Electron IPC handlers (`cloud:status`, `:connect`, `:sync`, `:disconnect`, `:pull-meta`) + 5-min background auto-sync + tombstone tracking. |
| `firestore.rules`   | Drop-in rules: per-user isolation, size limit, schema sanity.            |
| `SCHEMA.md`         | The on-the-wire contract every client must follow. Argon2id params, envelope JSON, document tree, sync algorithm. |
| `SECURITY.md`       | Threat model + crypto rationale.                                         |
| `INTEGRATION.md`    | Working code to build the **browser client** and the **Android client**, plus a CLI sketch. |
| `CHANGES.md`        | This file.                                                               |

## Files modified

| File           | Change                                                                          |
|----------------|---------------------------------------------------------------------------------|
| `main.js`      | Removed the 4 stubbed `cloud:*` handlers, wired in `main-cloud.js`, added tombstone hook to `entries:delete` and `categories:delete`, added `cloudAutoSync` to settings allow-list. |
| `preload.js`   | Exposed `cloud:pull-meta` channel and `cloud.pullMeta`, `cloud.onProgress`, `cloud.onAutoSyncDone`, `cloud.onAutoSyncFail` to the renderer. |
| `security.js`  | Added Firebase REST hosts to the outbound network allow-list (Identity Toolkit, secure-token, Firestore). |
| `app.js`       | Rewrote the Cloud view with proper status, live "last sync" relative time, per-sync stats, auto-sync toggle, in-app Firebase setup guide modal, disconnect-confirm. |

Everything else is byte-identical — your security model, KDF, brute-force
throttle, audit log, import engine, and sandboxing are untouched.

---

## How it works end-to-end

1. **You set up Firebase once** (3 minutes — guide modal walks the user through
   it). You paste apiKey + projectId, enter your Firebase email + password, and
   click *Create Account*.
2. **VaultGuard pushes vault metadata** (salt + verifier + KDF params) to
   `vaults/{uid}/meta/vault`. Nothing sensitive — the salt is random and the
   verifier is just a random token encrypted with your derived key.
3. **First sync uploads every entry** as `{ciphertext, clientUpdatedAt,
   createdAt, deleted:false}` documents. Ciphertext = AES-256-GCM envelope.
4. **Every entry create/update bumps `updated_at` locally**; the next sync
   picks them up (`updated_at > lastPushAt`).
5. **Every entry delete writes a tombstone row** that gets pushed as `deleted:
   true` so other devices remove their local copy.
6. **A background timer syncs every 5 minutes** while the vault is unlocked
   and auto-sync is on, with no UI noise. Progress and failures are surfaced
   via IPC events the renderer can subscribe to.
7. **A second device** (Android, browser, another desktop install) signs in
   with the same Firebase email + password, fetches the meta doc, prompts for
   your master password, derives the same key, verifies, then runs the sync
   algorithm. Now both devices have the same vault.

Key zero-knowledge property: **the master password never leaves the device**.
The Firebase password is a *different* secret used only for transport-level
auth. If you lose your Firebase password you can reset it; if you lose your
master password your vault is permanently unreadable. (This is the right
trade-off — we are not your custodian.)

---

## Next steps if you want to ship to others

These are out of scope for this commit but easy wins:

1. **Build an Android app** using `INTEGRATION.md`. The schema is documented
   so you can write tests that hash a known password+salt and check the
   resulting bytes match the desktop client.
2. **Build a browser extension** using the same doc. Web Crypto has AES-GCM
   built in; you only need to bundle `argon2-browser` (~80 KB).
3. **Add `cloud:rotate-key`** — re-encrypt every entry under a new key and
   re-upload. Already mostly written: `vault:change-master-password` does the
   local re-encryption; you'd just need to set `lastPushAt = 0` after to push
   everything once more.
4. **Add `cloud:purge`** — delete all docs under `vaults/{uid}/...` so a user
   can leave Firebase cleanly.
5. **Add a Recovery Code** on vault creation — a 24-word BIP-39-ish phrase the
   user prints. Optional XOR layer on the verifier so they can recover the
   vault if they lose the master password but keep the recovery phrase.
   (Trade-off: now there's a second secret an attacker can target.)

---

## What I deliberately did **not** change

* Cryptography. Your KDF + AEAD choices are already best-practice.
* The renderer sandbox model. `contextIsolation:true` + frozen `vaultAPI` +
  strict CSP is gold standard.
* The import engine. It's good and supports 15+ password managers already.
* The audit-log schema. It already records every interesting event.
* The custom titlebar / window controls. UI is your call, I touched only the
  one screen I rewrote (Cloud view).

If anything in the sync code surprises you, every method has a comment
explaining the trade-off rather than just describing what it does. Read
`cloud-sync.js` top-to-bottom and you'll see exactly where data goes.
