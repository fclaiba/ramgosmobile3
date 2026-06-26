const fs = require('fs');
const path = require('path');

const mockPatterns = [
    /mock/i,
    /dummy/i,
    /hardcode/i,
    /\/\/ TODO: replace with API/i,
    /const \w+ = \[.*\]; \/\/ mock/i,
    /const \w+ = {.*}; \/\/ mock/i,
    /setTimeout\(\(\) => {/i, // Often used to mock network requests
];

const ignoreFiles = [
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /__tests__/
];

function scanDirectory(dir, results = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDirectory(fullPath, results);
        } else if (fullPath.match(/\.(ts|tsx)$/)) {
            if (ignoreFiles.some(pattern => fullPath.match(pattern))) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            const matches = [];

            lines.forEach((line, index) => {
                for (const pattern of mockPatterns) {
                    if (pattern.test(line)) {
                        matches.push({ line: index + 1, content: line.trim() });
                        break;
                    }
                }
            });

            if (matches.length > 0) {
                results.push({ file: fullPath, matches });
            }
        }
    }
    return results;
}

const results = scanDirectory(path.join(process.cwd(), 'src'));

let report = '# 🕵️‍♂️ Reporte de Datos Mockeados y Estáticos\n\n';
report += 'Este reporte detalla los lugares del frontend donde se encontraron datos estáticos o mockeados que deberán conectarse al backend (Convex).\n\n';

results.forEach(res => {
    const relativePath = path.relative(process.cwd(), res.file).replace(/\\/g, '/');
    report += `## \`${relativePath}\`\n`;
    res.matches.forEach(match => {
        report += `- Línea ${match.line}: \`${match.content}\`\n`;
    });
    report += '\n';
});

fs.writeFileSync('mock_report.md', report);
console.log('Mock report generated at mock_report.md');
