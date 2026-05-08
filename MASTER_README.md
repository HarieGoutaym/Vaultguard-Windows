# VaultGuard — Cross-Platform Password Manager

**Zero-knowledge. Offline-first. AES-256-GCM encrypted.**

Two standalone apps sharing the same security philosophy:

| | Windows (Electron) | Android |
|---|---|---|
| Cipher | AES-256-GCM | AES-256-GCM |
| KDF | Argon2id (64MB/3-iter) → PBKDF2-600k fallback | PBKDF2-400k → Argon2id via BouncyCastle |
| Key storage | Windows Credential Manager (keytar) | Android Keystore (hardware-backed) |
| Biometric | Windows Hello (optional) | BiometricPrompt (strong biometric) |
| Network | ALL requests blocked (Electron webRequest) | network_security_config + cert pinning |
| Screenshots | Optional FLAG (setContentProtection) | FLAG_SECURE on all Activities |
| Backup | N/A (manual export only) | android:allowBackup=false + extraction rules |
| Auto-lock | 5 min inactivity | 5 min inactivity |
| Clipboard wipe | 30 sec (configurable) | 30 sec |

---

## Quick Start

### Windows
```powershell
cd vaultguard-windows
npm install
npm start
```

### Android
```bash
cd vaultguard-android
./gradlew assembleDebug
# Install on device/emulator
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Stolen device | Vault encrypted at rest; master password required to derive key |
| MITM on HIBP check | Certificate pinning (Android); request blocked entirely (Windows, optional) |
| Malicious website in renderer | contextIsolation + sandbox; webRequest blocks all navigation |
| Screenshot / screen recording | FLAG_SECURE (Android); setContentProtection (Windows, optional) |
| Cloud backup leak | Backup disabled (Android); no cloud sync by default (both) |
| Clipboard sniffing | Clipboard wiped after 30 seconds |
| Memory scraping | Vault key zeroed on lock; CharArray passwords zeroed after KDF |
| Brute force | Argon2id/PBKDF2 with high cost; rate-limit on failed unlock attempts |
| Tampered ciphertext | AES-GCM auth tag rejects any modification |

---

## Files Included

```
vaultguard-windows/
├── src/main.js             ← Main process (IPC, DB, Argon2id, network block)
├── src/preload.js          ← contextBridge (typed IPC whitelist)
├── src/security.js         ← webRequest interceptor + CSP (NEW)
├── src/app.js              ← Renderer UI
├── src/index.html          ← Shell
├── src/main.css            ← Styles
├── package.json
├── .npmrc
└── README.md

vaultguard-android/
├── app/src/main/java/com/vaultguard/app/
│   ├── VaultApplication.kt
│   ├── MainActivity.kt          ← Unlock screen
│   ├── SetupActivity.kt         ← First-run setup
│   ├── VaultActivity.kt         ← Entry list
│   ├── security/CryptoManager.kt
│   └── data/
│       ├── VaultDatabase.kt
│       ├── VaultRepository.kt   (original)
│       └── VaultRepositoryImpl.kt (full impl)
├── app/src/main/res/xml/
│   ├── network_security_config.xml  ← Network hardening
│   └── data_extraction_rules.xml    ← Backup exclusion
├── app/src/main/res/values/strings.xml
├── app/proguard-rules.pro
├── app/build.gradle
├── app/AndroidManifest.xml
└── README.md
```
