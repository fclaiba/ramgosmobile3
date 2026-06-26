# 🕵️‍♂️ Reporte de Datos Mockeados y Estáticos

Este reporte detalla los lugares del frontend donde se encontraron datos estáticos o mockeados que deberán conectarse al backend (Convex).

## `src/components/business/BusinessLocationSearch.tsx`
- Línea 6: `const MOCK_PLACES = [`
- Línea 24: `const [results, setResults] = useState<typeof MOCK_PLACES>([]);`
- Línea 31: `setTimeout(() => {`
- Línea 32: `const filtered = MOCK_PLACES.filter(p =>`

## `src/components/CartSidebar.tsx`
- Línea 39: `// Mock validation logic`
- Línea 71: `setTimeout(() => {`

## `src/components/games/DinoGame.tsx`
- Línea 225: `crouchTimer.current = setTimeout(() => {`

## `src/components/games/FruitCatcher.tsx`
- Línea 285: `powerupTimer.current = setTimeout(() => {`

## `src/components/games/gameContracts.ts`
- Línea 307: `* Nota: hoy cada juego tiene estilos hardcodeados; estos tokens son la “fuente” a la que migraremos.`

## `src/components/games/GameWrapper.tsx`
- Línea 129: `const t = setTimeout(() => {`

## `src/components/games/MemoryGame.tsx`
- Línea 224: `previewTimerRef.current = setTimeout(() => {`
- Línea 272: `matchTimerRef.current = setTimeout(() => {`
- Línea 284: `setTimeout(() => {`
- Línea 303: `matchTimerRef.current = setTimeout(() => {`
- Línea 345: `setTimeout(() => {`

## `src/components/games/SlotMachine.tsx`
- Línea 200: `setTimeout(() => {`

## `src/components/marketplace/EscrowSheet.tsx`
- Línea 243: `const t = setTimeout(() => {`
- Línea 255: `const t = setTimeout(() => {`

## `src/components/marketplace/LocationPickerModal.web.tsx`
- Línea 8: `// @ts-ignore - web implementation often mocks this or it works if essentially mapped`

## `src/components/marketplace/MapView.web.tsx`
- Línea 202: `const timer = setTimeout(() => {`
- Línea 214: `setTimeout(() => {`
- Línea 318: `debounceTimeoutRef.current = setTimeout(() => {`

## `src/components/pet/MiMascotaView.tsx`
- Línea 249: `setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);`
- Línea 266: `setTimeout(() => { setIsAnimating(false); setCatAnimation('idle'); }, 2000);`

## `src/components/SidebarMenu.tsx`
- Línea 92: `setTimeout(() => {`
- Línea 137: `setTimeout(() => {`

## `src/components/social/StoryViewer.tsx`
- Línea 233: `setTimeout(() => {`

## `src/components/ui/ImageUploadField.tsx`
- Línea 52: `// 2. Mock Virus Scanning`
- Línea 54: `setTimeout(() => {`

## `src/config/subscriptionPlans.ts`
- Línea 7: `* IMPORTANT: UI must consume this (no hardcoded 2.99 / 5.99 elsewhere).`

## `src/contexts/AuthContext.tsx`
- Línea 31: `// Auth types (inlined, no longer depending on mockConvexStore internals)`
- Línea 213: `const createSessionMock = (userId: string): SessionRecord => ({`
- Línea 214: `id: 'mock_session_' + Date.now(),`
- Línea 217: `accessToken: 'mock_access_token',`
- Línea 218: `refreshToken: 'mock_refresh_token',`
- Línea 248: `// CRITICAL: Skip query if ID is a mock ID (from previous offline testing) to prevent Server Errors`
- Línea 249: `const isValidConvexId = userId && !userId.startsWith('mock_') && !userId.startsWith('user_') && !userId.includes('session');`
- Línea 254: `// 1. Initialize Session (MOCKED)`
- Línea 277: `user: storedSession._mockUser || null,`
- Línea 278: `status: storedSession._mockUser ? 'authenticated' : 'loading',`
- Línea 362: `const session = createSessionMock(user.id);`
- Línea 363: `await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, _mockUser: user }));`
- Línea 424: `const session = createSessionMock(user.id);`
- Línea 425: `await storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...session, _mockUser: user }));`
- Línea 568: `storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...prev.session, _mockUser: updatedUser })).catch(console.error);`
- Línea 668: `const session = createSessionMock(userId);`
- Línea 721: `storage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ ...prev.session, _mockUser: updatedUser })).catch(console.error);`

