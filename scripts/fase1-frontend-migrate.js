// FASE 1: agrega `sessionToken` a los llamados Convex del frontend que hoy
// mandan userId/actorId, y lo agrega al destructuring de useAuth().
const fs = require('fs');

const files = [
  'src/hooks/useCheckout.ts',
  'src/hooks/useOrderById.ts',
  'src/hooks/useFavorites.ts',
  'src/hooks/useUserPreferences.ts',
  'src/contexts/EscrowContext.tsx',
  'src/contexts/RewardsContext.tsx',
  'src/contexts/PointsContext.tsx',
  'src/components/marketplace/EscrowSheet.tsx',
  'src/components/AddReviewModal.tsx',
  'src/screens/HistoryScreen.tsx',
  'src/screens/HomeScreen.tsx',
  'src/screens/marketplace/OrderDetailScreen.tsx',
  'src/screens/marketplace/QRScannerScreen.tsx',
  'src/screens/marketplace/DisputeChatScreen.tsx',
  'src/screens/marketplace/AddEditProductScreen.tsx',
  'src/screens/BusinessScannerScreen.tsx',
  'src/screens/CreateListingScreen.tsx',
  'src/screens/SubscriptionPlansScreen.tsx',
];

const argPatterns = [
  /(\{\s*)(userId:\s*user\.id\b)/g,
  /(\{\s*)(userId:\s*user\?\.id\b)/g,
  /(\{\s*)(actorId:\s*user\.id\b)/g,
  /(\{\s*)(actorId:\s*user\?\.id\b)/g,
  /(,\s*)(userId:\s*user\.id\b)/g,
  /(,\s*)(userId:\s*user\?\.id\b)/g,
  /(,\s*)(actorId:\s*user\.id\b)/g,
  /(,\s*)(actorId:\s*user\?\.id\b)/g,
];

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('missing:', f); continue; }
  let s = fs.readFileSync(f, 'utf8');
  const orig = s;

  // 1) exponer sessionToken desde useAuth()
  s = s.replace(/const\s*\{([^}]*)\}\s*=\s*useAuth\(\)/g, (m, inner) => {
    if (!/\buser\b/.test(inner) || /sessionToken/.test(inner)) return m;
    return `const {${inner.replace(/\s*$/, '')}, sessionToken } = useAuth()`;
  });

  // 2) prefijar sessionToken en los args que mandan userId/actorId del cliente
  for (const re of argPatterns) {
    s = s.replace(re, (m, pre, arg) => {
      return `${pre}sessionToken, ${arg}`;
    });
  }
  s = s.replace(/(?:sessionToken,\s*){2,}/g, 'sessionToken, ');

  if (s !== orig) { fs.writeFileSync(f, s); console.log('updated:', f); }
  else console.log('no-change:', f);
}
