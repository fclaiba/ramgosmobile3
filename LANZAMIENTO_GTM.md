# Ramgos Mobile - Plan de Lanzamiento a Producción (GTM & Store Release) 🚀

Basado en la auditoría de `QA_PROD_100_CIERRE.md` y `ROADMAP_SPRINTS_100_REAL_EJECUCION.md`, confirmo que el **desarrollo core está 100% completado** (Seguridad Server-Centric, Convex Backend Unificado, Pagos/Wallet y Smoke Tests en PROD aprobados). 

El siguiente plan es la hoja de ruta definitiva para llevar la app a las tiendas (Google Play & App Store) y ejecutar un lanzamiento exitoso.

---

## FASE 1: Preparación Final de Tiendas (App Store & Google Play)

### 1.1 Metadatos y Assets Gráficos
Antes de subir los binarios, necesitamos tener todo el "Storefront" listo.
- [ ] **Textos:** Título, Subtítulo, Descripción Corta y Descripción Completa (optimizados para ASO).
- [ ] **Keywords:** Lista de 100 caracteres para iOS y etiquetas para Google Play.
- [ ] **Screenshots:** Set de capturas de pantalla (mínimo 4) mostrando el flujo principal: Listado de Marketplace, Carrito, Chat de Disputas y Wallet.
- [ ] **Ícono y Feature Graphic:** Ícono en alta resolución (1024x1024) y Feature Graphic para Google Play (1024x500).

### 1.2 Compliance y Legales
- [ ] **Política de Privacidad:** URL pública y accesible con la política de privacidad de Ramgos (requerida por ambas tiendas).
- [ ] **Términos y Condiciones:** URL pública con los Términos de Servicio (EULA).
- [ ] **Cuestionario de Contenido:** Completar el formulario de clasificación de contenido en Google Play Console.
- [ ] **Data Safety (Google) / App Privacy (Apple):** Declarar exactamente qué datos recolectamos (Email, Identificadores de dispositivo, etc.) según lo que hace Convex en el backend.

---

## FASE 2: Build Final y Firma de Artefactos

### 2.1 Variables de Entorno de Producción
Verificar por última vez que EAS Build use las credenciales correctas:
- [ ] `EXPO_PUBLIC_CONVEX_URL` apuntando a la instancia productiva (`https://deafening-turtle-227.convex.cloud`).
- [ ] Claves públicas de Stripe (si aplica para pagos con tarjeta).

### 2.2 Generación de Binarios (EAS)
Ejecutar los builds finales para tiendas (AAB para Android, IPA para iOS):
- [ ] **Android:** `eas build --platform android --profile production` (Generará el archivo `.aab` requerido por Google Play).
- [ ] **iOS:** `eas build --platform ios --profile production` (Generará el archivo `.ipa` requerido por App Store Connect).

*Nota: Ya has probado el script `build-release.ps1` exitosamente para APKs, pero para subir a Google Play necesitas el formato App Bundle (.aab).*

---

## FASE 3: Submission y Revisión de Tiendas

### 3.1 Google Play Console (Android)
- [ ] Crear un "Internal Testing Track" y subir el `.aab`.
- [ ] Añadir a los stakeholders como testers internos.
- [ ] Promover el release a "Closed Testing" o directamente a "Production" (Review puede tardar de 1 a 5 días).

### 3.2 App Store Connect (iOS)
- [ ] Subir el `.ipa` usando Transporter o Xcode (o via EAS Submit si está configurado).
- [ ] Distribuir en TestFlight para una última prueba en dispositivos Apple físicos.
- [ ] Enviar a revisión ("Submit for Review"). Apple suele tardar entre 24 y 48 horas.
- [ ] *Sugerencia:* Proporcionar credenciales de prueba (`consumer@ramgos.com`) en las "App Review Information" para que los revisores de Apple puedan probar el Marketplace.

---

## FASE 4: Go-Live y Monitoreo (Día Cero)

### 4.1 Activación del Release
- [ ] Una vez aprobadas por ambas tiendas, coordinar el lanzamiento publicando la app simultáneamente (Phased Release o 100% Rollout).
- [ ] Verificar que la URL de Convex Prod esté respondiendo correctamente sin picos de latencia inusuales.

### 4.2 Tareas de Monitoreo Post-Lanzamiento
- [ ] **Logs de Convex:** Monitorear el dashboard de Convex buscando errores 500 o fallas de validación de identidad (`Uncaught Error: No autorizado`).
- [ ] **Reportes de Crash:** Estar atentos a reportes en Sentry/Crashlytics (si están integrados) o en Android Vitals / App Store Analytics.
- [ ] **Métricas Financieras:** Vigilar las tablas `ledger_transactions` y `walletAccounts` en Convex para asegurar que no hay anomalías en el sistema de Puntos/Rewards en los primeros días.

---

## 🛠️ Herramientas ECC Recomendadas para este proceso:
Dado que tengo acceso a las skills, te recomiendo usar (si necesitas ayuda detallada en el proceso):
1. **`ui-ux-designer`**: Para pulir los screenshots de las tiendas.
2. **`coding-standards`**: Si sale algún hotfix urgente post-lanzamiento.

El proyecto técnico está impecable, el backend está solidificado y el QA E2E pasó. **El código ya no es el cuello de botella, el objetivo ahora es puramente operativo de publicación.**
