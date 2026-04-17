# QA iOS Store Readiness

Fecha: `2026-03-30`

## Configuracion aplicada

- `ios.bundleIdentifier`: `com.fclaiba.ramgosmobile`
- `ios.infoPlist.ITSAppUsesNonExemptEncryption`: `false`
- Estrategia versionado iOS: `remote appVersionSource` (EAS incrementa `buildNumber` remoto).

## Validacion de pipeline EAS

Intento 1:
- Comando: `npx eas build -p ios --profile production --non-interactive`
- Resultado: `FAIL`
- Causa: credenciales iOS no configuradas para modo no interactivo.

Intento 2:
- Comando: `npx eas build -p ios --profile production --non-interactive`
- Resultado: `FAIL`
- Causa: `Credentials are not set up. Run this command again in interactive mode.`

## Bloqueos externos

- Configurar credenciales iOS en EAS (interactive) con cuenta Apple válida.
- Crear/verificar App Store Connect app record y permisos.

## Smoke iOS pendiente

- [ ] login
- [ ] listado
- [ ] compra
- [ ] disputa/chat
- [ ] resena
- [ ] perfil

## Dictamen

- iOS code/config: `ENCAMINADO`.
- iOS store-ready: `PENDIENTE` por credenciales Apple/TestFlight/App Review.
