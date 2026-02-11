const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/*
 * Health Check Script for Ramgos Mobile
 * 
 * This script scans the project configuration and code for known issues,
 * ensuring strict validation before build or start.
 */

const ANSI_RESET = "\x1b[0m";
const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_BOLD = "\x1b[1m";

let hasErrors = false;
let hasWarnings = false;

function logError(msg) {
    console.error(`${ANSI_RED}${ANSI_BOLD}[ERROR]${ANSI_RESET} ${msg}`);
    hasErrors = true;
}

function logWarning(msg) {
    console.warn(`${ANSI_YELLOW}${ANSI_BOLD}[WARN]${ANSI_RESET} ${msg}`);
    hasWarnings = true;
}

function logSuccess(msg) {
    console.log(`${ANSI_GREEN}[PASS]${ANSI_RESET} ${msg}`);
}

function checkFileExists(filePath, description) {
    if (fs.existsSync(filePath)) {
        logSuccess(`${description} exists: ${path.basename(filePath)}`);
        return true;
    } else {
        logError(`${description} MISSING: ${path.basename(filePath)}`);
        return false;
    }
}

function checkFileContent(filePath, regex, description, failIfMissing = true) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    if (regex.test(content)) {
        logSuccess(`${description} verified`);
    } else {
        if (failIfMissing) {
            logError(`${description} FAILED validation in ${path.basename(filePath)}`);
        } else {
            logWarning(`${description} not found in ${path.basename(filePath)}`);
        }
    }
}

function scanForPattern(dir, pattern, exclusionList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (exclusionList.some(ex => fullPath.includes(ex))) return;

        if (stat.isDirectory()) {
            scanForPattern(fullPath, pattern, exclusionList);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                const match = line.match(pattern.regex);
                if (match) {
                    if (pattern.severity === 'error') {
                        logError(`${pattern.message} at ${file}:${index + 1}`);
                    } else {
                        logWarning(`${pattern.message} at ${file}:${index + 1}`);
                    }
                }
            });
        }
    });
}

console.log(`${ANSI_BOLD}Starting Project Health Check...${ANSI_RESET}\n`);

// 1. Check Metro Config (Windows Fix)
const metroConfig = path.join(process.cwd(), 'metro.config.cjs');
const metroConfigJs = path.join(process.cwd(), 'metro.config.js');

if (process.platform === 'win32') {
    if (fs.existsSync(metroConfig)) {
        logSuccess('Windows Metro Config (cjs) detected. This avoids the ESM Loader error.');
    } else if (fs.existsSync(metroConfigJs)) {
        logError('Windows Environment detected with "metro.config.js".');
        console.error(`${ANSI_YELLOW}   -> This causes "ERR_UNSUPPORTED_ESM_URL_SCHEME" on Windows.${ANSI_RESET}`);
        console.error(`${ANSI_YELLOW}   -> SOLUTION: Rename "metro.config.js" to "metro.config.cjs"${ANSI_RESET}`);
        hasErrors = true; // Mark as error to prompt user action
    } else {
        logWarning('No custom metro config found. If using NativeWind, ensure you have one.');
    }
}

// 2. Check NativeWind Config
checkFileContent(
    path.join(process.cwd(), 'babel.config.js'),
    /nativewind\/babel/,
    'NativeWind Babel Plugin'
);

checkFileContent(
    path.join(process.cwd(), 'tailwind.config.js'),
    /darkMode:\s*['"]class['"]/,
    'Tailwind Dark Mode ("class")'
);

// 3. Scan for Dangerous Code
console.log('\nScanning src/ directory for dangerous patterns...');
scanForPattern(path.join(process.cwd(), 'src'), {
    regex: /from\s+['"]react-native['"]\s*.*SafeAreaView/,
    message: 'Deprecated SafeAreaView imported from react-native. Use react-native-safe-area-context.',
    severity: 'error'
});

scanForPattern(path.join(process.cwd(), 'src'), {
    regex: /getExpoPushTokenAsync/,
    message: 'Verify getExpoPushTokenAsync usage. Ensure it is skipped in Expo Go (SDK 53+).',
    severity: 'warning'
});

// 4. Check NativeWind Version Compatibility
const packageJson = require('../package.json');
const nativeWindVersion = packageJson.dependencies.nativewind || packageJson.devDependencies.nativewind;
console.log(`\nDetected NativeWind Version: ${ANSI_BOLD}${nativeWindVersion}${ANSI_RESET}`);

if (nativeWindVersion && nativeWindVersion.startsWith('^4') || nativeWindVersion.startsWith('4')) {
    if (process.platform === 'win32') {
        logWarning('NativeWind v4 on Windows is unstable due to Metro configuration issues.');
        if (!fs.existsSync(path.join(process.cwd(), 'output.css'))) {
            logError('NativeWind v4 on Windows requires Manual CSS Generation (output.css) or it will fail.');
        } else {
            logSuccess('Manual CSS file (output.css) found for NativeWind v4.');
        }
    }
} else if (nativeWindVersion && (nativeWindVersion.startsWith('^2') || nativeWindVersion.startsWith('2'))) {
    logSuccess('NativeWind v2 detected (Recommended for Windows stability).');

    // Check babel config for v2 plugin style
    const babelConfigContent = fs.readFileSync(path.join(process.cwd(), 'babel.config.js'), 'utf8');
    if (babelConfigContent.includes('nativewind/babel') && babelConfigContent.includes('transformOnly')) {
        logSuccess('Babel config appears correct for NativeWind v2.');
    } else {
        logWarning('Babel config might not be optimized for NativeWind v2. Ensure "nativewind/babel" plugin is used.');
    }
}

// Summary
console.log('\n' + '-'.repeat(40));
if (hasErrors) {
    console.error(`${ANSI_RED}${ANSI_BOLD}HEALTH CHECK FAILED ❌${ANSI_RESET}`);
    console.log('Please fix the errors above before deploying.');
    process.exit(1);
} else {
    console.log(`${ANSI_GREEN}${ANSI_BOLD}HEALTH CHECK PASSED ✅${ANSI_RESET}`);
    if (hasWarnings) console.log('Review warnings manually.');
}
