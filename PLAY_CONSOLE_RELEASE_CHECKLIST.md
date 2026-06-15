# Google Play Console Release Checklist

Lista de verificación para subir la aplicación Ramgos a producción en Android.

## 1. Configuración de la App (Pre-Lanzamiento)
- [ ] Versión de código incrementada (`app.json` -> `versionCode`).
- [ ] Versión visual incrementada (`app.json` -> `version`).
- [ ] `eas.json` configurado correctamente para production.

## 2. Seguridad y Credenciales
- [ ] Mocks deshabilitados: NO debe haber simuladores en el código de producción.
- [ ] Credencial de Google Cloud para Google Play Developer API (Service Account JSON) agregada en Convex.
- [ ] `GOOGLE_PLAY_PACKAGE_NAME` configurado en Convex Prod.
- [ ] Webhook para notificaciones en tiempo real configurado en GCP Pub/Sub y vinculado a Play Console.

## 3. Play Console Settings
- [ ] Cuestionario de clasificación de contenido (Content Rating) respondido.
- [ ] Política de Privacidad actualizada y URL agregada en App Content.
- [ ] Seguridad de los datos (Data Safety) formulario completo (informando qué recopilamos).
- [ ] Configuración de publicidad (Declarar si la app usa anuncios o no).

## 4. Productos IAP (Suscripciones)
- [ ] Productos de suscripción creados en "Monetize > Products > Subscriptions" (`pro_monthly`, `pro_yearly`, etc.).
- [ ] Precios base definidos.
- [ ] Productos activos.

## 5. Artifact y Testing
- [ ] Archivo `.aab` subido a Internal Testing primero.
- [ ] Descarga y prueba en dispositivo real vinculado al track de pruebas.
- [ ] Pago de IAP verificado con la tarjeta de test de Google.
- [ ] Promoción a Producción.
