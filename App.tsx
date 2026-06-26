import React from 'react';
import './global.css';
import { View, StyleSheet, Text } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useTheme, ThemeProvider } from './src/contexts/ThemeContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CartProvider } from './src/contexts/CartContext';
import { SocialProvider } from './src/contexts/SocialContext';
import { PointsProvider } from './src/contexts/PointsContext';
import { WalletProvider } from './src/contexts/WalletContext';
import { RewardsProvider } from './src/contexts/RewardsContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { FintechProvider } from './src/contexts/FintechContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { BusinessProvider } from './src/contexts/BusinessContext';
import { MarketplaceProvider } from './src/contexts/MarketplaceContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { ReferralProvider } from './src/contexts/ReferralContext';
import { EscrowProvider } from './src/contexts/EscrowContext';
import { EscrowSheet } from './src/components/marketplace/EscrowSheet';
import CartSidebar from './src/components/CartSidebar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PointsFeedback } from './src/components/ui/PointsFeedback';

import { Platform } from 'react-native';

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
import BasicProfileSetupScreen from './src/screens/BasicProfileSetupScreen';
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
import AddEditProductScreen from './src/screens/marketplace/AddEditProductScreen';
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
import PublicBusinessProfileScreen from './src/screens/BusinessProfileScreen';
import BusinessKYCScreen from './src/screens/business/BusinessKYCScreen';
import BusinessQRScannerScreen from './src/screens/business/BusinessQRScannerScreen';
import UserListScreen from './src/screens/social/UserListScreen';
import GamesScreen from './src/screens/GamesScreen';
import MapExplorerScreen from './src/screens/MapExplorerScreen';
import CommercialProfileScreen from './src/screens/CommercialProfileScreen';
import AnalyticsDashboardScreen from './src/screens/AnalyticsDashboardScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';

    const MyDarkTheme = {
        ...DarkTheme,
        colors: {
            ...DarkTheme.colors,
            background: '#111827',
            card: '#1F2937',
            text: '#F9FAFB',
            border: '#374151',
        },
    };

    const MyLightTheme = {
        ...DefaultTheme,
        colors: {
            ...DefaultTheme.colors,
            background: '#ffffff',
        },
    };

    return (
        <NavigationContainer
            theme={isDark ? MyDarkTheme : MyLightTheme}
            linking={{
                prefixes: ['ramgos://', 'https://ramgos.app'],
                config: {
                    screens: {
                        Register: 'register',
                        Login: 'login',
                    }
                }
            }}>
            <StatusBar style={isDark ? "light" : "dark"} />
            <View style={{ flex: 1, backgroundColor: isDark ? '#111827' : '#fff' }}>
                <Stack.Navigator
                    initialRouteName="Welcome"
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: isDark ? '#111827' : '#fff' },
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
                    <Stack.Screen name="Register" component={RegisterScreen} />
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
                    <Stack.Screen name="BasicProfileSetup" component={BasicProfileSetupScreen} />
                    <Stack.Screen name="BusinessCreate" component={BusinessCreateScreen} />
                    <Stack.Screen name="VerifyBusiness" component={BusinessKYCScreen} />
                    <Stack.Screen name="Referrals" component={ReferralsScreen} />
                    <Stack.Screen name="BusinessQR" component={BusinessQRScannerScreen} />
                    <Stack.Screen name="InfluencerDashboard" component={InfluencerDashboardScreen} />
                    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
                    <Stack.Screen name="AdminFinance" component={AdminFinanceScreen} />
                    <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="Dispute" component={DisputeScreen} />
                    <Stack.Screen name="Withdrawal" component={WithdrawalScreen} />
                    <Stack.Screen name="MyListings" component={MyListingsScreen} />
                    <Stack.Screen name="AddEditProduct" component={AddEditProductScreen} />
                                        {/* Maps & QR Module */}
                    {/* MapExplorer integrated into Marketplace */}
                    <Stack.Screen name="BusinessDetail" component={PublicBusinessProfileScreen} />
                    <Stack.Screen name="BonusQR" component={BonusQRScreen} />
                    <Stack.Screen name="BusinessScanner" component={BusinessScannerScreen} />
                    <Stack.Screen name="UserList" component={UserListScreen} />
                    <Stack.Screen name="Games" component={GamesScreen} />
                    <Stack.Screen name="MapExplorer" component={MapExplorerScreen} />
                    <Stack.Screen name="CommercialProfile" component={CommercialProfileScreen} />
                    <Stack.Screen name="AnalyticsDashboard" component={AnalyticsDashboardScreen} />
                </Stack.Navigator>
                <CartSidebar />
                <EscrowSheet />
            </View>
        </NavigationContainer>
    );
};

import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error('Missing EXPO_PUBLIC_CONVEX_URL. Configure .env.local or build-time env vars.');
}

const convex = new ConvexReactClient(convexUrl, {
    unsavedChangesWarning: false,
});

import { PaymentProvider } from './src/payments/PaymentProvider';
import { CrashHandler } from './src/components/CrashHandler';

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_KEY;

function App() {
    console.log('[DEBUG] App: Rendering started');
    return (
        <CrashHandler>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.container}>
                    <ThemeProvider>
                        <SafeAreaProvider>
                            <ConvexProvider client={convex}>
                                {stripePublishableKey ? (
                                    <PaymentProvider stripePublishableKey={stripePublishableKey}>
                                        <ToastProvider>
                                            <AuthProvider>
                                                    <PointsProvider>
                                                        <WalletProvider>
                                                    <FintechProvider>
                                                        <RewardsProvider>
                                                            <BusinessProvider>
                                                                <MarketplaceProvider>
                                                                    <EscrowProvider>
                                                                        <CartProvider>
                                                                            <FavoritesProvider>
                                                                                <NotificationsProvider>
                                                                                    <SocialProvider>
                                                                                        <ReferralProvider>
                                                                                            <PointsFeedback />
                                                                                                <AppNavigator />
                                                                                        </ReferralProvider>
                                                                                    </SocialProvider>
                                                                                </NotificationsProvider>
                                                                            </FavoritesProvider>
                                                                        </CartProvider>
                                                                    </EscrowProvider>
                                                                </MarketplaceProvider>
                                                            </BusinessProvider>
                                                        </RewardsProvider>
                                                    </FintechProvider>
                                                </WalletProvider>
                                            </PointsProvider>
                                        </AuthProvider>
                                    </ToastProvider>
                                </PaymentProvider>
                                ) : (
                                    <Text style={{ marginTop: 100, textAlign: 'center' }}>
                                        Falta configurar EXPO_PUBLIC_STRIPE_KEY en .env.local
                                    </Text>
                                )}
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
