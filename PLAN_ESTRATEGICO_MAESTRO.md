# Plan Estratégico Maestro

## §15 Tablero de Progreso por Fase

| Fase | Estado | % Completado | Bloqueante |
| --- | --- | --- | --- |
| 1. UI de Reels | ✅ Completado | 100% | Ninguno |
| 2. Resolución de Bugs | ✅ Completado | 100% | Ninguno |
| 3. Mejoras de UX Social y Composer | ✅ Completado | 100% | Ninguno |
| 4. Unificación de Perfiles (Social + Comercial) | ✅ Completado | 100% | Ninguno |
| 5. Entradas al perfil + restauración del flujo de Cita | ✅ Completado | 100% | Ninguno |

## §16 Bitácora de Errores

| Error | Solución |
| --- | --- |
| Videos de Loops no estaban centrados verticalmente y se veían desfasados si no llenaban la pantalla | Se eliminó `paddingBottom: TAB_BAR_HEIGHT` del contenedor `videoCentering` en `LoopItem.tsx` |
| Perfil parpadea "Perfil no encontrado" al recargar | Condición `profile === undefined` agregada para mostrar ActivityIndicator en `HybridProfileScreen.tsx` |
| Foto de perfil chica | Tamaño aumentado a 140x140 en `ProfileScreen.tsx` |
| Mensajes de chat dados vuelta | `messages.slice().reverse()` añadido a los datos del `FlatList inverted={true}` en `ChatScreen.tsx` |
| Text "Descubre oportunidades" | Reemplazado por imagen del Logo de Ramgos en `HomeScreen.tsx` |
| Posteos no aparecen (feed ignora recientes) | Corregido guardado de `olderPages` en `useSocialFeed.ts` para no ignorar página 1 |
| Fotos de posteos no se guardaban | Enum `ImagePicker.MediaTypeOptions.Images` usado en lugar de array en `CreatorStudioModal.tsx` |
| No deja postear sin foto o sin texto con producto | Validación `hasContent` modificada para incluir `!!attachedProduct` |
| Productos adjuntos no mostraban imagen en posts | `CommerceLinker.tsx` actualizado para extraer `imageUrl` y pasarlo a `CreatorStudioModal.tsx` |
| Imágenes de productos rotas en el carrito | `getMyCart` en `cart.ts` actualizado para resolver la URL de storage (`ctx.storage.getUrl`) |
| Composer era un modal muy invasivo | Refactorizado y convertido en `InlineComposer.tsx` inyectado directamente en el feed |
| Video mal encuadrado en Loops Web | Modificado `<Video>` a `resizeMode={ResizeMode.COVER}` |
| Carrusel de imágenes difícil de usar en Web | Se agregaron botones laterales (flechas) para pasar las fotos manualmente en `PostImageCarousel.tsx` |
| Chat seguía invertido verticalmente en Web | Removido `transform: [{ scaleY: -1 }]` redundante en `MessageBubble.tsx` |
| FlatList Invariant Violation "Changing numColumns on the fly" | Agregado prop `key` únicos (`grid-view` / `list-view`) para forzar el unmount al cambiar el layout en `SocialProfileFeed.tsx` |
| Consola de navegador llena de advertencias de seguridad por Blob/File | Filtrado dinámico agregado a `ImageWithFallback.tsx` y `Post.tsx` para ignorar `blob:` y `file:` inválidos generados localmente. |
| Múltiples pantallas de perfiles desarticuladas (`Hybrid`, `Commercial`, `Business`) | Refactorizado y fusionado todo en un solo `CommercialProfileScreen.tsx` que aloja ambos modos (Social / Comercial) eliminando los archivos restantes. |
| La Fase 4 borró `BusinessProfileScreen.tsx` (commit `ac34bfa`) y con él la sección "Servicios y Contacto": se perdió el acceso directo a cada formulario publicado del negocio, quedando un solo botón genérico "Solicitar Información" | Restaurada la sección en el modo Comercial de `CommercialProfileScreen.tsx`, con una tarjeta por formulario que abre `FormFillScreen` con ese `formId`. Se agregó además el CTA dedicado "Agendar cita" que entra derecho al selector de día/horario. |
| La cabecera del post en el feed principal (`PostCard.tsx`) era completamente inerte: tocar el avatar o el nombre del autor no hacía nada, y `UnifiedFeed.tsx` descartaba el `userId` al armar `authorInfo` | Agregado el prop `onUserPress` a `PostCard`; la cabecera usa `post.authorUserId` (que siempre viaja desde `decoratePosts`). Cableado desde `UnifiedFeed` y `HashtagFeedScreen`. |
| Avatares inertes en comentarios, post citado, banner de repost, miembros de comunidad, solicitudes de ingreso, "quién vio" la historia e integrantes de grupo | Todos hechos tappables contra el mismo destino. |
| El destino del perfil se invocaba con 4 nombres de parámetro distintos (`sellerId`, `userId`, `id`, `handle`) sin nada que lo tipara | Centralizado en `src/navigation/openUserProfile.ts` (`openUserProfile` / `pushUserProfile`); los 16 call sites pasan por ahí. |
| El perfil propio mostraba "Seguir" y "Contactar" contra uno mismo | Rama `isOwnProfile`: muestra "Editar perfil" y oculta los CTA de cita/consulta. |
| La tarjeta de vendedor de la PDP mostraba un rating inventado y fijo ("4.9 • 120 ventas") | `ItemDetailScreen.tsx` ahora sólo muestra el rating si el backend lo hidrata; si no, no muestra nada. |

## Checklist de la Fase 4: Perfiles Unificados

- [x] Inyectar modo Social dentro de `CommercialProfileScreen`.
- [x] Crear un control de cambio entre pestaña Social / Comercial.
- [x] Eliminar `HybridProfileScreen` y `BusinessProfileScreen`.
- [x] Actualizar todas las rutas y llamadas de `App.tsx` para apuntar al perfil universal.

## Checklist de la fase actual (Fase 5: Entradas al perfil + Cita)

Evidencia: `npx tsc --noEmit -p tsconfig.json` → 0 errores en código de app
(los 35 restantes son de `jest.setup.ts`, preexistentes y ajenos a esta fase).

- [x] Punto único de navegación al perfil: `src/navigation/openUserProfile.ts`.
- [x] Los 16 call sites migrados; no queda ningún `navigate('CommercialProfile', …)` crudo fuera del helper.
- [x] Cabecera de `PostCard` tappable (feed principal, hashtags, comunidades).
- [x] Comentarios y respuestas tappables (`PostCommentsModal`), cerrando el sheet antes de navegar.
- [x] Autor del post citado tappable, sin pisar el tap que abre el post.
- [x] Banner de repost tappable.
- [x] Miembros de comunidad, solicitudes de ingreso, integrantes de grupo y "quién vio" la historia, tappables.
- [x] CTA "Agendar cita" en el perfil comercial → `FormFillScreen` con `initialQueryType: 'visit'` (arranca en día/horario).
- [x] CTA secundario "Enviar consulta".
- [x] Sección "Servicios y Contacto" restaurada, una tarjeta por formulario publicado → `FormFillScreen` con ese `formId`.
- [x] El CTA de cita se muestra sólo si el negocio configuró agenda o publicó un formulario de visita (antes bastaba con el rol, y podía llevar a un callejón).
- [x] Pestaña Comercial visible sólo si hay negocio / influencer / listings / formularios.
- [x] Rama de perfil propio ("Editar perfil").

## §17 Protocolo de Reanálisis
*(Vacio por ahora)*
