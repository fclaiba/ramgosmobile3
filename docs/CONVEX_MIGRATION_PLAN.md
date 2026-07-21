# Plan de Implementación: Migración a Convex Cloud

## Objetivo
Habilitar la sincronización en tiempo real y persistencia en la nube utilizando **Convex**, reemplazando la simulación local (`mockConvexStore`).

## Pasos Previos (Requerido)
> [!IMPORTANT]
> **Acción Inmediata Requerida:**
> Necesitas inicializar el proyecto de Convex en tu máquina local. Ejecuta los siguientes comandos en tu terminal:
> 1.  `npm install convex`
> 2.  `npx convex dev`
>
> Esto abrirá una ventana de navegador para que te loguees y creará la carpeta `convex/` en tu proyecto. Una vez hecho esto, podré escribir el esquema y las funciones.

## Cambios Propuestos

### 1. Configuración del Proyecto
#### [NEW] [convex/schema.ts](file:///c:/ramgos-dev/ramgos-mobile/convex/schema.ts)
- Definir el esquema de la base de datos:
  - `users`: Perfiles de usuario, roles, estado KYC.
  - `products`: Catálogo de productos.
  - `orders`: Pedidos y transacciones.
  - `sessions`: Manejo de sesiones (si mantenemos la lógica actual) o integración con Auth.

#### [NEW] [convex/auth.ts](file:///c:/ramgos-dev/ramgos-mobile/convex/auth.ts)
- Migrar lógica de `mockConvexStore` a funciones de backend (`mutation` y `query`).
- Funciones: `signIn`, `signUp`, `signOut`, `getUser`.

#### [NEW] [convex/market.ts](file:///c:/ramgos-dev/ramgos-mobile/convex/market.ts)
- Funciones para Marketplace: `getProducts`, `createProduct`, `createOrder`.

### 2. Integración en Cliente
#### [MODIFY] [App.tsx](file:///c:/ramgos-dev/ramgos-mobile/App.tsx)
- Envolver la aplicación en `ConvexProvider`.
- Inicializar cliente de Convex (`ConvexReactClient`).

### 3. Refactorización de Contextos
#### [MODIFY] [src/contexts/AuthContext.tsx](file:///c:/ramgos-dev/ramgos-mobile/src/contexts/AuthContext.tsx)
- Reemplazar llamadas a `mockConvexStore` por `useMutation` y `useQuery` de Convex.
- Simplificar el manejo de estado local, delegando la "verdad" al servidor.

#### [MODIFY] [src/contexts/MarketplaceContext.tsx](file:///c:/ramgos-dev/ramgos-mobile/src/contexts/MarketplaceContext.tsx)
- Eliminar array estático `initialProducts`.
- Usar `useQuery(api.market.getProducts)` para obtener productos en tiempo real.
- Usar `useMutation(api.market.createProduct)` para crear productos.

## Verificación

### Manual
1.  **Sincronización:** Abrir la app en dos simuladores (o Web y Móvil).
2.  **Acción:** Registrar un usuario o crear un producto en uno.
3.  **Resultado:** Verificar que el otro dispositivo actualice la vista instantáneamente sin recargar (gracias a los websockets de Convex).
