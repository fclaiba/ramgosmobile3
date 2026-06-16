const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, 'src');
const convexDir = path.join(projectRoot, 'convex');

const results = {
    todos: [],
    fixmes: [],
    mocks: [],
    emptyFiles: [],
    largeFiles: []
};

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.expo' || file === '.git') continue;
            walkDir(filePath);
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                
                if (lines.length < 5 && content.trim() === '') {
                    results.emptyFiles.push(filePath);
                }
                if (lines.length > 500) {
                    results.largeFiles.push({ file: filePath, lines: lines.length });
                }
                
                lines.forEach((line, index) => {
                    if (line.includes('TODO')) results.todos.push(`${filePath}:${index + 1} - ${line.trim()}`);
                    if (line.includes('FIXME')) results.fixmes.push(`${filePath}:${index + 1} - ${line.trim()}`);
                    if (line.toLowerCase().includes('mock') && !filePath.includes('mock')) results.mocks.push(`${filePath}:${index + 1}`);
                });
            }
        }
    }
}

console.log('🔍 Iniciando auditoría del proyecto...');

console.log('\n📁 Escaneando archivos en /src y /convex...');
walkDir(srcDir);
walkDir(convexDir);

console.log(`\n📌 RESULTADOS DE LA AUDITORÍA:`);
console.log(`==============================`);
console.log(`\n📝 Tareas Pendientes (TODOs): ${results.todos.length}`);
if (results.todos.length > 0) {
    results.todos.slice(0, 10).forEach(t => console.log(`   - ${t}`));
    if (results.todos.length > 10) console.log(`   ... y ${results.todos.length - 10} más.`);
}

console.log(`\n⚠️ Problemas a arreglar (FIXMEs): ${results.fixmes.length}`);
if (results.fixmes.length > 0) {
    results.fixmes.slice(0, 10).forEach(t => console.log(`   - ${t}`));
}

console.log(`\n🏗️ Archivos con datos simulados (Mocks): ${results.mocks.length}`);
console.log(`   (Estas áreas probablemente necesitan conectarse al backend)`);

console.log(`\n📄 Archivos muy grandes (>500 líneas): ${results.largeFiles.length}`);
results.largeFiles.sort((a,b) => b.lines - a.lines).slice(0, 5).forEach(f => {
    console.log(`   - ${f.file.split('\\').pop()} (${f.lines} líneas)`);
});

console.log(`\n🛠️ Ejecutando validación de TypeScript (puede tardar un momento)...`);
try {
    const tsResult = execSync('npx tsc --noEmit', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(`✅ TypeScript compila sin errores críticos.`);
} catch (error) {
    const errorLines = error.stdout ? error.stdout.split('\n').filter(l => l.includes('error TS')).length : 'Varios';
    console.log(`❌ Se encontraron ${errorLines} errores de TypeScript. (Falta tipar variables o hay desajustes de tipos).`);
}

console.log('\n🔎 Ejecutando auditoría de paquetes npm (depcheck)...');
try {
    const depResult = execSync('npx depcheck', { encoding: 'utf-8', stdio: 'pipe' });
    console.log(depResult);
} catch (error) {
    if (error.stdout) {
        const lines = error.stdout.split('\n');
        const missing = lines.filter(l => l.includes('Missing dependencies')).length > 0;
        const unused = lines.filter(l => l.includes('Unused dependencies')).length > 0;
        
        if (missing || unused) {
            console.log(`⚠️ Hay paquetes sin usar o dependencias faltantes en package.json.`);
        } else {
            console.log(error.stdout.substring(0, 500));
        }
    } else {
        console.log(`No se pudo ejecutar depcheck.`);
    }
}

console.log('\n✅ Auditoría finalizada.');
