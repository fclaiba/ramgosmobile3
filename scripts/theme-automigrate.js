const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');

// ---------------------------------------------------------------------------
// CONFIGURATION: Color Mappings
// ---------------------------------------------------------------------------
// These replacements are applied ONLY inside the getStyles function or inline styles
const COLOR_MAP = [
    // Backgrounds
    { regex: /['"]#ffffff['"]/gi, dark: "'#1F2937'", light: "'#ffffff'" },
    { regex: /['"]#fff['"]/gi, dark: "'#1F2937'", light: "'#fff'" },
    { regex: /['"]white['"]/gi, dark: "'#1F2937'", light: "'white'" },
    { regex: /['"]#FAFAFA['"]/gi, dark: "'#111827'", light: "'#FAFAFA'" },
    { regex: /['"]#f9f9f9['"]/gi, dark: "'#111827'", light: "'#f9f9f9'" },
    { regex: /['"]#F3F4F6['"]/gi, dark: "'#1F2937'", light: "'#F3F4F6'" }, // Gray-100 -> Gray-800
    { regex: /['"]#F0F0F0['"]/gi, dark: "'#374151'", light: "'#F0F0F0'" },

    // Text
    { regex: /['"]#000000['"]/gi, dark: "'#F9FAFB'", light: "'#000000'" },
    { regex: /['"]#000['"]/gi, dark: "'#F9FAFB'", light: "'#000'" },
    { regex: /['"]black['"]/gi, dark: "'#F9FAFB'", light: "'black'" },
    // Removed #111827 and #1F2937 to prevent recursion with background targets
    { regex: /['"]#374151['"]/gi, dark: "'#D1D5DB'", light: "'#374151'" }, // Gray-700 -> Gray-300
    { regex: /['"]#4B5563['"]/gi, dark: "'#9CA3AF'", light: "'#4B5563'" }, // Gray-600 -> Gray-400
    { regex: /['"]#6B7280['"]/gi, dark: "'#9CA3AF'", light: "'#6B7280'" }, // Gray-500 -> Gray-400
    { regex: /['"]#9CA3AF['"]/gi, dark: "'#6B7280'", light: "'#9CA3AF'" }, // Gray-400 -> Gray-500
    { regex: /['"]#333['"]/gi, dark: "'#F9FAFB'", light: "'#333'" },
    { regex: /['"]#666['"]/gi, dark: "'#9CA3AF'", light: "'#666'" },
    { regex: /['"]#999['"]/gi, dark: "'#6B7280'", light: "'#999'" },

    // Borders
    { regex: /['"]#e5e7eb['"]/gi, dark: "'#374151'", light: "'#e5e7eb'" },
    { regex: /['"]#ccc['"]/gi, dark: "'#4B5563'", light: "'#ccc'" },
];

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });
    return arrayOfFiles;
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    const filename = path.basename(filePath);

    // Skip excluded files
    if (filename === 'ThemeContext.tsx' || filename.includes('navigation')) return;

    // SAFETY CHECK: If the file already uses getStyles, SKIP IT to prevent double-processing.
    // This assumes existing getStyles implementations are correct or manually managed.
    if (content.includes('const getStyles =') || content.includes('const getStyles=')) {
        console.log(`[SKIPPED] ${filename} (Already has getStyles)`);
        return;
    }

    let modified = false;

    // ---------------------------------------------------------
    // STEP 1: Ensure Imports
    // ---------------------------------------------------------
    if ((content.includes('StyleSheet') || content.includes('style=')) && !content.includes('useTheme')) {
        // Find path
        const fileDir = path.dirname(filePath);
        const contextPath = path.join(SRC_DIR, 'contexts/ThemeContext');
        let relativePath = path.relative(fileDir, contextPath).replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

        const importStmt = `import { useTheme } from '${relativePath}';`;

        // Insert
        const lastImportIdx = content.lastIndexOf('import ');
        if (lastImportIdx !== -1) {
            const endOfImport = content.indexOf('\n', lastImportIdx);
            content = content.slice(0, endOfImport + 1) + importStmt + '\n' + content.slice(endOfImport + 1);
            modified = true;
        } else {
            content = importStmt + '\n' + content;
            modified = true;
        }
    }

    // ---------------------------------------------------------
    // STEP 2: Convert Static StyleSheet to Dynamic getStyles
    // ---------------------------------------------------------
    // Finds: const styles = StyleSheet.create({...})
    // NOTE: We only target 'const styles' for now to be safe.
    const staticStyleRegex = /const\s+styles\s*=\s*StyleSheet\.create\s*\(/;

    if (staticStyleRegex.test(content)) {
        console.log(`[CONVERT LISTED] ${filename}`);
        // Replace definition
        content = content.replace(staticStyleRegex, 'const getStyles = (isDark: any) => StyleSheet.create(');
        modified = true;
    }

    // ---------------------------------------------------------
    // STEP 3: Inject Hook and Styles Call
    // ---------------------------------------------------------
    // We look for the component body start
    const compRegex = /(export\s+(?:default\s+)?(?:function\s+\w+|const\s+\w+\s*=\s*)\s*(?:<[^>]+>)?\s*\([^)]*\)\s*(?:=>\s*)?{)/g;
    let match;
    let hookInjected = false;

    // Use loop to find the main component (heuristic: largest one or first export)
    // We'll simplisticly try to inject in the first exported function/const component
    if ((match = compRegex.exec(content)) !== null) {
        const insertionPoint = match.index + match[0].length;

        // Check if already injected
        const componentBody = content.slice(insertionPoint, insertionPoint + 500); // Look ahead
        if (!componentBody.includes('useTheme()')) {
            const injection = `\n    const { colorScheme } = useTheme();\n    const isDark = colorScheme === 'dark';\n    const styles = getStyles(isDark);`;

            // Special check: Does getStyles exist?
            if (content.includes('const getStyles') || modified) {
                // Check if 'styles' is used in the file
                if (content.includes('styles.')) {
                    content = content.slice(0, insertionPoint) + injection + content.slice(insertionPoint);
                    modified = true;
                    hookInjected = true;
                } else {
                    // Inject hook only if no styles used? useful for inline isDark checks
                    const injectionNoStyles = `\n    const { colorScheme } = useTheme();\n    const isDark = colorScheme === 'dark';`;
                    content = content.slice(0, insertionPoint) + injectionNoStyles + content.slice(insertionPoint);
                    modified = true;
                    hookInjected = true;
                }
            }
        }
    }

    // ---------------------------------------------------------
    // STEP 4: Apply Color Replacements (SAFELY)
    // ---------------------------------------------------------
    // We only perform replacements inside the `getStyles` function to avoid global scope errors.

    // Find the getStyles block
    const getStylesRegex = /const\s+getStyles\s*=\s*\(isDark:\s*any\)\s*=>\s*StyleSheet\.create\s*\(([\s\S]*?)\)\s*;/; // Assumes ends with );

    if (content.includes('const getStyles = (isDark: any) => StyleSheet.create')) {
        // We can safely assume `isDark` is available inside this block

        // Best approach: Extract the StyleSheet block, replace, re-insert.
        const startToken = 'const getStyles = (isDark: any) => StyleSheet.create(';
        const startIdx = content.indexOf(startToken);

        if (startIdx !== -1) {
            // Find end of block (counting braces/parens is reliable)
            let openParens = 1; // We passed one '('
            let cursor = startIdx + startToken.length;
            let endIdx = -1;

            while (cursor < content.length) {
                if (content[cursor] === '(') openParens++;
                if (content[cursor] === ')') openParens--;
                if (openParens === 0) {
                    endIdx = cursor;
                    break;
                }
                cursor++;
            }

            if (endIdx !== -1) {
                let styleBlock = content.slice(startIdx, endIdx);
                const originalStyleBlock = styleBlock;

                // Apply replacers
                COLOR_MAP.forEach(map => {
                    if (map.regex.test(styleBlock)) {
                        styleBlock = styleBlock.replace(map.regex, (match) => {
                            // double check it's not already part of a ternary
                            // This is minimal heuristics
                            return `isDark ? ${map.dark} : ${map.light}`;
                        });
                    }
                });

                if (styleBlock !== originalStyleBlock) {
                    content = content.slice(0, startIdx) + styleBlock + content.slice(endIdx);
                    modified = true;
                    console.log(`  [STYLES UPDATED] ${filename}`);
                }
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[SAVED] ${filename}`);
    }
}

console.log('Starting SAFER Global Theme Automation...');
const files = getAllFiles(SRC_DIR);
files.forEach(f => {
    try {
        processFile(f);
    } catch (e) {
        console.error(`ERROR processing ${f}:`, e.message);
    }
});
console.log('Done.');
