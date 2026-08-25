import React from 'react';
import './global.css';
import { View, StyleSheet, Text } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme, getStateFromPath as rnGetStateFromPath } from '@react-navigation/native';
import { useTheme, ThemeProvider } from './src/contexts/ThemeContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useBonoDeepLinkHandler } from './src/hooks/useBonoDeepLinkHandler';
import { useCommunityDeepLinkHandler } from './src/hooks/useCommunityDeepLinkHandler';
import { createAppGetStateFromPath } from './src/navigation/getStateFromPath';
import { CommunityJoinHost } from './src/navigation/CommunityJoinHost';

/** Se arma una sola vez: no depende de props ni de estado. */
const appGetStateFromPath = createAppGetStateFromPath(rnGetStateFromPath);

import { AuthProvider } from './src/contexts/AuthContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { ConfirmProvider } from './src/contexts/ConfirmContext';
import { RewardsProvider } from './src/contexts/RewardsContext';
import { PointsProvider } from './src/contexts/PointsContext';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from './src/contexts/CartContext';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { PaymentProvider } from './src/payments/PaymentProvider';
import { PaymentModeProvider, usePaymentMode } from './src/contexts/PaymentModeContext';
import { EscrowProvider } from './src/contexts/EscrowContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { EscrowSheet } from './src/components/marketplace/EscrowSheet';
import { CrashHandler } from './src/components/CrashHandler';

import { Platform } from 'react-native';

import { configureGoogleSignIn } from './src/services/auth/googleSignIn';
import './src/i18n';
import { I18nProvider } from './src/i18n/I18nProvider';

configureGoogleSignIn();

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Suppress known react-native-web aria-hidden warning caused by Modals
if (Platform.OS === 'web') {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
        if (typeof args[0] === 'string' && args[0].includes('Blocked aria-hidden on an element')) {
            return;
        }
        originalConsoleError(...args);
    };
}

if (sentryDsn && !(globalThis as any).__RAMGOS_SENTRY_INITIALIZED__) {
    Sentry.init({
        dsn: sentryDsn,
        enabled: true,
        debug: __DEV__,
        environment: __DEV__ ? 'development' : 'production',
        tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    });
    (globalThis as any).__RAMGOS_SENTRY_INITIALIZED__ = true;
}

// #endregion


// Screens
import NotificationsScreen from './src/screens/NotificationsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import KYCScreen from './src/screens/KYCScreen';
import TermsScreen from './src/screens/TermsScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';

import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import ReferralsScreen from './src/screens/ReferralsScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SocialScreen from './src/screens/SocialScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';
import CartScreen from './src/screens/CartScreen';
import MiMascotaScreen from './src/screens/MiMascotaScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SavedScreen from './src/screens/SavedScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import PaymentMethodsScreen from './src/screens/PaymentMethodsScreen';
import HelpCenterScreen from './src/screens/HelpCenterScreen';
import HelpArticleDetailScreen from './src/screens/HelpArticleDetailScreen';
import SupportScreen from './src/screens/SupportScreen';
import AboutScreen from './src/screens/AboutScreen';
import BusinessDashboardScreen from './src/screens/BusinessDashboardScreen';
import BannedUserScreen from './src/screens/BannedUserScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import BusinessCreateScreen from './src/screens/BusinessCreateScreen';
import InfluencerDashboardScreen from './src/screens/InfluencerDashboardScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import AdminFinanceScreen from './src/screens/admin/AdminFinanceScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import WithdrawalScreen from './src/screens/WithdrawalScreen';
import BonusQRScreen from './src/screens/BonusQRScreen';
import BusinessScannerScreen from './src/screens/BusinessScannerScreen';
import SubscriptionPlansScreen from './src/screens/SubscriptionPlansScreen';
import CreateListingScreen from './src/screens/CreateListingScreen';
import MyListingsScreen from './src/screens/MyListingsScreen';
import MyBookingsScreen from './src/screens/MyBookingsScreen';
import FormFillScreen from './src/screens/FormFillScreen';
import ProductDetailScreen from './src/screens/marketplace/ProductDetailScreen';
import WalletScreen from './src/screens/finance/WalletScreen';
import CampaignManagerScreen from './src/screens/marketing/CampaignManagerScreen';
import OrderDetailScreen from './src/screens/marketplace/OrderDetailScreen';
import DisputeReasonScreen from './src/screens/marketplace/DisputeReasonScreen';
import DisputeChatScreen from './src/screens/marketplace/DisputeChatScreen';
import SellerWalletScreen from './src/screens/marketplace/SellerWalletScreen';
import DisputeScreen from './src/screens/marketplace/DisputeScreen';

