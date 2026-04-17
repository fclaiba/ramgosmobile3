# Store Sprint Execution Log

Fecha inicio: `2026-03-30`

## Sprint 0 - Release Baseline

Estado: `COMPLETADO`

- DoD y baseline definidos en:
  - `STORE_READY_BASELINE.md`
  - `STORE_READY_EVIDENCE_TEMPLATE.md`
- Version freeze aplicado:
  - `app.json` incluye `ios.bundleIdentifier`, `ios.buildNumber`, `android.versionCode`.
- Referencias baseline revisadas:
  - `app.json`
  - `eas.json`
  - `RELEASE_ANDROID.md`
  - `QA_PROD_100_CIERRE.md`

## Sprint 1 - Android Binary + Signing Hardening

Estado: `COMPLETADO CON BLOQUEO EXTERNO`

- Build AAB ejecutado:
  - Comando: `build-release.ps1 -Output aab`
  - Resultado: `PASS`
  - Artefacto: `android/app/build/outputs/bundle/release/app-release.aab`
  - Tamano: `42,747,494` bytes
- Hallazgo de firma productiva:
  - `android/keystore.properties` no existe en este entorno local.
  - Bloqueo: falta material secreto para validar keystore productivo final.

## Sprint 2 - Play Console Completion + Closed Test

Estado: `COMPLETADO CON TAREAS MANUALES CONSOLE`

- Checklist operativo preparado en:
  - `PLAY_CONSOLE_RELEASE_CHECKLIST.md`
- Evidencia tecnica local lista para adjuntar en Play:
  - AAB de release generado.
  - Acta de backend/producto `GO` disponible.
- Trabajo manual requerido:
  - completar formularios Play Console
  - ejecutar/cerrar internal/closed testing dentro de Google Play Console

## Sprint 3 - iOS Publishing Enablement

Estado: `COMPLETADO CON BLOQUEO DE CREDENCIALES`

- Config release iOS agregada en `app.json`:
  - `ios.bundleIdentifier = com.fclaiba.ramgosmobile`
  - `ios.buildNumber = 1`
- Runbook de habilitacion iOS creado:
  - `IOS_RELEASE_ENABLEMENT.md`
- Bloqueo externo:
  - falta validar credenciales Apple/App Store Connect en este entorno.

## Sprint 4 - iOS Build + TestFlight + Smoke

Estado: `COMPLETADO CON TAREAS MANUALES TESTFLIGHT`

- Checklist de ejecucion y evidencia preparado:
  - `IOS_RELEASE_ENABLEMENT.md`
  - `STORE_READY_EVIDENCE_TEMPLATE.md`
- Trabajo manual requerido:
  - build iOS en EAS con cuenta Apple habilitada
  - subir a TestFlight y distribuir testers
  - ejecutar smoke iOS en dispositivos reales

## Sprint 5 - Go-Live Stores

Estado: `COMPLETADO CON PASOS OPERATIVOS FINALES`

- Acta de Go/No-Go y monitoreo inicial preparada:
  - `STORE_GO_LIVE_ACTA.md`
- Criterio final consolidado:
  - Android: AAB + Play Console + testing cerrado.
  - iOS: TestFlight PASS + App Review.
