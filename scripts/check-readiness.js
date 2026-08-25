const fs = require('fs');
const path = require('path');

// Leer variables desde .env.local de forma nativa sin dotenv
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (e) {
  console.warn('⚠️ No se encontró el archivo .env.local o hubo un error al leerlo.');
}

console.log('🔍 Iniciando Auditoría de Preparación para Producción (Production Readiness)...\n');

let issues = 0;

function checkEnvVar(name, type = 'frontend') {
  if (!process.env[name]) {
    console.error(`❌ [FALTA] Variable de entorno ${name} no definida en .env.local (${type})`);
    issues++;
  } else {
    console.log(`✅ [OK] ${name} configurada.`);
  }
}

console.log('--- 1. Verificando Variables de Entorno de Convex ---');
checkEnvVar('CONVEX_DEPLOYMENT', 'backend');
checkEnvVar('EXPO_PUBLIC_CONVEX_URL', 'frontend');

console.log('\n--- 2. Verificando Variables de Entorno de Stripe ---');
checkEnvVar('STRIPE_SECRET_KEY', 'backend');
checkEnvVar('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'frontend');
checkEnvVar('STRIPE_WEBHOOK_SECRET', 'backend');

// Sin esta clave, `notifications.sendOTP` cae a un mock de consola: la
// verificación por email deja de funcionar sin que la app dé señales claras.
// Es una falla silenciosa que bloquea el registro entero, así que corta acá.
console.log('\n--- 3. Verificando Envío de Emails (verificación de cuenta) ---');
checkEnvVar('RESEND_API_KEY', 'backend');

console.log('\n--- 4. Verificando Variables Adicionales ---');
if (process.env.NODE_ENV !== 'production') {
  console.log(`⚠️ [ADVERTENCIA] NODE_ENV está en ${process.env.NODE_ENV || 'undefined'}. Para producción debería ser 'production'.`);
}

console.log('\n--- 5. Verificando Scripts en package.json ---');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
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