// Business Screens
import BusinessProfileScreen from './src/screens/business/BusinessProfileScreen';
import BusinessKYCScreen from './src/screens/business/BusinessKYCScreen';
import BusinessQRScannerScreen from './src/screens/business/BusinessQRScannerScreen';
import BusinessFormsScreen from './src/screens/BusinessFormsScreen';
import InfluencerBonusesScreen from './src/screens/InfluencerBonusesScreen';
import UserListScreen from './src/screens/social/UserListScreen';
import InboxScreen from './src/screens/social/InboxScreen';
import ChatScreen from './src/screens/social/ChatScreen';
import GroupInfoScreen from './src/screens/social/GroupInfoScreen';
import GamesScreen from './src/screens/GamesScreen';
import MapExplorerScreen from './src/screens/MapExplorerScreen';
import CommercialProfileScreen from './src/screens/CommercialProfileScreen';
import PostDetailScreen from './src/screens/social/PostDetailScreen';
import SoundDetailsScreen from './src/screens/social/SoundDetailsScreen';
import CreateReelScreen from './src/screens/social/CreateReelScreen';
import StoryComposerScreen from './src/screens/social/StoryComposerScreen';
import HighlightViewerScreen from './src/screens/social/HighlightViewerScreen';
import StoryViewersScreen from './src/screens/social/StoryViewersScreen';
import HashtagFeedScreen from './src/screens/social/HashtagFeedScreen';
import ActivityScreen from './src/screens/social/ActivityScreen';
import SavedPostsScreen from './src/screens/social/SavedPostsScreen';
import SocialPrivacyScreen from './src/screens/social/SocialPrivacyScreen';
import MyDraftsScreen from './src/screens/social/MyDraftsScreen';
import EventMatchingScreen from './src/screens/social/EventMatchingScreen';
import CommunitiesScreen from './src/screens/social/CommunitiesScreen';
import CreateCommunityScreen from './src/screens/social/CreateCommunityScreen';
import CommunityDetailScreen from './src/screens/social/CommunityDetailScreen';
import CommunitySettingsScreen from './src/screens/social/CommunitySettingsScreen';
import AdminModerationScreen from './src/screens/admin/AdminModerationScreen';
import AnalyticsDashboardScreen from './src/screens/AnalyticsDashboardScreen';
import { navigationRef } from './src/navigation/navigationRef';
import { SessionGuard } from './src/components/SessionGuard';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    useBonoDeepLinkHandler(navigationRef);
    useCommunityDeepLinkHandler(navigationRef);

    // Design system v2: neutral canvas + brand accent (no purple wallpaper)
    const MyDarkTheme = {
        ...DarkTheme,
        colors: {
            ...DarkTheme.colors,
            background: '#09090B',
            card: 'rgba(255,255,255,0.07)',
            primary: '#2196F3',
            text: '#FAFAFA',
            border: 'rgba(255,255,255,0.10)',
        },
    };

    const MyLightTheme = {
        ...DefaultTheme,
        colors: {
            ...DefaultTheme.colors,
            background: '#FAFAFA',
            card: 'rgba(255,255,255,0.72)',
            primary: '#2196F3',
            text: '#18181B',
            border: 'rgba(0,0,0,0.08)',
        },
    };

    return (
        <NavigationContainer
            ref={navigationRef}
            theme={isDark ? MyDarkTheme : MyLightTheme}
            linking={{
                prefixes: [
                    'ramgos://',
                    'https://ramgos.app',
                    'https://www.ramgos.app',
                    // Legacy share links still open in-app
                    'https://ramgos.com',
                    'https://www.ramgos.com',
                ],
                config: {
                    screens: {
                        Welcome: 'Welcome',
                        Home: 'home',
                        SignUp: 'signup',
                        Login: 'login',
                        Inbox: 'mensajes',
                        Chat: 'chat/:chatId',
                        GroupInfo: 'grupo/:chatId',
                        ItemDetail: {
                            path: 'item/:itemId',
                            parse: {
                                itemId: (itemId: string) => itemId,
                                referralCode: (referralCode: string) => referralCode,
                            },
                        },
                        CommunityDetail: 'c/:communityId',
                        Communities: 'comunidades',
                        // Estas dos las resuelve `getStateFromPath` a mano, pero
                        // igual tienen que estar declaradas: sin patrón de path,
                        // React Navigation serializa el estado usando el NOMBRE
                        // de la pantalla (`/ProductDetail`), y al re-parsear esa
                        // URL la rama de handles la leía como un usuario —
                        // "Perfil no disponible" después de cualquier navegación.
                        CommercialProfile: ':handle',
                        ProductDetail: ':handle/:slug',
                    },
                },
                // El resolver vive en `src/navigation/getStateFromPath.ts`:
                // estaba inline acá y sin tests, y así fue como E-089 se comió
                // el `?ref=` de los links de producto sin que nadie lo notara.
                getStateFromPath: appGetStateFromPath,
            }}
            documentTitle={{ formatter: () => 'Ramgos App' }}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={{ flex: 1, backgroundColor: isDark ? '#09090B' : '#FAFAFA' }}>
                <Stack.Navigator
                    initialRouteName="Welcome"
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: isDark ? '#09090B' : '#FAFAFA' },
                        animation: 'slide_from_right',
                    }}
                >
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    <Stack.Screen name="SubscriptionPlans" component={SubscriptionPlansScreen} />
                    <Stack.Screen name="Notifications" component={NotificationsScreen} />
                    <Stack.Screen name="Welcome" component={WelcomeScreen} />
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Verification" component={VerificationScreen} />
                    <Stack.Screen name="KYC" component={KYCScreen} />
                    <Stack.Screen name="Terms" component={TermsScreen} />
                    <Stack.Screen name="Privacy" component={PrivacyScreen} />

                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="Home" component={HomeScreen} />
                    <Stack.Screen name="SignUp" component={RegisterScreen} />
                    <Stack.Screen name="Social" component={SocialScreen} />
                    <Stack.Screen name="Marketplace" component={MarketplaceScreen} />
                    <Stack.Screen name="CreateListing" component={CreateListingScreen} />
                    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
                    <Stack.Screen name="Wallet" component={WalletScreen} />
                    <Stack.Screen name="CampaignManager" component={CampaignManagerScreen} />
                    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
                    <Stack.Screen name="Cart" component={CartScreen} />
                                        <Stack.Screen name="DisputeReason" component={DisputeReasonScreen} />
                    <Stack.Screen name="DisputeChat" component={DisputeChatScreen} />
                    <Stack.Screen name="SellerWallet" component={SellerWalletScreen} />
                    <Stack.Screen name="MiMascota" component={MiMascotaScreen} />
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen name="Saved" component={SavedScreen} />
                    <Stack.Screen name="History" component={HistoryScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} />
                    <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                    <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
                    <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
                    <Stack.Screen name="HelpArticleDetail" component={HelpArticleDetailScreen} />
                    <Stack.Screen name="Support" component={SupportScreen} />
                    <Stack.Screen name="About" component={AboutScreen} />
                    <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
                    <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
                    <Stack.Screen name="BannedUser" component={BannedUserScreen} options={{ gestureEnabled: false }} />
                    <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
                    <Stack.Screen name="BusinessCreate" component={BusinessCreateScreen} />
                    <Stack.Screen name="VerifyBusiness" component={BusinessKYCScreen} />
                    <Stack.Screen name="Referrals" component={ReferralsScreen} />
                    <Stack.Screen name="BusinessQRScanner" component={BusinessQRScannerScreen} />
                    <Stack.Screen name="BusinessForms" component={BusinessFormsScreen} />
                    <Stack.Screen name="FormFill" component={FormFillScreen} />
                    <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
                    <Stack.Screen name="InfluencerDashboard" component={InfluencerDashboardScreen} />
                    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
                    <Stack.Screen name="AdminFinance" component={AdminFinanceScreen} />
                    <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="Dispute" component={DisputeScreen} />
                    <Stack.Screen name="Withdrawal" component={WithdrawalScreen} />
                    <Stack.Screen name="MyListings" component={MyListingsScreen} />
                                        {/* Maps & QR Module */}
                    {/* MapExplorer integrated into Marketplace */}
                    <Stack.Screen name="BonusQR" component={BonusQRScreen} />
                    <Stack.Screen name="BusinessScanner" component={BusinessScannerScreen} />
                    <Stack.Screen name="UserList" component={UserListScreen} />
                    <Stack.Screen name="Inbox" component={InboxScreen} />
                    <Stack.Screen name="Chat" component={ChatScreen} />
                    <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
                    <Stack.Screen name="PostDetail" component={PostDetailScreen} />
                    <Stack.Screen name="SoundDetails" component={SoundDetailsScreen} />
                    <Stack.Screen name="CreateReel" component={CreateReelScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="StoryComposer" component={StoryComposerScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="HighlightViewer" component={HighlightViewerScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="StoryViewers" component={StoryViewersScreen} />
                    <Stack.Screen name="HashtagFeed" component={HashtagFeedScreen} />
                    <Stack.Screen name="Activity" component={ActivityScreen} />
                    <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
                    <Stack.Screen name="SocialPrivacy" component={SocialPrivacyScreen} />
                    <Stack.Screen name="MyDrafts" component={MyDraftsScreen} />
                    <Stack.Screen name="EventMatching" component={EventMatchingScreen} />
                    <Stack.Screen name="Communities" component={CommunitiesScreen} />
                    <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
                    <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
                    <Stack.Screen name="CommunitySettings" component={CommunitySettingsScreen} />
                    <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
                    <Stack.Screen name="Games" component={GamesScreen} />
                    <Stack.Screen name="MapExplorer" component={MapExplorerScreen} />
                    <Stack.Screen name="CommercialProfile" component={CommercialProfileScreen} />
                    <Stack.Screen name="AnalyticsDashboard" component={AnalyticsDashboardScreen} />
                    <Stack.Screen name="InfluencerBonuses" component={InfluencerBonusesScreen} />
                </Stack.Navigator>
                {/* Hermano del navigator: el modal de ingreso a comunidades se
                    abre desde un deep link, antes de que ninguna pantalla esté
                    montada, y `Sheet` usa un `<Modal>` de RN que se pinta por
                    encima del stack entero. */}
                <CommunityJoinHost />
            </View>
        </NavigationContainer>
    );
};

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error('Missing EXPO_PUBLIC_CONVEX_URL. Configure .env.local or build-time env vars.');
}

