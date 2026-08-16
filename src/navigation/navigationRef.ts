import { createNavigationContainerRef } from '@react-navigation/native';

// Ref compartida del NavigationContainer. Vive fuera de App.tsx para que
// componentes que están por encima del navigator (p.ej. SessionGuard) puedan
// redirigir al login sin importar App.tsx y crear un ciclo.
export const navigationRef = createNavigationContainerRef();
