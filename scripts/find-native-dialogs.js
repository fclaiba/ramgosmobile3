#!/usr/bin/env node
// Finds native dialog call sites (Alert.alert / window.confirm / window.alert)
// that should route through the glass ConfirmProvider instead.
// Usage: node scripts/find-native-dialogs.js
const fs = require('fs');
const path = require('path');

const ROOTS = ['src', 'App.tsx'];
const PATTERNS = [
    { re: /Alert\.alert\s*\(/g, label: 'Alert.alert' },
    { re: /window\.confirm\s*\(/g, label: 'window.confirm' },
    { re: /window\.alert\s*\(/g, label: 'window.alert' },
];
const ALLOWLIST = [
    'src\\utils\\confirm.ts', 'src/utils/confirm.ts',
    // Native-only camera/gallery pickers: web bypasses them, native UX is platform standard.
    'src\\components\\social\\CreateStory.tsx', 'src/components/social/CreateStory.tsx',
    'src\\screens\\BasicProfileSetupScreen.tsx', 'src/screens/BasicProfileSetupScreen.tsx',
];

const findings = [];

function scanFile(file) {
    if (ALLOWLIST.some((a) => file.endsWith(a))) return;
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
        for (const { re, label } of PATTERNS) {
            re.lastIndex = 0;
            if (re.test(line)) findings.push({ file, line: i + 1, label, code: line.trim().slice(0, 100) });
        }
    });
}

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full);
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            scanFile(full);
        }
    }
}

for (const root of ROOTS) {
    const full = path.resolve(root);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else scanFile(full);
}

if (findings.length === 0) {
    console.log('OK: no native dialog call sites found outside src/utils/confirm.ts');
} else {
    console.log(`Found ${findings.length} native dialog call site(s):\n`);
    for (const f of findings) console.log(`  ${f.file}:${f.line}  [${f.label}]  ${f.code}`);
    process.exitCode = 1;
}
