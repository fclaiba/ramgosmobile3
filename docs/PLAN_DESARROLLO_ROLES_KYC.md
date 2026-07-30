# Backlog de Producto y Sprints (Scrum): Roles, KYC y Puntos

> [!TIP]
> **Enfoque TDAH:** Completá un solo paso a la vez. Tenés el backlog completo y la guía de testing abajo intactos para referencia.

## 🎯 FASE DE ENFOQUE ACTIVO (Paso a Paso)

### ✅ PASO 1: Reparar el Botón de "Cerrar Sesión" (Logout)
* [x] **1.1** Identificar en qué pantalla/componente está el botón de Cerrar Sesión.
* [x] **1.2** Asegurar que la función limpie la sesión en Convex.
* [x] **1.3** Redirigir correctamente a la pantalla de Bienvenida/Login.

### ✅ PASO 2: Deshabilitar/Ocultar Login Social (Google y Apple)
* [x] **2.1** Ocultar los botones de Google y Apple Login en la pantalla de Bienvenida.
* [x] **2.2** Asegurar que el formulario de correo y contraseña quede visible como opción principal.

### ✅ PASO 3: Corregir Subida de Historias desde Galería
* [x] **3.1** Localizar la función de carga de imagen en la pestaña Social.
* [x] **3.2** Verificar permisos y la subida a Convex/Storage.

### ✅ PASO 4: Implementar Autenticación 2FA (Código al Correo)
* [x] **4.1** Crear pantalla intermedia de verificación de código de 6 dígitos.
* [x] **4.2** Conectar con el servicio de correo para enviar el código temporal.

### ✅ PASO 5: Cambiar Username desde el Perfil
* [x] **5.1** Agregar botón de edición en el Perfil.
* [x] **5.2** Crear la mutación en Convex para actualizar el alias.

---

## Épicas (Epics)
Agrupación de las grandes funcionalidades del sistema:
1. **Épica 1:** Autenticación y Perfil de Usuario Normal.
2. **Épica 2:** Incorporación de Negocios y Ventas (KYC estricto).
3. **Épica 3:** Ecosistema para Influencers y Afiliados.
4. **Épica 4:** Sistema de Puntos y Fidelización.
5. **Épica 5:** Arquitectura Base, Seguridad y Privacidad (Zero Fricción).

---

## Plan de Sprints (Ciclos de Desarrollo)

### Sprint 1: Arquitectura Base y Usuario Normal
**Objetivo del Sprint:** Permitir el registro seguro de usuarios por correo, aceptación de Términos y Condiciones (T&C) base, y la opción de KYC saltable.

**Historias de Usuario (User Stories):**
- **[x] US1.1:** Como usuario normal, quiero registrarme con mi correo y elegir un nombre de usuario.
- **[x] US1.2:** Como sistema, debo enviar un código de verificación al correo para validar la cuenta legalmente. (Mockeado para Resend).
- **[x] US1.3:** Como usuario, debo leer y aceptar los T&C para usuarios regulares antes de avanzar.
- **[x] US1.4:** Como usuario (con correo verificado), quiero poder elegir si realizar el KYC ahora o saltarlo (para navegar y comprar con tarjeta sin fricción).

**Criterios de Aceptación:**
- **[x]** La base de datos (Convex) soporta roles y estados: `isEmailVerified`, `kycStatus` (`pending`, `skipped`, `completed`).
- **[x]** Si el usuario omite el KYC, la app debe permitirle navegar y comprar sin problemas.
- **[x] Crítico:** Si el usuario ya completó el KYC, la base de datos lo recuerda y jamás se lo vuelve a pedir.

---

### Sprint 2: Módulo de Negocios (Business)
**Objetivo del Sprint:** Permitir la creación de perfiles comerciales con un flujo de KYC obligatorio y restrictivo.

**Historias de Usuario:**
- **[x] US2.1:** Como negocio, quiero registrarme con mi correo, pero creando un perfil tipo "Negocio" y seleccionando mi nombre comercial.
- **[x] US2.2:** Como negocio, debo leer y aceptar los T&C *específicos para vendedores*.
- **[x] US2.3:** Como sistema, debo exigir el KYC obligatorio para el negocio. Si no lo hace, se bloquean sus funciones de venta.
- **[x] US2.4:** Como negocio (con KYC completado), quiero crear formularios para que mis clientes agenden visitas o soliciten llamadas.

