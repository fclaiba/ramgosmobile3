# Android Release Guide

Este documento describe el proceso para generar y publicar una release de Ramgos para Android en Google Play Console.

## Requisitos Previos

- Tener acceso de Administrador/Release Manager en Google Play Console.
- Haber completado `STORE_METADATA.md` y `PLAY_CONSOLE_RELEASE_CHECKLIST.md`.
- El entorno de Convex de Producción configurado con todas las credenciales (Stripe, Identity, Google IAP).
- El keystore de Android configurado correctamente en Expo (o en local si se hace eject).

## Pasos de Build

Usamos Expo Application Services (EAS) para compilar el App Bundle (.aab).

1. Asegúrate de estar en la rama correcta (`main` o `release/vX.Y.Z`) y que el código esté limpio.
2. Incrementa el número de versión (version y versionCode) en `app.json`.
3. Ejecuta el comando de build:
   ```bash
   eas build --platform android --profile production
   ```
4. Descarga el archivo `.aab` generado.

## Publicación en Play Console

1. Ingresa a la consola de Google Play.
2. Ve a Producción (o Pruebas internas si es un testing release).
3. Selecciona "Crear nuevo lanzamiento".
4. Sube el archivo `.aab`.
5. Revisa las notas de lanzamiento.
6. Pulsa "Guardar", luego "Revisar versión".
7. Inicia el lanzamiento (rollout).

## Pruebas de IAP

- En `app.json` los permisos y configuraciones de IAP ya están agregados.
- Las pruebas de compras en Android requieren que subas al menos un track interno primero, para que la app figure registrada en el catálogo de productos de Play Console.
