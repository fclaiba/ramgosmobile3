import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import CheckoutScreen from '../../screens/marketplace/CheckoutScreen';
import { SUBSCRIPTION_PLANS } from '../../config/subscriptionPlans';

jest.useFakeTimers();

const mockUpdateSubscription = jest.fn(() => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        updateSubscription: mockUpdateSubscription,
        user: { id: 'u1', role: 'consumer', subscriptionTier: 'free', subscriptionStatus: 'inactive' },
    }),
}));

jest.mock('../../contexts/CartContext', () => ({
    useCart: () => ({
        items: [
            {
                id: 'sub-pro-1',
                name: 'Membresía Usuario PRO',
                price: 2.99,
                quantity: 1,
                image: 'x',
                type: 'subscription',
                subscriptionTier: 'pro',
            },
        ],
        totalPrice: 2.99,
        clearCart: jest.fn(),
    }),
}));

jest.mock('../../contexts/MarketplaceContext', () => ({
    useMarketplace: () => ({
        placeOrder: () => ({ success: true, orders: [] }),
    }),
}));

jest.mock('../../contexts/PointsContext', () => ({
    usePoints: () => ({
        points: 0,
        getAvailableDiscounts: () => [],
        redeemPoints: jest.fn(() => true),
    }),
}));

jest.mock('../../contexts/WalletContext', () => ({
    useWallet: () => ({
        processCheckoutTransaction: jest.fn(),
    }),
}));

jest.mock('../../contexts/ThemeContext', () => ({
    useTheme: () => ({ colorScheme: 'light' }),
}));

jest.mock('../../contexts/ToastContext', () => ({
    useToast: () => ({ show: jest.fn() }),
}));

jest.mock('../../components/MobileHeader', () => ({
    MobileHeader: () => null,
}));

describe('Sprint 2 - Subscriptions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calls AuthContext.updateSubscription when subscription checkout completes', async () => {
        const navigation = { goBack: jest.fn(), navigate: jest.fn() };

        const screen = render(<CheckoutScreen navigation={navigation} />);

        fireEvent.changeText(screen.getByPlaceholderText('Número de Tarjeta'), '4242424242424242');

        await act(async () => {
            fireEvent.press(screen.getByText('Confirmar Pago'));
            jest.advanceTimersByTime(2000);
            // flush microtasks after timers
            await Promise.resolve();
        });

        expect(mockUpdateSubscription).toHaveBeenCalledTimes(1);
        expect(mockUpdateSubscription).toHaveBeenCalledWith('pro', 'active');
    });

    it('keeps pricing as a single source of truth', () => {
        expect(SUBSCRIPTION_PLANS.pro.priceMonthlyUsd).toBe(2.99);
        expect(SUBSCRIPTION_PLANS.business.priceMonthlyUsd).toBe(5.99);

        const subscriptionPlansScreenPath = path.join(
            __dirname,
            '../../screens/SubscriptionPlansScreen.tsx',
        );
        const content = fs.readFileSync(subscriptionPlansScreenPath, 'utf8');
        expect(content).not.toMatch(/2\.99/);
        expect(content).not.toMatch(/5\.99/);
    });
});

