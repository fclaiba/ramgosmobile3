# Play Console Release Checklist

## Precondiciones tecnicas
- [x] Backend/producto en `GO` (`QA_PROD_100_CIERRE.md`)
- [x] AAB de release generado (`android/app/build/outputs/bundle/release/app-release.aab`)
- [ ] Keystore productivo validado (`android/keystore.properties`) en entorno con secretos
- [ ] SHA1 de keystore release confirmado
- [ ] API key de Google Maps restringida por `package + SHA1`

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

## Promocion a produccion
- [ ] Release notes final
- [ ] Rollout strategy definida (porcentaje inicial)
- [ ] Monitoreo primeras 72h definido (crashes/ANR/reviews)
