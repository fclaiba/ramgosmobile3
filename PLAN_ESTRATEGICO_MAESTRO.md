# Plan Estratégico Maestro

## §15 Tablero de Progreso por Fase

| Fase | Estado | % Completado | Bloqueante |
| --- | --- | --- | --- |
| 1. UI de Reels | ✅ Completado | 100% | Ninguno |
| 2. Resolución de Bugs | ✅ Completado | 100% | Ninguno |
| 3. Mejoras de UX Social y Composer | ✅ Completado | 100% | Ninguno |
| 4. Unificación de Perfiles (Social + Comercial) | ✅ Completado | 100% | Ninguno |

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

## Checklist de la fase actual (Fase 4: Perfiles Unificados)

- [x] Inyectar modo Social dentro de `CommercialProfileScreen`.
- [x] Crear un control de cambio entre pestaña Social / Comercial.
- [x] Eliminar `HybridProfileScreen` y `BusinessProfileScreen`.
- [x] Actualizar todas las rutas y llamadas de `App.tsx` para apuntar al perfil universal.

## §17 Protocolo de Reanálisis
*(Vacio por ahora)*
