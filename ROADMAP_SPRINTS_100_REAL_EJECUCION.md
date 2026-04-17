# Ejecucion Roadmap Sprints 100% Real

Fecha: `2026-03-30 15:27:16 -03:00`  
Base branch commit: `fcdfab3aa33720a6868289038a1a4e5216706a5e`

## Sprint 0 - Alineacion y baseline

Estado: `COMPLETADO`

- DoD A-H unificado y trazable en `QA_PROD_100_CIERRE.md`.
- Entorno PROD verificado para release:
  - `eas.json` profile `production` usa `EXPO_PUBLIC_CONVEX_URL=https://deafening-turtle-227.convex.cloud`.
  - `.env.example` apunta a PROD.
  - `App.tsx` falla en runtime si falta `EXPO_PUBLIC_CONVEX_URL`.
- Pipeline tecnico reproducible ejecutado:
  - `npx convex codegen` -> PASS
  - `npm run typecheck` -> PASS
  - `build-release.ps1 -Output apk` -> PASS

## Sprint 1 - Seguridad server-centric estricta

Estado: `COMPLETADO`

Endpoints migrados/endurecidos con actor server-side y ownership/roles:

- `convex/users.ts`
- `convex/orders.ts`
- `convex/cart.ts`
- `convex/disputes.ts`
- `convex/files.ts`
- `convex/developer.ts`
- `convex/economy.ts`
- `convex/listings.ts` (nuevo endurecimiento en esta corrida)
- `convex/reviews.ts` (nuevo endurecimiento en esta corrida)

Cambios clave de esta corrida:

- `listings`: `createListing`, `getMyListings`, `purchaseItem`, `updateListing`, `deleteListing` ahora derivan actor con `requireActor` y validan owner/admin.
- `reviews`: `addReview`, `getUserReviews`, `addSellerResponse`, `deleteReview` ahora validan actor/ownership en servidor.
- Frontend alineado para enviar `actorId` en:
  - `src/components/AddReviewModal.tsx`
  - `src/contexts/MarketplaceContext.tsx`
  - `src/screens/CreateListingScreen.tsx`
  - `src/screens/MyListingsScreen.tsx`

## Sprint 2 - Wallet/Points/Rewards backend source-of-truth

Estado: `COMPLETADO`

- Ledger backend activo:
  - `pointsLedger` (`by_user_event`)
  - `walletLedger` (`by_user_event`)
  - `rewardsClaims` (`by_user_claim`)
- Idempotencia efectiva por clave de evento/claim:
  - `applyPointsEvent(eventKey)` no duplica eventos.
  - `applyWalletEvent(eventKey)` no duplica movimientos.
  - `claimReward(claimKey)` evita doble reclamo.
- Contexts integrados con mutations backend-first:
  - `src/contexts/PointsContext.tsx`
  - `src/contexts/WalletContext.tsx`
  - `src/contexts/RewardsContext.tsx`

## Sprint 3 - Dominio unificado (cart -> order -> dispute/chat -> review)

Estado: `COMPLETADO`

- Carrito backend unificado en `src/contexts/CartContext.tsx` usando `api.cart.*`.
- Creacion de orden con idempotencia (`idempotencyKey`) en `convex/orders.ts` y `MarketplaceContext`.
- Disputa/chat/escalado integrados server-side:
  - `convex/disputes.ts`
  - `src/contexts/MarketplaceContext.tsx`
  - `src/screens/marketplace/DisputeChatScreen.tsx`
- Reseñas ligadas a ownership y orden con validaciones server-centric en `convex/reviews.ts`.

## Sprint 4 - Smoke E2E PROD 6/6 con evidencia

Estado: `COMPLETADO`

Matriz smoke PROD: `PASS 6/6` (ver `QA_PROD_100_CIERRE.md`).

- login -> PASS
- listado -> PASS
- compra -> PASS
- disputa/chat -> PASS
- resena -> PASS
- perfil -> PASS

Evidencia:

- Capturas UI:
  - `C:/Users/franc/AppData/Local/Temp/cursor/screenshots/smoke-pass-login-20260330.png`
  - `C:/Users/franc/AppData/Local/Temp/cursor/screenshots/smoke-pass-listado-tienda-20260330.png`
  - `C:/Users/franc/AppData/Local/Temp/cursor/screenshots/smoke-compra-cart-with-item.png`
  - `C:/Users/franc/AppData/Local/Temp/cursor/screenshots/smoke-profile-menu-entry-20260330.png`
- IDs de negocio:
  - `orderId = jd7230nmnbvqhknrg6skywtks983wt0t`
  - `disputeMessageId = js7e6cy9k55cah28nyz3qvwwf983wchw`
  - `reviewId = k570qfxeyz30wd420ke1cctvwx83xp82`
- Caso negativo A->B: PASS (`No autorizado`).

## Sprint 5 - Cierre de acta y decision Go/No-Go

Estado: `COMPLETADO`

- Acta final consolidada: `QA_PROD_100_CIERRE.md`.
- Baseline tecnico revalidado en esta corrida:
  - `npx convex codegen` -> PASS
  - `npm run typecheck` -> PASS
  - `npx convex deploy -y` -> PASS (prod `https://deafening-turtle-227.convex.cloud`)
  - `build-release.ps1 -Output apk` -> PASS
- Artefacto release actual:
  - `C:/ramgos-dev/ramgos-mobile/android/app/build/outputs/apk/release/app-release.apk`
  - size: `60,943,145` bytes
  - lastWrite: `2026-03-30 15:26:37 -03:00`

Dictamen final: `GO`.
