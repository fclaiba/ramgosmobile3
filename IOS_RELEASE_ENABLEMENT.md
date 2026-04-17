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

## Evidencia obligatoria
- Build ID de EAS
- URL/captura de TestFlight build
- Matriz smoke iOS PASS/FAIL
- Capturas/videos y IDs de negocio cuando aplique