## `src/contexts/BusinessContext.tsx`
- Línea 297: `redeemed: l.eventSoldCount || 0, // mock`

## `src/contexts/EscrowContext.tsx`
- Línea 45: `setTimeout(() => {`

## `src/contexts/MarketplaceContext.tsx`
- Línea 82: `// For mock MVP: we reuse Product as a unified listing container.`

## `src/contexts/NotificationsContext.tsx`
- Línea 11: `// Mock types locally to avoid import`

## `src/contexts/SocialContext.tsx`
- Línea 4: `* Replaces the AsyncStorage / mock-driven legacy implementation. Posts,`
- Línea 14: `* - All mock users, initial posts mocks, mock chats, etc. were removed:`
- Línea 708: `// dedicated screens. The legacy sync API only had mock data.`

## `src/contexts/StripeConnectContext.tsx`
- Línea 54: `// Hardcoded dummy user ID for demo purposes`

## `src/contexts/ToastContext.tsx`
- Línea 49: `setTimeout(() => {`

## `src/contexts/WalletContext.tsx`
- Línea 37: `// client-side mock (a JSON blob serialised under `economyState.walletState`).`

## `src/screens/AdminDashboardScreen.tsx`
- Línea 34: `// Types removed/simplified as they are now inline or unused mocks`
- Línea 65: `// Mocks for Shop/Volume (Keep these or fetch if available, for now keep mocks for non-request)`
- Línea 67: `const totalVolume = 125000; // Mock`
- Línea 83: `emailVerified: true // Mock`

## `src/screens/BasicProfileSetupScreen.tsx`
- Línea 33: `// Update profile in context/mock store`

## `src/screens/business/BusinessKYCScreen.tsx`
- Línea 53: `setTimeout(() => {`

## `src/screens/BusinessProfileScreen.tsx`
- Línea 8: `// Mock Bonuses for the business`

## `src/screens/finance/WalletScreen.tsx`
- Línea 21: `// However, our mock wallet setup in WalletContext might need to be aligned.`
- Línea 22: `// For now, let's use a hardcoded 'seller_1' if user is seller, or just use the auth user id.`

## `src/screens/ForgotPasswordScreen.tsx`
- Línea 21: `setTimeout(() => {`

## `src/screens/HomeScreen.tsx`
- Línea 135: `setTimeout(() => {`

## `src/screens/InfluencerDashboardScreen.tsx`
- Línea 48: `// Replaces the legacy WalletContext.campaigns / .contracts mock.`

## `src/screens/LoginScreen.tsx`
- Línea 68: `const timer = setTimeout(() => {`

## `src/screens/marketing/CampaignManagerScreen.tsx`
- Línea 14: `* a business. Replaces the legacy `WalletContext.campaigns` mock with`

## `src/screens/marketplace/AddEditProductScreen.tsx`
- Línea 133: `weightKg: 1, // Default mock`

## `src/screens/marketplace/DisputeChatScreen.tsx`
- Línea 96: `const hoursLeft = 72; // Mock`
- Línea 263: `onPress={() => show('Adjuntar evidencia (mock)', 'info')}`

## `src/screens/marketplace/OrderDetailScreen.tsx`
- Línea 135: `{/* Steps / Tracking Info Mockup */}`

## `src/screens/MarketplaceScreen.tsx`
- Línea 73: `// Mock seeds removed.`
- Línea 75: `// Mock generation code removed.`
- Línea 77: `// Service mocks removed.`
- Línea 79: `// Mock definitions removed.`
- Línea 257: `// If searching, we likely only want real results, not mocks`

## `src/screens/ProfileScreen.tsx`
- Línea 45: `// Initial State Mock`
- Línea 61: `// level: 8, // Removed mock`
- Línea 62: `// expProgress: 65, // Removed mock`
- Línea 102: `setTimeout(() => {`

## `src/screens/SocialAuthCompleteScreen.tsx`
- Línea 36: `const timer = setTimeout(() => {`

## `src/screens/WelcomeScreen.tsx`
- Línea 46: `const timer = setTimeout(() => {`

## `src/screens/WithdrawalScreen.tsx`
- Línea 5: `* legacy ACH form was a mock — `finance.createWithdrawal` only flipped a`