**Criterios de Aceptación:**
- **[x]** Se muestran los T&C correctos basados en el rol.
- **[x]** Es imposible para el rol "Negocio" vender o crear formularios si `kycStatus !== 'completed'`.

---

### Sprint 3: Módulo de Influencers ✅ [COMPLETADO]
**Objetivo del Sprint:** Habilitar a los influencers para validar sus redes, aceptar condiciones comerciales y generar bonos de descuento.

**Historias de Usuario:**
- **[x] US3.1:** Como influencer, quiero registrarme (correo/código) y agregar obligatoriamente los enlaces de mis redes sociales.
- **[x] US3.2:** Como influencer, debo aceptar los T&C para Influencers (explicaciones de % y pagos).
- **[x] US3.3:** Como sistema, debo validar el KYC y el perfil de redes del influencer antes de activarlo.
- **[x] US3.4:** Como influencer (activo), quiero crear "Bonos" de descuento definiendo su valor y el % (40%, 50%, 60%).
- **[x] US3.5:** Como influencer, quiero un botón para copiar mi enlace de afiliado y usarlo en Link in Bio, Historias de Instagram, WhatsApp, etc.

**Criterios de Aceptación:**
- **[x]** Base de datos guarda y exige los enlaces de redes sociales.
- **[x]** Generación de enlaces de afiliados 100% funcional y copiable al portapapeles.

---

### Sprint 4: Dashboard y Sistema de Puntos ✅ [COMPLETADO]
**Objetivo del Sprint:** Proveer herramientas de seguimiento a influencers y lanzar el sistema de puntos general.

**Historias de Usuario:**
- **[x] US4.1:** Como influencer, quiero un panel de control (dashboard) exclusivo para monitorear las ventas generadas por mis bonos y mis ingresos.
- **[x] US4.2:** Como usuario de la app, quiero ganar puntos por registrarme, invitar amigos (referidos) y realizar compras. *(Nota: Puntos por mascota suspendidos).*
- **[x] US4.3:** Como sistema, debo asegurar que las interacciones base (Usuario<>App, Negocio<>App, Influencer<>Negocio) funcionen perfectamente sin fallos de estado.

**Criterios de Aceptación:**
- **[x]** El dashboard de influencers muestra datos reales y en tiempo real.
- **[x]** Las tablas de puntos (transacciones) se actualizan correctamente según la acción del usuario.

---

## Definition of Done (DoD) - Definición de "Terminado"
Para considerar cualquier Historia de Usuario como terminada, se debe cumplir lo siguiente:
1. **Funcionalidad:** El código cumple con todos sus Criterios de Aceptación.
2. **Seguridad y Privacidad:** Datos encriptados y permisos manejados correctamente.
3. **Cero Fricción (TDAH Friendly):** Sin bucles repetitivos molestos (especialmente con el KYC o los login). Si el estado está guardado, se respeta.
4. **Testing:** Interacciones comprobadas de extremo a extremo sin caídas de la base de datos.

---

## Nuevos Requerimientos y Feedback (WhatsApp - 24/7/2026)

**Errores y Bloqueos Reportados:**
- **Logout:** El botón de "Cerrar sesión" no está funcionando correctamente.
- **Login Social:** Google y Apple Login no funcionan por ahora. Se debe obligar o guiar al usuario a usar correos normales para iniciar sesión o crear cuenta.
- **Historias:** Error al intentar subir historia desde multimedia ("media").

**Nuevas Funcionalidades (Pendientes):**
- **Autenticación (2FA):** Falta implementar la autenticación en dos pasos (Punto 1).
- **Perfil de Usuario:** Poder cambiar el nombre de usuario desde la cuenta.

**Estado de Testing (Óscar):**
- **Referidos:** Probado exitosamente ("Ya agregue otro usuario con mi codigo").
- **KYC:** En progreso ("Seguimos con el kyc").
- **Negocios:** Por probar ("Ahora voy a seguir con el de negocios").

---

## Guía de Testing Integral Pasado al Grano (QA para TDAH)

Esta guía está diseñada de forma directa para validar **todas las Historias de Usuario de los Sprints** y los ajustes recientes. Cero frustración, paso a paso y al punto.

---

## 🟢 Módulo 1: Usuarios Normales (Sprint 1)

