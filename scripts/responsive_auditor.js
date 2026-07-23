const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const BAD_WIDTH_REGEX = /width:\s*([2-9]\d{2}|1\d{3})(?!%|\s*\||\s*px)/g;
const BAD_HEIGHT_REGEX = /height:\s*([4-9]\d{2}|1\d{3})(?!%|\s*\||\s*px)/g;

let issuesFound = 0;
let fixCount = 0;
const isFixMode = process.argv.includes('--fix');

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            scanDirectory(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx')) {
            processFile(fullPath);
        }
    });
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Detectar si no usa KeyboardAvoidingView en pantallas (src/screens)
    const isScreen = filePath.includes('Screen') && !filePath.includes('components');
    if (isScreen && content.includes('TextInput') && !content.includes('KeyboardAvoidingView')) {
        console.warn(`\x1b[33m[Warning]\x1b[0m ${path.basename(filePath)} usa TextInput pero no está envuelto en KeyboardAvoidingView.`);
        issuesFound++;
    }

    // Buscar anchos estáticos grandes (ej. width: 350)
    let match;
    while ((match = BAD_WIDTH_REGEX.exec(content)) !== null) {
        const value = parseInt(match[1]);
        if (value > 200 && value < 2000) { // Ignorar width chicos
            console.log(`\x1b[31m[Static Width]\x1b[0m ${path.basename(filePath)} - width: ${value}`);
            issuesFound++;
            
            if (isFixMode) {
                // Reemplazar width: X por width: '100%', maxWidth: X
                content = content.replace(new RegExp(`width:\\s*${value}(?!%|px)`), `width: '100%', maxWidth: ${value}`);
                modified = true;
                fixCount++;
            }
        }
    }

    // Buscar alturas estáticas grandes (ej. height: 800)
    while ((match = BAD_HEIGHT_REGEX.exec(content)) !== null) {
        const value = parseInt(match[1]);
        if (value > 400 && value < 2000) { 
            console.log(`\x1b[31m[Static Height]\x1b[0m ${path.basename(filePath)} - height: ${value}`);
            issuesFound++;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

console.log("Iniciando auditoría de layouts Responsive (Liquid Glass)...");
if (isFixMode) console.log("Modo FIX activado: Se intentarán reemplazar anchos estáticos por combinaciones width/maxWidth.");

scanDirectory(SRC_DIR);

console.log("-----------------------------------------");
console.log(`Auditoría finalizada. Problemas detectados: ${issuesFound}`);
if (isFixMode) {
    console.log(`Correcciones aplicadas: ${fixCount}`);
}

if (issuesFound > 0 && !isFixMode) {
    console.log("\x1b[36mTip: Puedes ejecutar 'node scripts/responsive_auditor.js --fix' para intentar autocorregir los anchos estáticos.\x1b[0m");
    process.exit(1);
}
