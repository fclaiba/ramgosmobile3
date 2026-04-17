# QA Android Store Readiness

Fecha: `2026-03-30`

## Resultado tecnico

- Build AAB release: `PASS`
- Comando: `build-release.ps1 -Output aab`
- Artefacto: `android/app/build/outputs/bundle/release/app-release.aab`
- Tamano: `42,747,494` bytes

## Firma y seguridad

- `android/keystore.properties`: `NO ENCONTRADO` en este entorno.
- Estado firma productiva:
  - `PARCIAL` (AAB generado, pero falta validar keystore de produccion final).

## Google Maps restrictions

- Package actual: `com.fclaiba.ramgosmobile`.
- Accion pendiente en Google Cloud Console:
  - restringir key a Android apps con `package + SHA1` release.

## Smoke tecnico minimo recomendado sobre build release

- [ ] instalacion
- [ ] login
- [ ] compra
- [ ] perfil

## Dictamen

- Android binario: `LISTO TECNICAMENTE (AAB PASS)`.
- Android store publish: `PENDIENTE` hasta validar firma productiva + completar Play Console.
