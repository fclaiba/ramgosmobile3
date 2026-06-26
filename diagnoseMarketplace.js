const fs = require('fs');
const path = require('path');

console.log("=== Diagnóstico de Productos en Marketplace ===");

// 1. Check if files exist
const getFeedPath = path.join(__dirname, 'convex', 'listings.ts');
if (!fs.existsSync(getFeedPath)) {
    console.error("❌ No se encontró convex/listings.ts");
    process.exit(1);
}

// 2. Scan frontend for api usages
console.log("\n[1] Escaneando frontend por llamadas API inválidas (causa de FunctionPathNotFound)...");
const srcPath = path.join(__dirname, 'src');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

const frontendFiles = getAllFiles(srcPath);
const apiRegex = /api\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g;
const usedApis = new Set();

frontendFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    while ((match = apiRegex.exec(content)) !== null) {
        usedApis.add(`${match[1]}.${match[2]}`);
    }
});

let missingApis = 0;
usedApis.forEach(apiCall => {
    const [moduleName, functionName] = apiCall.split('.');
    const modulePath = path.join(__dirname, 'convex', `${moduleName}.ts`);
    if (!fs.existsSync(modulePath)) {
        console.log(`❌ ERROR: Frontend usa api.${moduleName}.${functionName} pero el archivo convex/${moduleName}.ts NO EXISTE.`);
        missingApis++;
    } else {
        const content = fs.readFileSync(modulePath, 'utf-8');
        if (!content.includes(`export const ${functionName}`)) {
            console.log(`❌ ERROR: Frontend usa api.${moduleName}.${functionName} pero la función NO ESTÁ EXPORTADA en convex/${moduleName}.ts.`);
            missingApis++;
        }
    }
});

if (missingApis === 0) {
    console.log("✅ Todas las llamadas API del frontend existen en el backend.");
} else {
    console.log(`⚠️ Se encontraron ${missingApis} funciones faltantes. Esto causa el error 'FunctionPathNotFound' y hace que el frontend se desconecte en un bucle infinito, ocultando los productos.`);
}

console.log("\n[2] Verificando filtro de distancia en MarketplaceScreen.tsx...");
const screenPath = path.join(__dirname, 'src', 'screens', 'MarketplaceScreen.tsx');
if (fs.existsSync(screenPath)) {
    const content = fs.readFileSync(screenPath, 'utf-8');
    const radiusMatch = content.match(/useState<number>\((\d+)\)/);
    if (radiusMatch) {
        console.log(`ℹ️ El radio de búsqueda actual es de ${radiusMatch[1]} km.`);
        if (parseInt(radiusMatch[1]) < 10000) {
            console.log("⚠️ ADVERTENCIA: El radio es menor a 10000 km. Los productos de prueba en Nueva York no se mostrarán si el usuario está en Buenos Aires.");
        } else {
            console.log("✅ El radio es suficientemente grande para mostrar productos de prueba internacionales.");
        }
    }
}

console.log("\n[3] Conclusión:");
console.log("Para que los productos aparezcan, debe cumplirse lo siguiente:");
console.log("1. Las funciones API faltantes deben ser creadas o eliminadas del frontend, porque si Convex no las encuentra, cierra la conexión (FunctionPathNotFound) y la app NUNCA descarga los productos.");
console.log("2. El radio de búsqueda en MarketplaceScreen.tsx debe ser alto (ya lo cambié a 20000km).");
console.log("3. Los productos deben tener un 'sellerId' válido (ya ejecuté un script que arregló 109 productos).");
