# PLAN_SPRINT_4 — Hardening & Release (Maps + Release Signed + QA)

## Objetivo
Que el APK release sea confiable: mapa funciona, firma correcta, y QA mínimo pasado.

## Scope (qué se hace)
- Google Maps (Android release):
  - Validar configuración de API key + restricciones + SHA-1.
  - Confirmar que `react-native-maps` renderiza tiles en APK release.
- Release signed:
  - Confirmar keystore/gradle config para firma.
  - Generar APK/AAB según necesidad.
- QA:
  - Smoke test de flujos críticos: login, compra, puntos, perfil, menú legales, mapa.
- Ajustes finales:
  - Naming/copy pendiente en headers (si quedó algún “Historial” visible).

## Archivos/zonas candidatas
- `android/app/src/main/AndroidManifest.xml` (si aplica)
- `app.json` / `eas.json` (si aplica a tu pipeline)
- Componentes mapa: `src/components/marketplace/MapView.tsx`, `src/components/NativeMap.tsx`

## Definition of Done (DoD)
- El mapa funciona en APK release (no pantalla gris).
- Build release firmado generado.
- QA smoke mínimo completado y documentado.

## Pasos exactos de build (reproducible)
- **APK**: `.\build-release.ps1`
- **AAB**: `.\build-release.ps1 -Output aab`
- **Ambos**: `.\build-release.ps1 -Output both`

Documentación completa de firma + SHA-1 + Google Maps: `RELEASE_ANDROID.md`.

## Checklist DoD (Sprint 4) — marcar al finalizar
- [ ] **Mapa**: renderiza tiles en **APK release** en dispositivo real (no pantalla gris).
- [x] **Build release**: `./gradlew assembleRelease` compila OK.
- [ ] **Firma release real**: `android/keystore.properties` configurado y artefacto firmado con keystore de release (no debug).
- [x] **QA smoke**: checklist actualizado en `QA_SMOKE_TEST.md` (incluye validación release + mapa + legales).

---

## Context Engineering (Sprint 4)
- No tocar features nuevas; solo estabilidad y release.
- Cualquier fix debe incluir verificación en build release (no solo dev).

---

## Prompt Engineering (Sprint 4) — Copiar/pegar en Cursor Chat
@PLAN_MAESTRO.md @PLAN_SPRINT_4.md @Codebase

Hola. Ejecutá Sprint 4 completo.
Objetivo: mapa funcionando en APK release + release signed + QA smoke.

Reglas:
- Prioridad estabilidad.
- Validar configuración Android (API key + SHA-1) y confirmar render real del mapa.

Entregables:
- Checklist DoD completo.
- Pasos exactos de build para reproducir el release.
- Lista de cambios mínimos aplicados.

