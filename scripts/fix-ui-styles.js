const fs = require('fs');
const path = require('path');

const filesToFix = [
    'src/components/NativeMap.web.tsx',
    'src/components/stripe/StripePaymentModal.tsx',
    'src/components/ui/avatar.tsx',
    'src/components/ui/card.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/separator.tsx',
    'src/components/ui/sheet.tsx',
    'src/components/ui/sidebar.tsx',
    'src/components/ui/skeleton.tsx',
    'src/components/ui/tabs.tsx',
    'src/contexts/ToastContext.tsx'
];

filesToFix.forEach(relPath => {
    const filePath = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // ToastContext special fix
    if (relPath.includes('ToastContext')) {
        content = content.replace('const styles = getStyles(isDark);', '');
        modified = true;
    }

    // StripePaymentModal
    if (relPath.includes('StripePaymentModal')) {
        if (!content.includes('const styles = getStyles(isDark)')) {
            content = content.replace('const { colorScheme } = useTheme();', 'const { colorScheme } = useTheme();\n    const isDark = colorScheme === \'dark\';\n    const styles = getStyles(isDark);');
            modified = true;
        }
    }

    // NativeMap.web
    if (relPath.includes('NativeMap.web')) {
        if (!content.includes('const styles = getStyles(isDark)')) {
            content = content.replace('const MapView = (props: any) => {', 'const MapView = (props: any) => {\n    const { colorScheme } = useTheme();\n    const isDark = colorScheme === \'dark\';\n    const styles = getStyles(isDark);');
            modified = true;
        }
    }

    // UI components: replace `export const ComponentName = (...) => (` with `{` and inject styles
    // Or replace `export const ComponentName = (...) => {`
    // It's a bit tricky with Regex.
    
    const componentRegex = /export const (\w+) = \(([^)]*)\) => (\(|<)/g;
    content = content.replace(componentRegex, (match, name, props, openBracket) => {
        modified = true;
        return `export const ${name} = (${props}) => {\n    const { colorScheme } = useTheme();\n    const isDark = colorScheme === 'dark';\n    const styles = getStyles(isDark);\n    return ${openBracket}`;
    });

    // Close the ones that were converted from implicit return to explicit return
    // Since we replaced `=> (` with `=> {\n return (` we need to replace the corresponding `);` with `);\n};`
    // Actually, doing this with regex for balancing parentheses is impossible.
    // It's safer to just run an ESLint fix or do it manually.
});
console.log('Script dry run completed');
