# PLAN_SPRINT_5 — Backend Migration & Real-Time Sync

## Objetivo
Migrar el estado de la aplicación de memoria (Context API) a una base de datos en tiempo real (Convex) para permitir sincronización entre dispositivos y gestión de stock real.

## Scope (qué se hace)
- **Backend (Convex)**:
  - Definir esquema (`schema.ts`) para Usuarios, Productos, Servicios, Eventos y Bonos.
  - Implementar mutaciones transaccionales para compras (control de stock).
  - Implementar queries para el feed del Marketplace.
- **Frontend Integration**:
  - Conectar `MarketplaceContext` a Convex.
  - Reemplazar hooks locales por `useQuery` y `useMutation`.
- **Gestión de Stock**:
  - El botón "Comprar" debe validar stock en servidor.
  - Decremento automático de stock al confirmar compra.
- **Simulación de Pagos**:
  - UI de pago exitoso (sin integración real de tarjetas) que dispara la transacción de stock.

## Archivos/zonas candidatas
- `convex/schema.ts`
- `convex/listings.ts`
- `convex/users.ts`
- `src/contexts/MarketplaceContext.tsx`
- `src/screens/PaymentScreen.tsx`

## Definition of Done (DoD)
- Los productos creados en un dispositivo aparecen automáticamente en otro.
- Si User A compra el último ítem, User B ve "Agotado" inmediatamente.
- La compra decrementa el stock en la base de datos.
- No se integra pasarela de pago real, pero el flujo visual funciona.

## Checklist DoD (Sprint 5)
- [ ] **Schema**: Tablas `users` y `listings` definidas.
- [ ] **Sync**: Feed del Marketplace lee de la DB.
- [ ] **Stock**: Compra reduce stock y bloquea sobre-venta.
- [ ] **Dual-Publish**: Negocios publican a la DB correctamente.
- [ ] **Pagos**: Flujo simulado conectado a la mutación de compra.
