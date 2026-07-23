# Backlog de Producto y Sprints (Scrum): Roles, KYC y Puntos

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
