# Store-Ready Baseline

Fecha baseline: `2026-03-30`

## Definition of Done (DoD) de publicacion

### Android (Play)
- Build `AAB` de release generado y verificable.
- Firma de release validada (keystore estable + Play App Signing).
- Google Maps restringido por `package + SHA1`.
- Ficha Play completa (metadata, Data Safety, rating, audiencia, politica).
- Closed testing ejecutado con smoke funcional y evidencia.
- API key de Maps no hardcodeada real en repo (placeholder + carga final pre-release).

### iOS (App Store / TestFlight)
- Config iOS de release completa (`bundleIdentifier`, `buildNumber`).
- Build iOS de release generado con EAS.
- Distribucion TestFlight realizada.
- Smoke funcional iOS ejecutado con evidencia.
- Compliance Apple completo (privacy labels, ATT/export compliance si aplica).
- Submission preparada en App Store Connect (metadata + pricing + review info).

## Version freeze

- `version`: `1.0.0` (fuente: `app.json`)
- `android.package`: `com.fclaiba.ramgosmobile`
- `eas.cli.appVersionSource`: `remote`
- Regla de congelamiento:
  - No cambiar `version` durante el ciclo store-ready.
  - Incrementar solo `versionCode/buildNumber` para reintentos de binario.

## Artefactos de evidencia obligatoria

- Comandos ejecutados y resultado (`PASS/FAIL`).
- Rutas de artefactos (`apk/aab/ipa`).
- Capturas de consola stores (Play/TestFlight/App Store Connect).
- IDs de negocio en smoke (order/dispute/review cuando aplique).
- Timestamp y responsable de cada validacion.

## Baseline de configuracion revisado

- `app.json`
- `eas.json`
- `RELEASE_ANDROID.md`
- `QA_PROD_100_CIERRE.md`
