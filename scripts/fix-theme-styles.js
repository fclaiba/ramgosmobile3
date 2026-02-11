const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');

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

    // Check if StyleSheet uses isDark
    // We look for 'const styles = StyleSheet.create' and see if 'isDark' appears after it until the end of the block? 
    // Simplified check: if file has 'const styles = StyleSheet.create' AND 'isDark' is used inside that block.

    // We can assume if 'isDark' is used in the file, and 'const styles = StyleSheet.create' exists, we should check if they overlap.
    // A simple heuristic: if 'isDark' appears after 'const styles = StyleSheet.create', it's likely inside it (since styles are usually at bottom).

    const styleDefRegex = /const\s+styles\s*=\s*StyleSheet\.create/g;
    const match = styleDefRegex.exec(content);

    if (!match) return; // No styles defined this way

    const styleStartIndex = match.index;
    const styleContent = content.substring(styleStartIndex);

    // Check if isDark is used in the styles part
    if (!styleContent.includes('isDark')) return;

    console.log(`Fixing styles in: ${path.relative(SRC_DIR, filePath)}`);

    // 1. Rename and wrap StyleSheet
    // Replace "const styles = StyleSheet.create" with "const getStyles = (isDark: any) => StyleSheet.create"
    content = content.replace(
        /const\s+styles\s*=\s*StyleSheet\.create/,
        'const getStyles = (isDark: any) => StyleSheet.create'
    );

    // 2. Inject usage inside component
    // We look for where `const isDark` is defined (which we injected earlier) and add `const styles = getStyles(isDark);` after it.

    const hookRegex = /(const\s+isDark\s*=\s*[^;]+;)/;
    if (hookRegex.test(content)) {
        // Only inject if not already there (idempotency)
        if (!content.includes('const styles = getStyles(isDark)')) {
            content = content.replace(hookRegex, '$1\n    const styles = getStyles(isDark);');
        }
    } else {
        console.warn(`  [WARN] Could not find 'const isDark' to inject styles call in ${path.basename(filePath)}`);
    }

    // 3. Need to wrap with useMemo? 
    // For now, simple function call is fine. Performance impact is minimal for these screens. 
    // If we wanted useMemo: `const styles = useMemo(() => getStyles(isDark), [isDark]);` (need to ensure useMemo is imported).
    // Let's stick to simple call to avoid import/syntax complexity.

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  [OK] Fixed ${path.basename(filePath)}`);
    }
}

console.log('Starting StyleSheet Fix...');
const files = getAllFiles(SRC_DIR);
files.forEach(file => {
    try {
        processFile(file);
    } catch (e) {
        console.error(`  [ERR] Failed to fix ${file}:`, e.message);
    }
});
console.log('StyleSheet Fix Complete.');