### Prueba 1: Registro y Verificación de Correo (KYC Opcional)
**Objetivo:** Validar el alta de un usuario común sin fricción innecesaria.
1. Ve a "Crear mi cuenta" y regístrate con correo electrónico.
2. Ingresa el **código de verificación de 6 dígitos** (Email Verification) que llega a tu correo para activar la cuenta.
3. Lee y acepta los Términos y Condiciones generales.
4. **✔️ Criterio de Éxito (Checklist):**
   - [ ] ¿Te dio la opción de "Saltar" el KYC?
   - [ ] Al saltarlo, ¿pudiste navegar por la app sin bloqueos?
   - [ ] Si completas el KYC, ¿se guardó el estado y no te lo volvió a pedir al reiniciar la app?

---

## 🔵 Módulo 2: Negocios y Vendedores (Sprint 2)

### Prueba 2: Perfil Comercial y Bloqueo
**Objetivo:** Confirmar que los negocios pasan por un embudo de verificación estricto.
1. Regístrate creando un perfil tipo "Negocio" con tu nombre comercial.
2. Acepta los Términos y Condiciones específicos para vendedores.
3. Intenta crear un producto o un formulario de agendamiento sin completar el KYC.
4. **✔️ Criterio de Éxito (Checklist):**
   - [x] ¿La app te impidió/bloqueó crear formularios y vender?
   - [x] Al completar el KYC, ¿se desbloquearon las funciones de venta automáticamente?

---

## 🟣 Módulo 3: Influencers y Afiliados (Sprint 3)

### Prueba 3: Redes Sociales y Bonos
**Objetivo:** Verificar las herramientas de monetización para creadores.
1. Regístrate como Influencer. El sistema debe exigirte agregar links de tus redes sociales.
2. Una vez activo, genera un "Bono de descuento" definiendo su rentabilidad (40%, 50% o 60%).
3. Busca tu enlace único de afiliado y toca el botón para copiarlo.
4. **✔️ Criterio de Éxito (Checklist):**
   - [x] ¿El formulario te obligó a ingresar los links de tus redes antes de finalizar?
   - [x] Al tocar el botón de copiar enlace, ¿se copió al portapapeles sin errores?
   - [x] ¿El bono nuevo quedó visible y activo en la lista?

---

## 🟠 Módulo 4: Sistema de Puntos y Dashboards (Sprint 4)

### Prueba 4: Panel de Control y Recompensas
**Objetivo:** Confirmar que las métricas y los puntos en vivo funcionen.
1. Si eres Influencer, entra a tu Dashboard exclusivo. Verifica que se listen las ventas generadas con tus bonos.
2. Como usuario regular, realiza acciones clave (registro inicial, usar un código de referido, o simular una compra).
3. **✔️ Criterio de Éxito (Checklist):**
   - [x] ¿Las ventas con bonos aparecen reflejadas en el dashboard del influencer?
   - [x] ¿Tu saldo de puntos subió de forma inmediata tras el registro o referido?

---

## 🛠️ Módulo 5: Ajustes Finales (Reportes Recientes)

### Prueba 5: Mejoras de UX y Seguridad
**Objetivo:** Limpiar la interfaz de bloqueos y probar las mejoras.
1. **✔️ Criterio de Éxito (Checklist):**
   - [x] **Login:** ¿Están ausentes (ocultos) los botones de Google y Apple en Bienvenida?
   - [x] **Logout:** Al presionar "Cerrar sesión", ¿te redirige de inmediato al login sin congelar la pantalla?
   - [x] **Perfil:** ¿Pudiste cambiar tu `@username` con el ícono de lápiz y ver el cartel verde de éxito?
   - [x] **Historias:** ¿Pudiste subir una foto de tu galería a las Historias sin fallos de carga?

---

## 📋 Resumen Rápido (Lista de Cotejo QA)
Usa este cuadro rápido para firmar con ✅ (Éxito) o ❌ (Fallo) al revisar la app:
* [x] (Mod 1) ¿Pude registrar un usuario normal con verificación de correo y saltar el KYC?
* [x] (Mod 2) ¿Un Negocio nuevo es bloqueado de vender si no completa el KYC?
* [x] (Mod 3) ¿El Influencer puede agregar sus redes, generar bonos y copiar su link?
* [x] (Mod 4) ¿Suman los puntos correctamente y el dashboard muestra ventas en vivo?
* [x] (Mod 5) ¿El botón "Cerrar sesión" me saca al inicio rápido y sin errores?
* [x] (Mod 5) ¿Están ocultos los botones de login de Apple/Google?
* [x] (Mod 5) ¿Pude cambiar exitosamente mi `@username` desde el perfil?
* [x] (Mod 5) ¿Se subió correctamente mi foto a las Historias desde la galería?
