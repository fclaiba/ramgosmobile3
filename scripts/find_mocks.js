const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

// Patrones de búsqueda (Regex) para detectar posibles mocks y datos hardcodeados
const patterns = [
    { name: 'mock|dummy|fake|simulated', regex: /(mock|dummy|fake|simulat)/i },
    { name: 'hardcode|TODO', regex: /(hardcode|TODO)/i },
    { name: 'Variables de prueba comunes', regex: /(const|let|var)\s+(mock[A-Z]|test[A-Z]|dummy[A-Z])/ },
    { name: 'Arreglos estáticos sospechosos', regex: /const\s+[a-zA-Z0-9_]+\s*=\s*\[\s*{\s*[a-zA-Z0-9_]+\s*:/ },
];

let totalMocks = 0;
let results = {};

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            scanDirectory(fullPath);
        } else if (/\.(tsx|ts|js|jsx)$/.test(file)) {
            // Excluir archivos de test
            if (fullPath.includes('__tests__') || file.includes('.test.')) {
                return;
            }
            scanFile(fullPath);
        }
    });
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let fileReported = false;

    lines.forEach((line, index) => {
        for (const pattern of patterns) {
            if (pattern.regex.test(line)) {
                if (!fileReported) {
                    results[filePath] = [];
                    fileReported = true;
                }
                results[filePath].push({
                    line: index + 1,
                    pattern: pattern.name,
                    content: line.trim()
                });
                totalMocks++;
                break; // Una vez detectado en esta línea, pasar a la siguiente
            }
        }
    });
}

console.log('🕵️ Iniciando escaneo de mocks y datos hardcodeados en /src...');
scanDirectory(srcDir);

console.log('\n📊 === REPORTE DE DATOS MOCKEADOS ===\n');

if (Object.keys(results).length === 0) {
    console.log('¡No se encontraron datos hardcodeados ni mocks!');
} else {
    for (const [filePath, matches] of Object.entries(results)) {
        const relativePath = path.relative(path.join(__dirname, '..'), filePath);
        console.log(`\n📂 Archivo: ${relativePath}`);
        matches.forEach(match => {
            console.log(`   Línea ${match.line} [${match.pattern}]: ${match.content.substring(0, 80)}${match.content.length > 80 ? '...' : ''}`);
        });
    }
    console.log(`\n⚠️ Se encontraron ${totalMocks} posibles instancias de datos mockeados en ${Object.keys(results).length} archivos.`);
}
