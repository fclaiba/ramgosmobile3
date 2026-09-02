# Plan Estratégico Maestro

## §15 Tablero de Progreso por Fase

| Fase | Estado | % Completado | Bloqueante |
| --- | --- | --- | --- |
| 1. UI de Reels | ✅ Completado | 100% | Ninguno |
| 2. Resolución de Bugs | ✅ Completado | 100% | Ninguno |
| 3. Mejoras de UX Social y Composer | ✅ Completado | 100% | Ninguno |
| 4. Unificación de Perfiles (Social + Comercial) | ✅ Completado | 100% | Ninguno |
| 5. Entradas al perfil + restauración del flujo de Cita | ✅ Completado | 100% | Ninguno |
| 6. Stripe Connect completo (SCT + escrow + split + refunds + payouts, bi-modal) | ✅ Código completo — pendiente E2E con credenciales | 95% | Deploy a Convex y destinos de webhook los carga el usuario desde su PC (el entorno nube no llega a api.convex.dev) |

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
| Cerebro dividido test/live: `stripe.ts` transfería con la clave TEST mientras `http.ts`/`connect.ts`/`reconciliation.ts` usaban `STRIPE_SECRET_KEY` (live); `connect.ts` y `subscriptions.ts` lanzaban al cargar el módulo si faltaba la clave | `convex/_stripeEnv.ts` + `convex/stripeClient.ts`: un cliente por modo (`getStripe(mode)`), lazy, nunca lanza al cargar; `mode` persistido en `payments`/`orders`/`payouts`; cuentas Connect por modo (`stripeConnectAccountId` / `…Test`); rutas de webhook por modo (`/stripe-webhook`, `/stripe-webhook-test`). |
| Transfers falsos en producción: un error de capability de Stripe se convertía en `demo_mock_transfer_*` y la orden quedaba "liberada" sin mover dinero; 4 implementaciones de transfer divergentes; el influencer nunca se transfería en el release | Un solo camino `internal.stripe.internalReleaseOrderEscrow` (`held → release_pending → released`), `transfers.create` con `source_transaction` + `idempotencyKey release:{orderId}:seller`; si Stripe falla la orden vuelve a `held` con `escrowReleaseError` y aviso a admins. Influencer: fila `payouts` `scheduled` a +10 días y cron diario con `idempotencyKey release:{orderId}:influencer`. |
| Webhook no idempotente: `internalProcessMultiVendorCart` leía el carrito vivo y un reintento duplicaba sub-órdenes y descontaba stock dos veces; `charge.refunded`/`charge.dispute.created` no tocaban `orders` y el cron liberaba igual | Snapshot del checkout congelado en `payments.checkoutSnapshot`; `internalProcessPaidCheckout` idempotente por índice `orders.by_stripe_payment_intent`; `charge.refunded` → `internalSyncExternalRefund`; disputas → `frozen`/restauración; eventos V2 thin con `parseEventNotificationAsync`. |
| Split incorrecto: comisión 30% a todo el carrito si había un bono, fee de Stripe estimada, prorrateo con `Math.round` que no sumaba el total, `commissionRate` enviado por el cliente | `convex/_split.ts`: comisión por línea, fee real de Stripe (`balance_transaction.fee`) reprorrateada con mayor resto, invariante Σ = total verificada por tests (`convex/__tests__/split.test.ts`). El cliente ya no manda montos ni tasas: sólo `listingId`, `quantity`, `referralCode` y el total esperado. |
| Reembolsos sin dinero: `cancelOrder` y `resolveDispute(buyer)` marcaban `refunded` sin `refunds.create`; `adminRefundEscrow` refundaba el total del PI compartido sin revertir transfers | `internal.stripe.internalRefundOrder`: refund por el monto de ESA orden (`idempotencyKey refund:{orderId}:{n}`) + `transfers.createReversal` proporcional; puntos devueltos si la orden se pagó 100% con puntos. |
| Connect incompleto: sólo pedía `stripe_transfers` (el vendedor no podía retirar), `return_url ramgos://onboarding/complete` no lo manejaba nadie, y los dashboards leían `stripeConnectAccountId` de un objeto de sesión que nunca lo incluye | `ensureConnectAccount` pide `stripe_transfers` + `payouts`; `createOnboardingLink` vuelve a `ramgos://connect/return?mode=…` (ruta `ConnectReturn`, `RESERVED_PATHS` + `WebBrowser.openAuthSessionAsync`); estado reactivo `api.connect.getMyConnectStatus`; hook único `src/hooks/useConnectOnboarding.ts` para Business/Influencer/Withdrawal. |
| Cliente: `.env.local` sin publishable key apagaba toda la app; el formulario web no mandaba `shipping`; `EscrowContext.isEscrowEnabled` dependía del modo test; 5 gates distintos de `confirmReceipt`; puntos valuados a $0,01 en el cliente y $0,001 en el servidor | `PaymentModeContext` con `availableModes` (clave + backend), fallback por prefijo; paridad web/native; escrow siempre habilitado; gate único `canConfirmReceipt(status) && escrowState==='held'`; valor del punto importado de `convex/economy/_rewardRules.ts` y descuento absorbido por la comisión (validado en servidor). |

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

