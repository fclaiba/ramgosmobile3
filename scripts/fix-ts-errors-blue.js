const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// absoluteFillObject -> absoluteFill replacements
const absoluteFillFiles = [
    'src/components/ResponsiveLayout.tsx',
    'src/components/ui/ChromeGlass.tsx',
    'src/components/ui/GlassScreen.tsx',
    'src/components/ui/GlassSurface.tsx',
    'src/payments/components/PaymentSuccessBurst.tsx',
    'src/screens/BonusQRScreen.tsx',
    'src/screens/BusinessDashboardScreen.tsx',
    'src/screens/HistoryScreen.tsx',
    'src/screens/InfluencerDashboardScreen.tsx'
];

for (const file of absoluteFillFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        content = content.replace(/StyleSheet\.absoluteFillObject/g, 'StyleSheet.absoluteFill');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed absoluteFill in:', file);
    }
}

// Remove unused @ts-expect-error
const tsExpectFiles = [
    'src/components/ui/ChromeGlass.tsx',
    'src/components/ui/sheet.tsx',
    'src/theme/tokens.ts'
];

for (const file of tsExpectFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        content = content.replace(/\/\/\s*@ts-expect-error.*\n/g, '');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Removed @ts-expect-error in:', file);
    }
}

// Fix PointsManager.tsx
const pointsManagerPath = path.join(ROOT_DIR, 'src/components/PointsManager.tsx');
if (fs.existsSync(pointsManagerPath)) {
    let content = fs.readFileSync(pointsManagerPath, 'utf8');
    // The error says: Property 'id' does not exist on type '{ minPoints: number; label: string; bonusMultiplier: number; perks: string[]; }'
    // Let's replace tier.id with tier.label as a unique key if it's used as key
    content = content.replace(/key=\{tier\.id\}/g, 'key={tier.label}');
    // If there's another usage of tier.id, we just replace it globally.
    content = content.replace(/tier\.id/g, 'tier.label');
    fs.writeFileSync(pointsManagerPath, content, 'utf8');
    console.log('Fixed PointsManager.tsx');
}