const convex = new ConvexReactClient(convexUrl, {
    unsavedChangesWarning: false,
});

function StripeKeyGate() {
    const { stripePublishableKey } = usePaymentMode();
    return (
        <>
            {stripePublishableKey ? (
                /* 
                 * PROVIDER TREE
                 * E-017: CartProvider envuelve a AuthProvider por sessionTokenStore
                 * Payment -> Toast -> Cart -> Auth -> Favorites -> Escrow -> Rewards -> AppNavigator
                 */
                <PaymentProvider key={stripePublishableKey} stripePublishableKey={stripePublishableKey}>
                                    <ToastProvider>
                                        <ConfirmProvider>
                                            <CartProvider>
                                                <AuthProvider>
                                                    <SessionGuard>
                                                    <I18nProvider>
                                                    <NotificationsProvider>

                                                        <EscrowProvider>
                                                            <PointsProvider>
                                                                <RewardsProvider>
                                                                    <AppNavigator />
                                                                    <EscrowSheet />
                                                                </RewardsProvider>
                                                            </PointsProvider>
                                                        </EscrowProvider>

                                                    </NotificationsProvider>
                                                    </I18nProvider>
                                                    </SessionGuard>
                                                </AuthProvider>
                                            </CartProvider>
                                        </ConfirmProvider>
                                    </ToastProvider>
                                </PaymentProvider>
            ) : (
                <Text style={{ marginTop: 100, textAlign: 'center' }}>
                    Falta configurar EXPO_PUBLIC_STRIPE_KEY_TEST o EXPO_PUBLIC_STRIPE_KEY_LIVE en .env.local
                </Text>
            )}
        </>
    );
}

function App() {
    return (
        <CrashHandler>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    <ThemeProvider>
                        <SafeAreaProvider>
                            <ConvexProvider client={convex}>
                                <PaymentModeProvider>
                                    <StripeKeyGate />
                                </PaymentModeProvider>
                            </ConvexProvider>
                        </SafeAreaProvider>
                    </ThemeProvider>
                </View>
            </GestureHandlerRootView>
        </CrashHandler>
    );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
// Rebuild trigger to clear stale SellerCatalogScreen reference
