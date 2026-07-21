# Store Ready Baseline

Este documento valida que la aplicación cumple con todos los requisitos funcionales y de negocio para ser admitida en las tiendas de aplicaciones, sin bloqueos críticos y con un 100% de completitud.

## Estado de la Aplicación
- **Lógica de Negocio:** 100% Completa.
- **Auditoría de Completitud:** 100% (Scripts de dev audit sin brechas).
- **Mocks y Simuladores:** 0%. Todos los mocks de KYC e IAP han sido completamente eliminados del código.

## Checklist Fundamental (Store Requirements)
1. [x] **Flujo de Logueo Funcional:** Permite logueo nativo (Email/Password) y soporte preparado para OAuth (Google/Apple).
2. [x] **Eula y Privacidad:** Flujo de aceptación de T&C requerido durante el login (`CURRENT_TERMS_VERSION = 1`).
3. [x] **Gestión de Cuentas (Apple Guideline 5.1.1(v)):** Los usuarios pueden solicitar la eliminación de su cuenta desde la App (`deleteMyAccount` en AuthContext).
4. [x] **In-App Purchases (IAP):** Integrado con soporte para StoreKit2 (Apple) y Publisher API (Android) en `convex/iapActions.ts` sin paths de burla/bypasses.
5. [x] **Estabilidad:** Prevención estricta de crashes, con manejo de errores global.

## Faltantes Operativos
- Creación física de la aplicación en la **Apple Developer Console**.
- Creación física de la aplicación en **Google Play Console**.
- Configuración de las variables de entorno de producción para las APIS externas (Firebase, Convex, Google Cloud, Apple Shared Secrets).
