# Seguridad Defensiva y Mejores Prácticas

Este documento contiene pautas teóricas para implementar seguridad defensiva en el stack de React Native + Convex + Stripe Connect.

## 1. Control de Acceso Basado en Roles (RBAC) en Convex

Para evitar vulnerabilidades de autorización (como Insecure Direct Object Reference - IDOR o escalada de privilegios), el control de roles debe implementarse siempre en el backend (Convex).

### Principios Fundamentales:
*   **Nunca confíes en el cliente:** El rol enviado desde el frontend puede ser manipulado. El rol verdadero debe estar almacenado en la base de datos de Convex o en los claims de autenticación seguros.
*   **Verificación Centralizada:** Usa middlewares o funciones envoltura (`wrappers`) en Convex para que todas las mutaciones/consultas sensibles pasen por el mismo control de roles.

### Estrategia de Implementación (Teórica):

1.  **Modelo de Datos:**
    En tu esquema `schema.ts`, la tabla de usuarios debe definir claramente el rol:
    ```typescript
    // Ejemplo de esquema (conceptual)
    import { defineSchema, defineTable } from "convex/server";
    import { v } from "convex/values";

    export default defineSchema({
      users: defineTable({
        tokenIdentifier: v.string(), // ID del proveedor de auth
        role: v.union(v.literal("consumer"), v.literal("business"), v.literal("influencer"), v.literal("admin")),
        // otros campos...
      }).index("by_token", ["tokenIdentifier"]),
    });
    ```

2.  **Funciones de Autorización (Wrapper):**
    No verifiques el rol manualmente en cada mutación. Crea una función de orden superior:
    ```typescript
    // Concepto de un wrapper seguro
    // const adminMutation = customMutation(mutation, {
    //   roleAccess: ["admin"]
    // });
    ```
    *Dentro de este wrapper*, la lógica debe:
    a) Obtener la identidad autenticada (`ctx.auth.getUserIdentity()`).
    b) Buscar el usuario en la BD usando esa identidad.
    c) Verificar que el rol en la BD coincide con el requerido.
    d) Si falla, lanzar un error inmediatamente antes de ejecutar cualquier lógica de negocio.

3.  **Prevención de IDOR:**
    Incluso si un usuario tiene el rol correcto (ej. `business`), si solicita modificar un recurso (ej. editar un producto con `productId="123"`), el backend **debe** verificar que ese `productId` pertenezca al ID del usuario autenticado. Nunca confíes únicamente en que se envíe el ID por parámetro.

## 2. Gestión Segura de Stripe Connect

La integración con plataformas financieras como Stripe requiere un manejo estricto de secretos y validación de datos.

### Protección de Secretos:
*   **Claves de Producción:** Las claves secretas de Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) **jamás** deben estar hardcodeadas en el código, ni siquiera en el backend.
*   **Variables de Entorno:** En Convex, utiliza el panel de configuración de entorno para almacenar estas claves de forma segura. Accede a ellas mediante `process.env.STRIPE_SECRET_KEY`.
*   **El Frontend solo usa Publishable Keys:** La aplicación en React Native solo debe conocer la `STRIPE_PUBLISHABLE_KEY`. Cualquier operación que requiera la clave secreta debe hacerse a través de una llamada (Action/Mutation) a Convex.

### Webhooks y Validación:
*   **Verificación de Firmas:** Los webhooks de Stripe deben ser verificados criptográficamente para asegurar que provienen de Stripe y no de un atacante simulando un pago.
    *   Usa el `STRIPE_WEBHOOK_SECRET` junto con el header `stripe-signature` para validar el evento usando la librería oficial de Stripe (`stripe.webhooks.constructEvent`).
*   **Validación de Montos Server-Side:** En operaciones fintech, el frontend solo debe enviar "qué" se quiere comprar. El backend (Convex) es quien debe calcular y confirmar el monto total interactuando con la base de datos o con Stripe directamente. Nunca permitas que el cliente envíe parámetros como `amount=1000` si eso dicta el precio final de la transacción.

### Logs y Datos Sensibles (PII):
*   Asegúrate de que los logs del servidor (console.log en Convex) no impriman datos de tarjetas de crédito, tokens de Stripe, o información personal de los usuarios (emails, direcciones) en texto plano.
