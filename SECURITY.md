# VaultGuard — Security Model

A short, blunt write-up of what VaultGuard protects against, what it doesn't,
and why we made each choice. If you want to ship this app to other people,
they deserve to know.

## TL;DR

* AES-256-GCM for everything sensitive. AEAD, not just "encrypt-then-MAC".
* Argon2id for the KDF, 64 MiB memory cost. Falls back to PBKDF2-SHA-256 with
  600 000 iterations only if a native build of `argon2` isn't available.
* Master password is **never** persisted. The 32-byte derived key lives in
  RAM only while the vault is unlocked and is zeroed (`Buffer.fill(0)`) on
  lock, idle timeout, window blur, app quit, and password change.
* Cloud sync is **zero-knowledge**: Firebase only stores opaque ciphertext.
* Renderer is fully sandboxed; preload exposes a frozen typed API surface;
  all outbound network is allow-listed; CSP is the strict `default-src 'none'`
  variant.

## Threat model

| Threat                                  | Defended? | How                                                                                                        |
|----------------------------------------|-----------|-------------------------------------------------------------------------------------------------------------|
| Local disk is stolen, vault locked     | Yes       | DB at rest is AES-256-GCM under Argon2id-derived key. No key on disk.                                       |
| Disk stolen while vault unlocked       | Partial   | Key is in process memory; only an attacker with live access to the process can grab it.                     |
| Server compromise (Firebase)           | Yes       | Only ciphertext + random salt + random verifier reach Firestore. Master password and key never uploaded.    |
| Hostile network (MITM)                 | Yes       | HTTPS only (TLS 1.2+), HSTS header injected on every response, plain HTTP requests dropped at webRequest.   |
| Renderer compromise (XSS, malicious script) | Yes  | `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, deep-frozen `vaultAPI`, CSP `default-src 'none'`. |
| Renderer-side IPC abuse                | Yes       | Whitelisted IPC channels (preload), per-channel input validation in main, UUID checks on every entry id.    |
| Brute-force on master password         | Yes       | 5 attempts then exponential lockout (30 s, 60 s, 120 s, … capped at 1 h). Audit-logged.                     |
| Timing oracle on unlock                | Yes       | Constant-time comparison via `crypto.timingSafeEqual` on HMAC of verifier.                                  |
| Clipboard sniffing                     | Partial   | Optional auto-clear (default 30 s) and capped at 5 min to limit exposure window.                            |
| Auto-lock bypass                       | Yes       | Activity events bump the timer; window blur optionally triggers immediate lock.                             |
| Tampered backup file                   | Yes       | Encrypted exports carry an HMAC-SHA-256 of the inner payload; mismatch refuses import.                      |
| Vault file silently corrupted/tampered | Yes       | `vault:integrity-check` recomputes HMAC over all rows and compares constant-time.                           |
| Multi-instance race                    | Yes       | `app.requestSingleInstanceLock()` — only one vault open at a time.                                          |
| `child_process` / `eval` exfil         | Yes       | Sandboxed renderer has no Node and no eval (CSP).                                                           |
| Shoulder-surfing                       | Out of scope | The OS-level "blur on screenshot" is not portable; auto-lock + minimize-to-tray help.                  |
| Hardware key-logger / compromised OS   | **No**    | Nothing in user-space can defend this. Use OS-level full-disk encryption + reboot hygiene.                  |
| Quantum break of AES-256 / Argon2id    | **No**    | Pre-quantum primitives. Re-key when a quantum-safe AEAD becomes practical.                                  |

## Cryptographic choices

### Why Argon2id?

OWASP and the password-hashing-competition both recommend Argon2id for new
applications. The 64 MiB cost forces an attacker to use real RAM (not just
GPU registers), which collapses GPU/ASIC speedups by 1000× vs PBKDF2.

We hard-set the parameters in code so the same master password derives the same
key on every device — required for cloud sync interop. If you change them,
you'll break every existing vault. Don't.

### Why AES-256-GCM and not XChaCha20-Poly1305?

GCM is in Node's `crypto` core; XChaCha is not. Bundling libsodium for a 1 %
performance win wasn't worth a 600 KB native module. GCM with a 12-byte random
IV is safe up to ~2³² messages per key — comfortably beyond a personal vault.

### Why a separate verifier + HMAC?

Earlier vaults stored the plaintext verify token next to the encrypted one,
which leaked information about the cipher's structure on every unlock attempt.
Modern vaults store an HMAC of the plaintext (using the derived key as HMAC
secret) so unlock verification is constant-time and reveals nothing.

Legacy vaults (pre-fix) still work via a fallback path that explicitly uses
`timingSafeEqual` with padded buffers — see `vault:unlock` in `main.js`.

## Cloud sync zero-knowledge claim, audited

What Firestore can see for any entry:

* A random-looking string `ciphertext` (envelope JSON wrapping IV + AES-GCM ct
  + tag). Indistinguishable from random bytes by anyone without the key.
* `clientUpdatedAt` — an integer millisecond timestamp. Reveals only **when**
  you edited (not what).
* `deleted` flag. Reveals only that you deleted something.

What Firestore can NOT see:

* The plaintext (title, username, password, URL, notes, TOTP, card numbers).
* Your master password.
* The derived key.
* Whether you and another VaultGuard user share any credentials (no global
  hashing).

What does leak as Firestore *metadata*:

* The number of entries you have (a count, not contents).
* The rough time of each edit (millisecond precision).
* Your Firebase email and project ID.

If even these metadata leaks bother you, run a self-hosted Firestore alternative
behind a privacy proxy, or stick with offline-only mode (just don't connect a
cloud account).

## Security non-goals

* This app is **not** a TOTP authenticator app. It stores TOTP secrets next to
  the password they protect, which trades a small amount of 2FA strength for
  enormous convenience. If your threat model needs true second-factor isolation,
  use a hardware key (YubiKey) instead.
* This app is **not** a secure-secrets share tool. Don't email exported `.vgb`
  files. If you need to share a single credential with someone, copy it
  manually — there's no end-to-end share primitive yet.

## Reporting vulnerabilities

If you find a security issue, please open a private security advisory on the
project's repository (or email the maintainer directly). Don't file a public
issue.
