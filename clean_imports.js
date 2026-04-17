const fs = require('fs');

const files = [
   'src/components/DailyChallenges.tsx',
   'src/components/SidebarMenu.tsx',
   'src/contexts/NotificationsContext.tsx',
   'src/screens/AboutScreen.tsx',
   'src/screens/AdminDashboardScreen.tsx',
   'src/screens/BasicProfileSetupScreen.tsx',
   'src/screens/business/BusinessQRScannerScreen.tsx',
   'src/screens/BusinessDashboardScreen.tsx',
   'src/screens/CreateListingScreen.tsx',
   'src/screens/GamesScreen.tsx',
   'src/screens/InfluencerDashboardScreen.tsx',
   'src/screens/KYCScreen.tsx',
   'src/screens/MapExplorerScreen.tsx',
   'src/screens/marketplace/DisputeReasonScreen.tsx',
   'src/screens/ProfileScreen.tsx',
   'src/screens/SettingsScreen.tsx',
   'src/screens/SupportScreen.tsx',
   'src/screens/VerificationScreen.tsx',
   'src/screens/WelcomeScreen.tsx',
   'src/components/PointsManager.tsx',
   'src/contexts/AuthContext.tsx',
   'src/contexts/ReferralContext.tsx',
   'src/screens/business/BusinessKYCScreen.tsx',
   'src/screens/BusinessCreateScreen.tsx',
   'src/screens/HelpCenterScreen.tsx',
   'src/screens/HistoryScreen.tsx',
   'src/screens/LoginScreen.tsx',
   'src/screens/marketplace/AddEditProductScreen.tsx',
   'src/screens/marketplace/CheckoutScreen.tsx',
   'src/screens/marketplace/DisputeChatScreen.tsx',
   'src/screens/WithdrawalScreen.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Remove Alert from react-native imports safely
    content = content.replace(/Alert,\s*/g, '');
    content = content.replace(/,\s*Alert(?=[\s}])/, '');
    fs.writeFileSync(f, content);
    console.log('Cleaned', f);
  }
});
