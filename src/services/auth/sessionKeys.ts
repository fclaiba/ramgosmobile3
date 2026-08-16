// Claves de persistencia de auth. Viven acá (y no en AuthContext) para que
// componentes fuera del árbol de providers — CrashHandler, por ejemplo — puedan
// limpiar la sesión sin arrastrar convex/react en el import.
export const CURRENT_SESSION_KEY = '@ramgos/auth/current-session';
export const REMEMBERED_LOGIN_KEY = '@ramgos/auth/remembered-login';
