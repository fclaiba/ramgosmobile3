# Requerimientos de Desarrollo de Software

Dado que tu solicitud incluía implementaciones que requieren desarrollo activo en el código base, he enmarcado estos requerimientos de forma separada. Si deseas avanzar con alguno de estos puntos, por favor proporciónanos acceso al repositorio real o comparte los fragmentos de código específicos para que podamos desarrollarlos:

## 1. Implementación de Base (Para habilitar el Testing)
Para que los tests funcionales descritos en `examples/tests/` puedan integrarse y ejecutarse de manera efectiva contra tu código, es posible que necesitemos desarrollar o refactorizar:

*   **Configuración del Framework de Testing:** Implementar la configuración de Jest/Detox/Cypress en el repositorio (ej. `jest.config.js`).
*   **Mocks de Servicios Externos:** Desarrollar mocks robustos para el SDK de Stripe y para las funciones internas de Convex, de modo que las pruebas de integración no golpeen servicios reales.

## 2. Refactorización para Control de Acceso (RBAC)
Si tu código actual no implementa los principios de la guía `SECURITY_BEST_PRACTICES.md`, el trabajo de desarrollo implicaría:

*   **Crear Wrappers en Convex:** Desarrollar funciones `withRoleAccess` o middlewares personalizados en Convex que envuelvan tus queries y mutations para validar el rol centralizadamente.
*   **Actualizar Esquemas:** Modificar `schema.ts` para asegurar que el tipo de dato `role` esté fuertemente tipado.

## 3. Implementación de Pipelines CI/CD
Aunque he provisto un archivo `.github/workflows/ci.yml` estándar, integrarlo de verdad requeriría:

*   **Ajustar Scripts en `package.json`:** Asegurar que los comandos `npm run lint` y `npm run test` existan y funcionen correctamente con tu base de código actual.
*   **Configurar Secretos:** Necesitarás configurar `EXPO_TOKEN` en tu repositorio de GitHub para que el paso de compilación funcione.

## Siguientes Pasos
Si deseas que colabore escribiendo el código real para alguno de estos puntos, por favor provéeme los archivos pertinentes (ej. tu `schema.ts` actual, o tu configuración de `package.json`) y con gusto procederé a escribir la implementación.
