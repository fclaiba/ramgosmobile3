# Play Console Release Checklist

## Precondiciones tecnicas
- [x] Backend/producto en `GO` (`QA_PROD_100_CIERRE.md`)
- [x] AAB de release generado (`android/app/build/outputs/bundle/release/app-release.aab`)
- [ ] Keystore productivo validado (`android/keystore.properties`) en entorno con secretos
- [ ] SHA1 de keystore release confirmado
- [ ] API key de Google Maps restringida por `package + SHA1`
- [ ] `app.json` sin API key hardcodeada real (usar placeholder y cargar key final antes de release)

## Google Maps hardening (antes de subir a producción)
- [ ] Obtener fingerprint del keystore release:
  - [ ] `keytool -list -v -keystore android/keystores/ramgos-release.jks -alias ramgos-release`
- [ ] En Google Cloud Console:
  - [ ] API habilitada: `Maps SDK for Android`
  - [ ] Restricción de aplicación: `Android apps`
  - [ ] Package: `com.fclaiba.ramgosmobile`
  - [ ] SHA1: fingerprint del keystore release
- [ ] Reemplazar `__SET_GOOGLE_MAPS_ANDROID_API_KEY__` en `app.json` por la key Android restringida.
- [ ] Generar AAB nuevo y validar mapa en build release (track internal/closed).

## Configuracion de app en Play Console
- [ ] App details completos (descripcion corta/larga, categoria, contacto)
- [ ] Privacy Policy URL publicada
- [ ] Data Safety completado
- [ ] Content Rating completado
- [ ] Target audience completado
- [ ] Screenshots/feature graphic subidos

## Testing y quality gates
- [ ] Release en track `internal` o `closed` creada
- [ ] Testers asignados
- [ ] Smoke Android ejecutado (login/listado/compra/perfil)
- [ ] Crash-free basico validado
- [ ] Hallazgos release-only corregidos
- [ ] Verificación de mapa en release (sin pantalla gris, sin `ApiException` de Maps)

## Promocion a produccion
- [ ] Release notes final
- [ ] Rollout strategy definida (porcentaje inicial)
- [ ] Monitoreo primeras 72h definido (crashes/ANR/reviews)
- [ ] Go/No-Go firmado con evidencia (`STORE_READY_EVIDENCE_TEMPLATE.md`)
