const fs = require('fs');
const path = require('path');

const srcScreensDir = path.join(__dirname, '../src/screens');

const targetFiles = [
    'AdminDashboardScreen.tsx',
    'BusinessFormsScreen.tsx',
    'BusinessKYCScreen.tsx',
    'BusinessProfileScreen.tsx',
    'BusinessQRScannerScreen.tsx',
    'BusinessDashboardScreen.tsx',
    'CartScreen.tsx',
    'InfluencerBonusesScreen.tsx',
    'InfluencerDashboardScreen.backup.tsx',
    'MapExplorerScreen.tsx',
    'CampaignManagerScreen.tsx',
    'MarketplaceScreen.tsx',
    'ProfileScreen.tsx',
    'ReferralsScreen.tsx',
    'SavedScreen.tsx',
    'SupportScreen.tsx'
];

targetFiles.forEach(fileName => {
    const filePath = path.join(srcScreensDir, fileName);
    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${fileName}, file not found.`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Agregar KeyboardAvoidingView a los imports de react-native si no está
    const rnImportMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]react-native['"]/);
    if (rnImportMatch) {
        let imports = rnImportMatch[1];
        if (!imports.includes('KeyboardAvoidingView')) {
            const newImports = imports + ', KeyboardAvoidingView';
            content = content.replace(rnImportMatch[0], `import {${newImports}} from 'react-native'`);
            modified = true;
        }
        if (!imports.includes('Platform')) {
             // Algunas pantallas no tienen Platform importado, agregarlo
             const match2 = content.match(/import\s+{([^}]+)}\s+from\s+['"]react-native['"]/);
             if (match2) {
                 const newImports2 = match2[1] + ', Platform';
                 content = content.replace(match2[0], `import {${newImports2}} from 'react-native'`);
                 modified = true;
             }
        }
    }

    // Si la pantalla NO ESTÁ envuelta a nivel de export default function (buscaremos su return)
    // Es un poco frágil, pero buscaremos la función export default.
    // Una manera más segura es buscar el inicio de la cadena `return (` que esté más cerca del final del componente o justo antes de `const getStyles`
    
    // Si ya añadimos el KeyboardAvoidingView y parece estar usándose, lo saltamos.
    // Note: BusinessFormsScreen lo tenía en un sub-método, pero lo ideal es tenerlo en la raíz.
    // Contar cuántas veces aparece KeyboardAvoidingView.
    const countKAV = (content.match(/KeyboardAvoidingView/g) || []).length;
    if (countKAV > 1) {
        console.log(`Skipping ${fileName}, already seems to have KeyboardAvoidingView in JSX.`);
        return;
    }

    // Find the main return by looking backwards from `const getStyles` or the end of the default export
    const getStylesIndex = content.indexOf('const getStyles');
    if (getStylesIndex !== -1) {
        const textBeforeStyles = content.substring(0, getStylesIndex);
        const lastReturnIndex = textBeforeStyles.lastIndexOf('return (');
        
        if (lastReturnIndex !== -1) {
            // Found the main return
            // Replace `return (` with `return ( <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>`
            
            // And we need to find the matching closing parenthesis or just insert the closing tag right before the end of the function `};` which is right before `const getStyles`.
            // Actually, finding the closing tag in JSX with regex is hard.
            // Let's replace the outer container manually, or just skip and we'll do it manually if this fails.
        }
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated imports for ${fileName}`);
    }
});
