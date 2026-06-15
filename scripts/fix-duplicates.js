const fs = require('fs');
const path = require('path');

const filesToFix = [
    'src/components/forms/UnifiedListingForm.tsx',
    'src/components/marketplace/EscrowSheet.tsx',
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

filesToFix.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Find double declarations like:
    // const styles = getStyles(isDark);
    // const styles = getStyles(isDark, insets);
    // And keep only the one with more arguments or just remove the exact duplicated line if they are identical.
    
    // Simplest approach: remove the first occurrence of `const styles = getStyles(isDark);`
    // if there are multiple declarations of `const styles = ` in the same block.
    
    // We can use a regex to replace `const styles = getStyles(isDark);\n    const styles = `
    content = content.replace(/const styles = getStyles\(isDark\);\s*const styles =/g, 'const styles =');
    content = content.replace(/const styles = getStyles\(isDark, insets\);\s*const styles =/g, 'const styles =');
    content = content.replace(/const styles = getStyles\(isDark\);\s*const styles = getStyles\(isDark, insets\);/g, 'const styles = getStyles(isDark, insets);');
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed', file);
});

// Fix ToastContext manually
const toastPath = path.join(__dirname, 'src/contexts/ToastContext.tsx');
if (fs.existsSync(toastPath)) {
    let toastContent = fs.readFileSync(toastPath, 'utf8');
    // Revert getStyles usage in ToastContext since it might be wrong.
    toastContent = toastContent.replace(/const styles = getStyles\(\);/, 'const styles = StyleSheet.create({');
    toastContent = toastContent.replace(/const getStyles = \(\) => StyleSheet\.create\({/, 'const styles = StyleSheet.create({');
    fs.writeFileSync(toastPath, toastContent, 'utf8');
    console.log('Fixed ToastContext.tsx');
}

// Fix CrashHandler manually
const crashPath = path.join(__dirname, 'src/components/CrashHandler.tsx');
if (fs.existsSync(crashPath)) {
    let crashContent = fs.readFileSync(crashPath, 'utf8');
    crashContent = crashContent.replace(/const getStyles = \(isDark: any\) => StyleSheet\.create/, 'const styles = StyleSheet.create');
    crashContent = crashContent.replace(/isDark \? isDark \? '#6B7280' : '#9CA3AF' : '#6B7280'/g, "'#6B7280'");
    crashContent = crashContent.replace(/isDark \? '#1F2937' : '#F3F4F6'/g, "'#F3F4F6'");
    crashContent = crashContent.replace(/isDark \? '#1F2937' : '#fff'/g, "'#fff'");
    crashContent = crashContent.replace(/isDark \? '#F9FAFB' : '#000'/g, "'#000'");
    crashContent = crashContent.replace(/isDark \? '#6B7280' : '#9CA3AF'/g, "'#9CA3AF'");
    crashContent = crashContent.replace(/isDark \? '#1F2937' : '#fff'/g, "'#fff'");
    fs.writeFileSync(crashPath, crashContent, 'utf8');
    console.log('Fixed CrashHandler.tsx');
}
