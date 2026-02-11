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

function repairFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(SRC_DIR, filePath);
    let modified = false;

    // CASE 1: StyleSheet uses isDark but is NOT wrapped in a function
    // We look for 'const [anything] = StyleSheet.create'
    // Regex to capture variable name
    const styleDefRegex = /const\s+(\w+)\s*=\s*StyleSheet\.create/g;
    let match;

    // We collect all matches first to avoid infinite loop if we modify content while iterating? 
    // Actually regex exec on changing content is risky. 
    // Let's assume one StyleSheet per file for now, or use loop with break if modification happens (and re-run script).
    // Or just store replacements.

    // Better: Find ALL 'const ... = StyleSheet.create' in the original content.
    const matches = [];
    while ((match = styleDefRegex.exec(content)) !== null) {
        matches.push({
            varName: match[1],
            index: match.index,
            fullMatch: match[0]
        });
    }

    // Process matched in reverse order to preserve indices? No, we use replace which handles string searching.
    // Iterating.
    for (const m of matches) {
        const varName = m.varName;
        // Check if this StyleSheet block uses isDark
        // Heuristic: check lines after this match.
        // We can split content by this match.
        const remaining = content.substring(m.index);

        // Check if this variable is already wrapped (e.g. const getStyles = ...). 
        // The regex `const varName =` implies it is NOT a function arrow.

        if (remaining.includes('isDark')) {
            if (/:\s*isDark\s*\?/.test(remaining) || /color:\s*isDark\s*\?/.test(remaining)) {
                console.log(`[FIXING_NAMED_STYLE] ${relPath} -> ${varName}`);

                // 1. Rename 'const V = StyleSheet.create' -> 'const getV = (isDark: any) => StyleSheet.create'
                // Use exact string replacement for safety
                const originalDef = `const ${varName} = StyleSheet.create`;
                const newFuncName = `get${varName.charAt(0).toUpperCase() + varName.slice(1)}`;
                const newDef = `const ${newFuncName} = (isDark: any) => StyleSheet.create`;

                if (content.includes(originalDef)) {
                    content = content.replace(originalDef, newDef);

                    // 2. Inject usage: 'const V = getV(isDark);'
                    const injection = `const ${varName} = ${newFuncName}(isDark);`;

                    const hookRegex = /(const\s+isDark\s*=\s*[^;]+;)/;
                    if (hookRegex.test(content)) {
                        // Check if already injected
                        if (!content.includes(injection)) {
                            content = content.replace(hookRegex, `$1\n    ${injection}`);
                        }
                    } else {
                        // Try finding useTheme
                        const themeHookRegex = /(const\s+\{\s*colorScheme\s*\}\s*=\s*useTheme\(\);)/;
                        if (themeHookRegex.test(content)) {
                            if (!content.includes(injection)) {
                                content = content.replace(themeHookRegex, `$1\n    const isDark = colorScheme === 'dark';\n    ${injection}`);
                            }
                        }
                    }
                    modified = true;
                }
            }
        }
    }

    // CASE 2: getStyles exists, but 'const styles =' is missing (Legacy check for 'styles')
    if (content.includes('const getStyles') && !content.includes('const styles = getStyles(isDark)')) {
        // Only if 'styles' is actually used in the file?
        if (content.includes('style={styles.') || content.includes('style={[styles.')) {
            console.log(`[FIXING_MISSING_VAR] ${relPath}`);
            const hookRegex = /(const\s+isDark\s*=\s*[^;]+;)/;
            if (hookRegex.test(content)) {
                content = content.replace(hookRegex, '$1\n    const styles = getStyles(isDark);');
                modified = true;
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`  [SAVED] ${relPath}`);
    }
}

console.log('Starting Named Repair Job...');
const files = getAllFiles(SRC_DIR);
files.forEach(f => repairFile(f));
console.log('Named Repair Job Complete.');
