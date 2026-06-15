const fs = require('fs');

const files = [
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

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Remove the first occurrence of "const styles = getStyles(isDark);"
    // Or just replace "    const styles = getStyles(isDark);\n" with ""
    // But maybe it's not the exact spacing.
    const regex = /^\s*const styles = getStyles\(isDark\);\s*$/m;
    if (regex.test(content)) {
      content = content.replace(regex, '');
      fs.writeFileSync(file, content, 'utf8');
      console.log('Fixed', file);
    }
  }
}
