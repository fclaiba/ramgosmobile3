import React from 'react';
import './global.css';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/contexts/AuthContext';
import { FintechProvider } from './src/contexts/FintechContext';
import { MarketplaceProvider } from './src/contexts/MarketplaceContext';
import { BusinessProvider } from './src/contexts/BusinessContext';

import WelcomeScreen from './src/screens/WelcomeScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import KYCScreen from './src/screens/KYCScreen';
import TermsScreen from './src/screens/TermsScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';

import SocialScreen from './src/screens/SocialScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';

const Stack = createNativeStackNavigator();

import { CartProvider } from './src/contexts/CartContext';
import { SocialProvider } from './src/contexts/SocialContext';
import { PointsProvider } from './src/contexts/PointsContext';
import { RewardsProvider } from './src/contexts/RewardsContext';
import { FavoritesProvider } from './src/contexts/FavoritesContext';
import MiMascotaScreen from './src/screens/MiMascotaScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SavedScreen from './src/screens/SavedScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HelpCenterScreen from './src/screens/HelpCenterScreen';
import SupportScreen from './src/screens/SupportScreen';
import AboutScreen from './src/screens/AboutScreen';
import BusinessDashboardScreen from './src/screens/BusinessDashboardScreen';
import BusinessCreateScreen from './src/screens/BusinessCreateScreen';
import CreateListingScreen from './src/screens/CreateListingScreen';
import BusinessKYCScreen from './src/screens/business/BusinessKYCScreen';
import BusinessQRScannerScreen from './src/screens/business/BusinessQRScannerScreen';
import BusinessProfileScreen from './src/screens/business/BusinessProfileScreen';
import InfluencerDashboardScreen from './src/screens/InfluencerDashboardScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';
// CartScreen removed from stack, so removing import
import PaymentScreen from './src/screens/PaymentScreen';
import DisputeScreen from './src/screens/marketplace/DisputeScreen';
import BannedUserScreen from './src/screens/BannedUserScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import BasicProfileSetupScreen from './src/screens/BasicProfileSetupScreen';

import AddEditProductScreen from './src/screens/marketplace/AddEditProductScreen';
import ProductDetailScreen from './src/screens/marketplace/ProductDetailScreen';
import CartScreen from './src/screens/marketplace/CartScreen';
import CheckoutScreen from './src/screens/marketplace/CheckoutScreen';
import OrderHistoryScreen from './src/screens/marketplace/OrderHistoryScreen';
import OrderDetailScreen from './src/screens/marketplace/OrderDetailScreen';
import DisputeReasonScreen from './src/screens/marketplace/DisputeReasonScreen';
import DisputeChatScreen from './src/screens/marketplace/DisputeChatScreen';
import SellerWalletScreen from './src/screens/marketplace/SellerWalletScreen';
import WithdrawalScreen from './src/screens/WithdrawalScreen';

import NotificationsScreen from './src/screens/NotificationsScreen';
import { NotificationsProvider } from './src/contexts/NotificationsContext';

import CartSidebar from './src/components/CartSidebar'; // New import

// MapExplorerScreen removed - integrated into Marketplace
import PublicBusinessProfileScreen from './src/screens/BusinessProfileScreen';
import BonusQRScreen from './src/screens/BonusQRScreen';
import BusinessScannerScreen from './src/screens/BusinessScannerScreen';

export default function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <PointsProvider>
                    <FintechProvider>
                        <AuthProvider>
                            <RewardsProvider>
                                <BusinessProvider>
                                    <MarketplaceProvider>
                                        <CartProvider>
                                            <FavoritesProvider>
                                                <NotificationsProvider>
                                                    <SocialProvider>
                                                        <NavigationContainer linking={{
                                                            prefixes: ['ramgos://', 'https://ramgos.app'],
                                                            config: {
                                                                screens: {
                                                                    Register: 'register',
                                                                    Login: 'login',
                                                                }
                                                            }
                                                        }}>
                                                            <StatusBar style="dark" />
                                                            <View style={{ flex: 1 }}>
                                                                <Stack.Navigator
                                                                    initialRouteName="Welcome"
                                                                    screenOptions={{
                                                                        headerShown: false,
                                                                        contentStyle: { backgroundColor: '#fff' },
                                                                        animation: 'slide_from_right',
                                                                    }}
                                                                >
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
                                                                    <Stack.Screen name="CreateListing" component={AddEditProductScreen} />
                                                                    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
                                                                    <Stack.Screen name="Cart" component={CartScreen} />
                                                                    <Stack.Screen name="Checkout" component={CheckoutScreen} />
                                                                    <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
                                                                    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
                                                                    <Stack.Screen name="DisputeReason" component={DisputeReasonScreen} />
                                                                    <Stack.Screen name="DisputeChat" component={DisputeChatScreen} />
                                                                    <Stack.Screen name="SellerWallet" component={SellerWalletScreen} />
                                                                    <Stack.Screen name="MiMascota" component={MiMascotaScreen} />
                                                                    <Stack.Screen name="Profile" component={ProfileScreen} />
                                                                    <Stack.Screen name="Saved" component={SavedScreen} />
                                                                    <Stack.Screen name="History" component={HistoryScreen} />
                                                                    <Stack.Screen name="Settings" component={SettingsScreen} />
                                                                    <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
                                                                    <Stack.Screen name="Support" component={SupportScreen} />
                                                                    <Stack.Screen name="About" component={AboutScreen} />
                                                                    <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
                                                                    <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
                                                                    <Stack.Screen name="BannedUser" component={BannedUserScreen} options={{ gestureEnabled: false }} />
                                                                    <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
                                                                    <Stack.Screen name="BasicProfileSetup" component={BasicProfileSetupScreen} />
                                                                    <Stack.Screen name="BusinessCreate" component={BusinessCreateScreen} />

                                                                    <Stack.Screen name="BusinessKYC" component={BusinessKYCScreen} />
                                                                    <Stack.Screen name="BusinessQRScanner" component={BusinessQRScannerScreen} />
                                                                    <Stack.Screen name="InfluencerDashboard" component={InfluencerDashboardScreen} />
                                                                    <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
                                                                    <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
                                                                    <Stack.Screen name="Payment" component={PaymentScreen} />
                                                                    <Stack.Screen name="Dispute" component={DisputeScreen} />
                                                                    <Stack.Screen name="Withdrawal" component={WithdrawalScreen} />

                                                                    {/* Maps & QR Module */}
                                                                    {/* MapExplorer integrated into Marketplace */}
                                                                    <Stack.Screen name="BusinessDetail" component={PublicBusinessProfileScreen} />
                                                                    <Stack.Screen name="BonusQR" component={BonusQRScreen} />
                                                                    <Stack.Screen name="BusinessScanner" component={BusinessScannerScreen} />
                                                                </Stack.Navigator>
                                                                <CartSidebar />
                                                            </View>
                                                        </NavigationContainer>
                                                    </SocialProvider>
                                                </NotificationsProvider>
                                            </FavoritesProvider>
                                        </CartProvider>
                                    </MarketplaceProvider>
                                </BusinessProvider>
                            </RewardsProvider>
                        </AuthProvider>
                    </FintechProvider>
                </PointsProvider>
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
