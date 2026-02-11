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

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(SRC_DIR, filePath);

    // 1. Check for unwrapped isDark in StyleSheet
    if (content.includes('StyleSheet.create') && !content.includes('const getStyles')) {
        // Simple heuristic: does 'isDark' appear after 'StyleSheet.create'?
        const parts = content.split('StyleSheet.create');
        if (parts.length > 1) {
            const styleBody = parts[1];
            // Naive: check if isDark is in the first 500 chars after create? 
            // Better: just check if isDark exists in the file at all? 
            // If theme-automigrate ran, isDark should be everywhere.
            // If getStyles is missing, but isDark is used in styles?

            // Let's assume if 'isDark ?' exists in the file, and getStyles is missing, it MIGHT be broken if that usage is inside StyleSheet.
            const styleUsageRegex = /:\s*isDark\s*\?/;
            if (styleUsageRegex.test(styleBody)) {
                console.log(`[BROKEN_STYLES] ${relPath}: Uses 'isDark' in StyleSheet but has no 'getStyles' wrapper.`);
                return;
            }
        }
    }

    // 2. Check for missing 'const styles = ' definition
    // If getStyles IS defined, did we inject the local variable?
    if (content.includes('const getStyles')) {
        if (!content.includes('const styles = getStyles(isDark)')) {
            // It might be named differently? or using hook directly?
            // But my previous script used exactly 'const styles = getStyles(isDark)'.
            console.log(`[MISSING_STYLES_VAR] ${relPath}: Has 'getStyles' but missing 'const styles = getStyles(isDark)' call.`);
        }
    }
}

console.log('Scanning for broken files...');
const files = getAllFiles(SRC_DIR);
files.forEach(f => checkFile(f));
console.log('Scan complete.');
