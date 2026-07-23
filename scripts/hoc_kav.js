const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/screens');

const targetFiles = [
    'business/BusinessKYCScreen.tsx',
    'business/BusinessProfileScreen.tsx',
    'business/BusinessQRScannerScreen.tsx',
    'business/BusinessDashboardScreen.tsx',
    'CartScreen.tsx',
    'InfluencerBonusesScreen.tsx',
    'InfluencerDashboardScreen.backup.tsx',
    'MapExplorerScreen.tsx',
    'marketing/CampaignManagerScreen.tsx',
    'MarketplaceScreen.tsx',
    'ProfileScreen.tsx',
    'ReferralsScreen.tsx',
    'SavedScreen.tsx',
    'SupportScreen.tsx'
];

targetFiles.forEach(relPath => {
    // Si no es un subdirectorio, busco a ver si es en la raíz
    let filePath = path.join(srcDir, relPath);
    if (!fs.existsSync(filePath)) {
        filePath = path.join(srcDir, path.basename(relPath)); // fallback a la raíz
    }
    if (!fs.existsSync(filePath)) {
        console.log(`[Error] No se encontró: ${relPath}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Revisar si ya fue envuelto
    if (content.includes('const HOC_KeyboardAvoidingView_')) {
        console.log(`[Skip] Ya fue envuelto: ${relPath}`);
        return;
    }

    // Buscar "export default function NombreDeLaPantalla"
    const exportMatch = content.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(/);
    if (!exportMatch) {
        console.log(`[Skip] No se encontró export default function en: ${relPath}`);
        return;
    }

    const screenName = exportMatch[1];

    // Reemplazar "export default function ScreenName(" por "function ScreenName("
    content = content.replace(exportMatch[0], `function ${screenName}(`);

    // Inyectar el HOC al final del archivo
    const hocCode = `\n// HOC inyectado automáticamente para soporte de teclado
const HOC_KeyboardAvoidingView_${screenName} = (props: any) => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <${screenName} {...props} />
    </KeyboardAvoidingView>
);
export default HOC_KeyboardAvoidingView_${screenName};\n`;

    content += hocCode;

    // Asegurarse de tener KeyboardAvoidingView y Platform importados
    const rnImportMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]react-native['"]/);
    if (rnImportMatch) {
        let imports = rnImportMatch[1];
        let changedImports = false;
        if (!imports.includes('KeyboardAvoidingView')) {
            imports += ', KeyboardAvoidingView';
            changedImports = true;
        }
        if (!imports.includes('Platform')) {
            imports += ', Platform';
            changedImports = true;
        }
        if (changedImports) {
            content = content.replace(rnImportMatch[0], `import {${imports}} from 'react-native'`);
        }
    } else {
        // No hay import de react-native, se lo ponemos arriba
        content = `import { KeyboardAvoidingView, Platform } from 'react-native';\n` + content;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[OK] HOC inyectado en: ${relPath}`);
});