## Checklist de la Fase 6: Stripe Connect completo

Evidencia (2026-09-02): `npx tsc -p tsconfig.check.json --noEmit` → 0 errores en `convex/**`, `src/**`, `App.tsx`; `npx jest convex/__tests__/split.test.ts convex/__tests__/escrowStates.test.ts convex/__tests__/stripeEnv.test.ts convex/__tests__/fees.test.ts src/navigation/__tests__/getStateFromPath.test.ts` → 58/58.

- [x] Cliente Stripe por modo (`convex/stripeClient.ts`), sin `new Stripe` sueltos ni throws al cargar.
- [x] Schema: `mode`, centavos, `checkoutSnapshot`, índices `orders.by_stripe_payment_intent`, `by_escrow_state_and_release_due`, `payouts.by_order_and_kind`, `users.by_stripe_connect_account[_test]`.
- [x] Checkout server-side (`internalBuildCheckout` + `_split.ts`), PI con `transfer_group` e `idempotencyKey`.
- [x] Webhook bi-modal idempotente (snapshot + thin), órdenes desde snapshot, fee real.
- [x] Liberación única con `source_transaction` + idempotencia; fallo visible (`escrowReleaseError`).
- [x] Influencer a los 10 días (cron `influencer-due-payouts`), sin cron semanal.
- [x] Refunds/reversals/disputas automáticos (`internalRefundOrder`, freeze/unfreeze).
- [x] Connect V2 con `payouts`, onboarding con retorno a la app, estado reactivo, payout instantáneo/idempotente.
- [x] Crons sólo con `crons.cron`/`interval`; reconciliación por modo después del release.
- [x] Cliente: toggle por modos disponibles, formularios con el contrato nuevo, escrow siempre activo, hook de onboarding, `ConnectReturnScreen`.
- [x] Legacy borrado: `convex/connectV2.ts`, `convex/payments/actions.ts`, `src/services/fintech/paymentProviders.ts`.
- [x] Docs: `docs/PAYMENTS_SETUP.md`, `.env.example`, `scripts/check-readiness.js`, `docs/ARQUITECTURA_ESCROW.md`.
- [ ] Deploy (`npx convex dev` / `deploy`) + variables en Convex + destinos A/B en Stripe Workbench (lo hace el usuario desde su PC).
- [ ] E2E en test (§6 de `docs/PAYMENTS_SETUP.md`, 11 pasos) — pendiente de credenciales.
- [ ] `py -m graphify update .` (no disponible en el entorno nube).

## §17 Protocolo de Reanálisis
*(Vacio por ahora)*
