# iOS Release Enablement

## Configuracion aplicada en codigo
- `app.json`:
  - `ios.bundleIdentifier = com.fclaiba.ramgosmobile`
  - `ios.buildNumber = 1`

## Pre-requisitos de cuenta/plataforma
- Apple Developer Program activo.
- Acceso a App Store Connect con permisos de app management.
- Proyecto EAS asociado al owner correcto.

## Credenciales iOS (EAS)
- Opcion managed (recomendada):
  - generar certificados/profiles desde EAS.
- Opcion manual:
  - cargar certificate + provisioning profile validos.

## Flujo de build y distribucion
1. Build iOS release:
   - `eas build -p ios --profile production`
2. Enviar a TestFlight:
   - `eas submit -p ios --profile production` (o upload manual desde ASC)
3. Distribuir testers internos/externos.
4. Recolectar evidencia de validación para acta final.

## Smoke iOS requerido
- login
- listado
- compra
- disputa/chat
- resena
- perfil

## Compliance Apple
- Privacy labels (App Privacy) completos.
- ATT configurado si hay tracking.
- Export compliance validado (si aplica).
- Permisos en runtime alineados con uso real.

## Cierre operativo App Store Connect (paso a paso)
1. Crear app record en App Store Connect:
   - Nombre, idioma principal, bundle ID, SKU.
2. Completar metadata mínima:
   - título, subtítulo, descripción, keywords, URL de soporte, URL de privacidad.
3. Cargar assets:
   - screenshots iPhone (requerido), iPad si aplica, app icon/preview si aplica.
4. Configurar App Privacy:
   - tipos de datos recolectados y propósitos.
5. Configurar pricing/disponibilidad:
   - países/regiones, fecha de disponibilidad.
6. Adjuntar build de TestFlight validado:
   - build aprobada para testers internos (y externos si aplica).
7. Ejecutar smoke en build TestFlight:
   - login, listado, compra, disputa/chat, reseña, perfil.
8. Crear submission de producción:
   - versión, notas de review, contacto de revisión, respuestas compliance.
9. Go/No-Go final con evidencia en acta.

## Evidencia obligatoria
- Build ID de EAS
- URL/captura de TestFlight build
- Matriz smoke iOS PASS/FAIL
- Capturas/videos y IDs de negocio cuando aplique
- Capturas de App Store Connect (metadata, privacy, pricing, submission)
