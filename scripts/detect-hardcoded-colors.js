const fs = require('fs');
const path = require('path');

const DIRECTORIES_TO_SCAN = ['src', 'App.tsx'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.expo'];

// Regex to find colors
const HEX_REGEX = /#(?:[0-9a-fA-F]{3}){1,2}(?![0-9a-fA-F])/g;
const RGB_REGEX = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d\.]+\s*)?\)/g;

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const findings = [];

    lines.forEach((line, index) => {
        let match;
        // Reset regex state
        HEX_REGEX.lastIndex = 0;
        RGB_REGEX.lastIndex = 0;

        while ((match = HEX_REGEX.exec(line)) !== null) {
            findings.push({ line: index + 1, type: 'HEX', value: match[0], content: line.trim() });
        }
        while ((match = RGB_REGEX.exec(line)) !== null) {
            findings.push({ line: index + 1, type: 'RGB', value: match[0], content: line.trim() });
        }
    });

    return findings;
}

function scanDirectory(dir) {
    let results = {};

    // Check if it's a file directly (like App.tsx)
    if (fs.existsSync(dir) && fs.lstatSync(dir).isFile()) {
        if (EXTENSIONS.includes(path.extname(dir))) {
            const findings = scanFile(dir);
            if (findings.length > 0) {
                results[dir] = findings;
            }
        }
        return results;
    }

    if (!fs.existsSync(dir)) return results;

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(file)) {
                Object.assign(results, scanDirectory(fullPath));
            }
        } else if (EXTENSIONS.includes(path.extname(file))) {
            const findings = scanFile(fullPath);
            if (findings.length > 0) {
                results[fullPath] = findings;
            }
        }
    });

    return results;
}

function main() {
    console.log('Scanning for hardcoded colors...');
    let allFindings = {};

    DIRECTORIES_TO_SCAN.forEach(target => {
        const targetPath = path.resolve(__dirname, '..', target);
        Object.assign(allFindings, scanDirectory(targetPath));
    });

    const fileCount = Object.keys(allFindings).length;
    let totalFindings = 0;

    console.log('\n--- REPORT ---');
    for (const [file, findings] of Object.entries(allFindings)) {
        console.log(`\nFile: ${path.relative(path.join(__dirname, '..'), file)}`);
        findings.forEach(f => {
            console.log(`  Line ${f.line}: ${f.value}  (Context: ${f.content.substring(0, 50)}...)`);
            totalFindings++;
        });
    }

    console.log(`\nFound ${totalFindings} hardcoded colors in ${fileCount} files.`);
}

main();
