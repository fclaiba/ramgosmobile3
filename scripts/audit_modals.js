const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', 'src');
const IGNORE_DIRS = ['node_modules', '.git', 'assets', 'constants', 'types', 'services', 'hooks'];
const IGNORE_FILES = ['.DS_Store', 'audit_modals.js'];

const METRICS = {
    totalFiles: 0,
    legacyAlerts: [],
    nativeModals: [],
    modernToasts: [],
    glassmorphicModals: []
};

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(PROJECT_ROOT, filePath);

    METRICS.totalFiles++;

    // 1. Check for Legacy Alerts (Alert.alert)
    if (content.includes('Alert.alert(')) {
        METRICS.legacyAlerts.push(relativePath);
    }

    // 2. Check for Native Modals (import { Modal } ...)
    // simplistic regex, might catch partials but good enough for audit
    if (/import.*Modal.*from ['"]react-native['"]/.test(content) || /<Modal/.test(content)) {
        // Filter out if it's just importing 'Modal' but actually using a custom wrapper named the same?
        // Usually safe to assume <Modal is native if imported from RN.
        // Let's check pure usage of <Modal
        if (content.includes('<Modal')) {
            METRICS.nativeModals.push(relativePath);
        }
    }

    // 3. Check for Modern Toasts (useToast)
    if (content.includes('useToast()') || content.includes('from \'../contexts/ToastContext\'')) {
        METRICS.modernToasts.push(relativePath);
    }

    // 4. Check for Premium/Glassmorphism design (BlurView) inside typical Modal files
    if (content.includes('BlurView') || content.includes('LinearGradient')) {
        METRICS.glassmorphicModals.push(relativePath);
    }
}

function traverseDir(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        if (IGNORE_FILES.includes(file)) return;

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                traverseDir(fullPath);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js')) {
            scanFile(fullPath);
        }
    });
}

console.log('🔍 Iniciando escaneo de Modals y Alertas en SRC...\n');
traverseDir(PROJECT_ROOT);

const report = [];
report.push('--------------------------------------------------');
report.push(`📂 Archivos Escaneados: ${METRICS.totalFiles}`);
report.push('--------------------------------------------------');

report.push(`\n🔴 [LEGACY] Archivos usando Native Alert (${METRICS.legacyAlerts.length}):`);
if (METRICS.legacyAlerts.length > 0) {
    METRICS.legacyAlerts.forEach(f => report.push(`   - ${f}`));
    report.push(`   👉 ACCIÓN: Migrar a useToast().show()`);
} else {
    report.push('   ✅ ¡Ninguno! Todo migrado.');
}

report.push(`\n🟡 [REVIEW] Archivos usando Native <Modal> (${METRICS.nativeModals.length}):`);
METRICS.nativeModals.forEach(f => {
    const isModern = METRICS.glassmorphicModals.some(m => m === f);
    const tag = isModern ? "✨ (Tiene diseño Premium)" : "⚠️ (Revisar diseño)";
    report.push(`   - ${f} ${tag}`);
});

report.push(`\n🟢 [MODERN] Archivos usando Global Toast System (${METRICS.modernToasts.length}):`);
METRICS.modernToasts.slice(0, 5).forEach(f => report.push(`   - ${f}`));
if (METRICS.modernToasts.length > 5) report.push(`   ...y ${METRICS.modernToasts.length - 5} más.`);

report.push('\n--------------------------------------------------');
const pendingWork = METRICS.legacyAlerts.length;
if (pendingWork === 0) {
    report.push('🎉 ¡EXCELENTE! No quedan alertas nativas por migrar.');
} else {
    report.push(`🛠️ Tarea pendiente: Tienes ${pendingWork} archivos que aún usan alertas nativas.`);
}
report.push('--------------------------------------------------');

const finalReport = report.join('\n');
console.log(finalReport);
fs.writeFileSync('audit_results.txt', finalReport, 'utf8');

