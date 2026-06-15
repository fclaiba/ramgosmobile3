const fs = require('fs');
const path = require('path');

const filesToFix = [
    'src/components/forms/UnifiedListingForm.tsx',
    'src/components/MobileHeader.tsx',
    'src/components/PointsManager.tsx',
    'src/screens/admin/AdminFinanceScreen.tsx',
    'src/screens/AdminDashboardScreen.tsx',
    'src/screens/BusinessCreateScreen.tsx',
    'src/screens/CreateListingScreen.tsx',
    'src/screens/marketplace/AddEditProductScreen.tsx',
    'src/screens/ReferralsScreen.tsx',
    'src/screens/RegisterScreen.tsx'
];

for (const file of filesToFix) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remove the first occurrence of "const styles = getStyles(isDark);" 
        // if there is a second more specific one in the same file.
        // Actually, let's just do a regex to replace exactly the duplicate ones.
        // Or safely replace all "const styles = getStyles(isDark);" with "" if there's another "const styles ="
        
        const lines = content.split('\n');
        let styleDeclCount = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('const styles = getStyles(')) {
                styleDeclCount++;
            }
        }
        
        if (styleDeclCount > 1) {
            let removedOne = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('const styles = getStyles(isDark);') && !removedOne) {
                    lines[i] = lines[i].replace('const styles = getStyles(isDark);', '');
                    removedOne = true;
                }
            }
        }
        
        // Fix TS errors in AdminDashboardScreen
        if (file.includes('AdminDashboardScreen')) {
            content = lines.join('\n');
            content = content.replace(/adminId/g, 'actorId');
        } else if (file.includes('CreateListingScreen') || file.includes('AddEditProductScreen')) {
            content = lines.join('\n');
            content = content.replace(/userId: user\.id/g, ''); // Removes the extra param causing the error
            content = content.replace(/,\s*}/g, '}'); 
        } else {
            content = lines.join('\n');
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed ${file}`);
    }
}

// Fix CrashHandler
const crashHandlerPath = path.join(__dirname, '../src/components/CrashHandler.tsx');
if (fs.existsSync(crashHandlerPath)) {
    let crashContent = fs.readFileSync(crashHandlerPath, 'utf8');
    if (!crashContent.includes('const styles = getStyles(false);')) {
        crashContent = crashContent.replace('if (this.state.hasError) {', 'if (this.state.hasError) {\n            const styles = getStyles(false);');
        fs.writeFileSync(crashHandlerPath, crashContent, 'utf8');
        console.log('Fixed CrashHandler');
    }
}

// Fix ToastContext
const toastContextPath = path.join(__dirname, '../src/contexts/ToastContext.tsx');
if (fs.existsSync(toastContextPath)) {
    let toastContent = fs.readFileSync(toastContextPath, 'utf8');
    toastContent = toastContent.replace('const styles = getStyles();', 'const styles = getStyles(colorScheme === "dark");');
    fs.writeFileSync(toastContextPath, toastContent, 'utf8');
    console.log('Fixed ToastContext');
}

console.log('Done');
