const fs = require('fs');
const files = [
   'src/components/DailyChallenges.tsx',
   'src/components/PointsManager.tsx',
   'src/components/SidebarMenu.tsx',
   'src/contexts/AuthContext.tsx',
   'src/contexts/NotificationsContext.tsx',
   'src/contexts/ReferralContext.tsx',
   'src/screens/AboutScreen.tsx',
   'src/screens/AdminDashboardScreen.tsx',
   'src/screens/BasicProfileSetupScreen.tsx',
   'src/screens/business/BusinessKYCScreen.tsx',
   'src/screens/business/BusinessQRScannerScreen.tsx',
   'src/screens/BusinessCreateScreen.tsx',
   'src/screens/BusinessDashboardScreen.tsx',
   'src/screens/CreateListingScreen.tsx',
   'src/screens/GamesScreen.tsx',
   'src/screens/HelpCenterScreen.tsx',
   'src/screens/HistoryScreen.tsx',
   'src/screens/InfluencerDashboardScreen.tsx',
   'src/screens/KYCScreen.tsx',
   'src/screens/LoginScreen.tsx',
   'src/screens/MapExplorerScreen.tsx',
   'src/screens/marketplace/AddEditProductScreen.tsx',
   'src/screens/marketplace/CheckoutScreen.tsx',
   'src/screens/marketplace/DisputeChatScreen.tsx',
   'src/screens/marketplace/DisputeReasonScreen.tsx',
   'src/screens/marketplace/DisputeScreen.tsx',
   'src/screens/marketplace/OrderDetailScreen.tsx',
   'src/screens/PaymentScreen.tsx',
   'src/screens/ProfileScreen.tsx',
   'src/screens/RegisterScreen.tsx',
   'src/screens/SavedScreen.tsx',
   'src/screens/SettingsScreen.tsx',
   'src/screens/SupportScreen.tsx',
   'src/screens/VerificationScreen.tsx',
   'src/screens/WelcomeScreen.tsx',
   'src/screens/WithdrawalScreen.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const hasAlertImport = /Alert/.test(content);
    const alertCalls = content.match(/Alert\.alert/g);
    if (hasAlertImport || alertCalls) {
      console.log(f, '=> Import:', hasAlertImport, 'Calls:', alertCalls ? alertCalls.length : 0);
    }
  } else {
    console.log('Missing:', f);
  }
});
