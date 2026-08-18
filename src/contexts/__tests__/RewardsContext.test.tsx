import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { RewardsProvider, useRewards } from '../RewardsContext';
import { PointsProvider } from '../PointsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock Points context to avoid complex dependencies
jest.mock('../PointsContext', () => ({
    usePoints: () => ({
        // `addPoints` salió del contexto: los puntos los acredita el servidor.
        challengeProgress: { loginStreak: 5 },
        gameCoins: 100,
        addGameCoins: jest.fn(),
        spendGameCoins: jest.fn(async () => true),
        unlockHat: jest.fn(async () => true),
        equipHat: jest.fn(async () => {}),
        wheelClaimDate: null,
        spinLuckyWheel: jest.fn(async () => ({
            success: true,
            pointsAwarded: 25,
            message: '¡Ganaste 25 puntos!',
        })),
    }),
    PointsProvider: ({ children }: any) => children,
}));

// Mock Toast context (RewardsContext uses useToast internally)
jest.mock('../ToastContext', () => ({
    useToast: () => ({ show: jest.fn() }),
    ToastProvider: ({ children }: any) => children,
}));

// Mock Auth context
jest.mock('../AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'test_user', kycStatus: 'approved' },
        sessionToken: 'ses_test',
    }),
    AuthProvider: ({ children }: any) => <>{children}</>
}));

jest.mock('convex/react', () => ({
    useMutation: () => jest.fn(async () => ({ success: true })),
    useQuery: () => undefined,
}));

// Helper component to access hook
const TestComponent = ({ callback }: { callback: (rewards: any) => void }) => {
    const rewards = useRewards();
    React.useEffect(() => {
        callback(rewards);
    });
    return null;
};

describe('RewardsContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    });

    it('initializes with default state', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <RewardsProvider>
                    <TestComponent callback={(val) => (rewards = val)} />
                </RewardsProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        expect(rewards.dailyState.petFed).toBe(false);
        expect(rewards.dailyState.arcadeRewardsClaimed).toBe(0);
        expect(rewards.gameCoins).toBe(100); // Initial bonus
    });

    it('feeds virtual pet and awards points', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <RewardsProvider>
                    <TestComponent callback={(val) => (rewards = val)} />
                </RewardsProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        let result: any;
        await act(async () => {
            result = rewards.feedVirtualPet();
        });

        expect(result?.status).toBe('awarded');
        expect(result?.pointsAwarded).toBe(5);
        expect(rewards.dailyState.petFed).toBe(true);

        // Try feeding again should fail
        await act(async () => {
            result = rewards.feedVirtualPet();
        });
        expect(result?.status).toBe('already_claimed');
    });

    it('limits arcade rewards to 3 per day', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <RewardsProvider>
                    <TestComponent callback={(val) => (rewards = val)} />
                </RewardsProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        // Play 3 times
        for (let i = 0; i < 3; i++) {
            await act(async () => {
                const res = rewards.registerArcadeReward('game_1', 100);
                expect(res.status).toBe('awarded');
            });
        }

        // 4th time should fail
        let lastResult: any;
        await act(async () => {
            lastResult = rewards.registerArcadeReward('game_1', 100);
        });

        expect(lastResult?.status).toBe('limit_reached');
        expect(rewards.getArcadeStatus().remaining).toBe(0);
    });

    it('awards lucky wheel points within 5–100 and only once per day', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <RewardsProvider>
                    <TestComponent callback={(val) => (rewards = val)} />
                </RewardsProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        let firstResult: any;
        await act(async () => {
            firstResult = await rewards.spinLuckyWheel();
        });

        expect(firstResult.status).toBe('awarded');
        expect(firstResult.pointsAwarded).toBeGreaterThanOrEqual(5);
        expect(firstResult.pointsAwarded).toBeLessThanOrEqual(100);
    });
});
