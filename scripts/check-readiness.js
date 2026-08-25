/**
 * Auditoría de preparación para producción.
 *
 * DOS ENTORNOS DISTINTOS, Y LA DIFERENCIA IMPORTA
 *
 * Este script chequeaba TODO contra `.env.local`, y eso es incorrecto para la
 * mitad de las variables:
 *
 *   - Las `EXPO_PUBLIC_*` las lee el bundle de la app, y sí viven en
 *     `.env.local`.
 *   - Los secretos de backend (`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, …) los
 *     leen las funciones de Convex vía `process.env` **en el servidor de
 *     Convex**, y se configuran con `npx convex env set`. `.env.example` lo
 *     dice explícitamente: "BACKEND / CONVEX SECRETS (Configure with
 *     `npx convex env set`)".
 *
 * Chequearlos contra `.env.local` daba **falsos positivos**: reportaba
 * `RESEND_API_KEY` como faltante mientras estaba perfectamente configurada en
 * Convex y el envío de emails funcionaba. Un auditor que miente en cualquier
 * dirección es peor que no tener auditor.
 *
 * Ahora los secretos de backend se verifican contra la salida real de
 * `npx convex env list`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let convexEnvError = null;

/**
 * Lee `.env.local` sin dotenv.
 *
 * El parser anterior no recortaba comentarios en la misma línea, y `.env.local`
 * tiene justamente eso:
 *
 *     CONVEX_DEPLOYMENT=dev:academic-lapwing-311 # team: …, project: ramgos-mobile
 *
 * El valor quedaba con el comentario pegado. Era invisible mientras el script
 * sólo leía `process.env`, pero cualquier subproceso lanzado desde acá hereda
 * ese `CONVEX_DEPLOYMENT` roto y la CLI de Convex falla con
 * `InvalidDeploymentName`.
 *
 * El comentario sólo se recorta cuando el `#` viene precedido de espacio, para
 * no cortar un valor legítimo que lo contenga (una contraseña, por ejemplo).
 * Si el valor está entre comillas se respeta entero.
 */
try {
  const envContent = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) return;

    const key = match[1].trim();
    let value = match[2].trim();

    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) {
      value = quoted[2];
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
} catch (e) {
  console.warn('⚠️ No se encontró el archivo .env.local o hubo un error al leerlo.');
}

console.log('🔍 Iniciando Auditoría de Preparación para Producción (Production Readiness)...\n');

let issues = 0;

/** Variables del entorno de Convex, leídas una sola vez. `null` si no se pudo. */
function loadConvexEnv() {
  try {
    // `shell: true` es obligatorio en Windows: desde Node 18.20/20.12, lanzar
    // un `.cmd` (como `npx.cmd`) sin shell falla con EINVAL — es el
    // endurecimiento por CVE-2024-27980. Los argumentos son literales fijos,
    // no entra nada del usuario, así que el shell no agrega superficie.
    const raw = execFileSync(
      'npx',
      ['convex', 'env', 'list'],
      { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], shell: true },
    );
    const names = new Set();
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match) names.add(match[1]);
    }
    return names;
  } catch (e) {
    // Un catch mudo acá deja al auditor reportando "sin verificar" sin decir
    // por qué, que es tan inútil como reportar un falso positivo.
    convexEnvError = e && e.message ? e.message : String(e);
    return null;
  }
}

const convexEnv = loadConvexEnv();

/** Variable del bundle de la app: tiene que estar en `.env.local`. */
function checkClientVar(name) {
  if (!process.env[name]) {
    console.error(`❌ [FALTA] ${name} no definida en .env.local (cliente)`);
    issues++;
  } else {
    console.log(`✅ [OK] ${name} configurada.`);
  }
}

/**
 * Al menos una de `names` tiene que estar. Sirve para las claves que el código
 * resuelve con fallback (`X_TEST ?? X`).
 */
function checkClientVarAny(names, label) {
  if (names.some((n) => process.env[n])) {
    const found = names.filter((n) => process.env[n]).join(', ');
    console.log(`✅ [OK] ${label}: ${found}`);
  } else {
    console.error(`❌ [FALTA] ${label} — ninguna de ${names.join(' / ')} en .env.local`);
    issues++;
  }
}

/** Secreto de backend: vive en el entorno de Convex, no en `.env.local`. */
function checkConvexVar(name) {
  if (convexEnv === null) {
    console.warn(`⚠️ [SIN VERIFICAR] ${name} — no se pudo leer 'npx convex env list'`);
    return;
  }
  if (!convexEnv.has(name)) {
    console.error(`❌ [FALTA] ${name} no está en el entorno de Convex (npx convex env set ${name} …)`);
    issues++;
  } else {
    console.log(`✅ [OK] ${name} configurada en Convex.`);
  }
}

console.log('--- 1. Conexión a Convex ---');
checkClientVar('EXPO_PUBLIC_CONVEX_URL');
if (!process.env.CONVEX_DEPLOYMENT) {
  console.error('❌ [FALTA] CONVEX_DEPLOYMENT no definida en .env.local (elige el deployment de trabajo)');
  issues++;
} else {
  console.log('✅ [OK] CONVEX_DEPLOYMENT configurada.');
}
if (convexEnv === null) {
  console.warn("⚠️ No se pudo ejecutar 'npx convex env list'. Los secretos de backend quedan sin verificar.");
  console.warn(`   Motivo: ${convexEnvError}`);
}

console.log('\n--- 2. Stripe ---');
checkConvexVar('STRIPE_SECRET_KEY');
checkConvexVar('STRIPE_WEBHOOK_SECRET');
// El código lee `EXPO_PUBLIC_STRIPE_KEY_TEST` / `_LIVE` con fallback a
// `EXPO_PUBLIC_STRIPE_KEY` (ver `src/contexts/PaymentModeContext.tsx`). La
// versión anterior de este script chequeaba `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
// un nombre que no lee ningún archivo del repo: daba un ✅ que no significaba nada.
checkClientVarAny(
  ['EXPO_PUBLIC_STRIPE_KEY_TEST', 'EXPO_PUBLIC_STRIPE_KEY_LIVE', 'EXPO_PUBLIC_STRIPE_KEY'],
  'Clave publicable de Stripe',
);

// Sin esta clave `notifications.sendOTP` cae a un mock de consola y la
// verificación de cuenta por email deja de enviar nada.
console.log('\n--- 3. Envío de emails (verificación de cuenta) ---');
checkConvexVar('RESEND_API_KEY');

console.log('\n--- 4. Variables Adicionales ---');
if (process.env.NODE_ENV !== 'production') {
  console.log(`⚠️ [ADVERTENCIA] NODE_ENV está en ${process.env.NODE_ENV || 'undefined'}. Para producción debería ser 'production'.`);
}

console.log('\n--- 5. Verificando Scripts en package.json ---');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!packageJson.scripts['build:prod']) {
    console.log(`⚠️ [ADVERTENCIA] No hay script 'build:prod' en package.json`);
} else {
    console.log(`✅ [OK] Script de compilación detectado.`);
}

console.log('\n=============================================');
if (issues === 0) {
  console.log('🎉 RESULTADO: El proyecto parece estar listo para Producción (a nivel entorno).');
} else {
  console.log(`🚨 RESULTADO: Se detectaron ${issues} problemas críticos. Resuélvelos antes de lanzar.`);
}
console.log('=============================================\n');
