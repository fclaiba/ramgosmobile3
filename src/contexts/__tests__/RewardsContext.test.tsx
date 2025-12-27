import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { RewardsProvider, useRewards } from '../RewardsContext';
import { AuthProvider } from '../AuthContext';
import { PointsProvider } from '../PointsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock Auth and Points contexts to avoid complex dependencies
jest.mock('../AuthContext', () => ({
    useAuth: () => ({ user: { id: 'test-user-id' } }),
    AuthProvider: ({ children }: any) => children,
}));

jest.mock('../PointsContext', () => ({
    usePoints: () => ({
        addPoints: jest.fn(),
        challengeProgress: { loginStreak: 5 },
    }),
    PointsProvider: ({ children }: any) => children,
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
                <AuthProvider>
                    <RewardsProvider>
                        <TestComponent callback={(val) => (rewards = val)} />
                    </RewardsProvider>
                </AuthProvider>
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
                <AuthProvider>
                    <RewardsProvider>
                        <TestComponent callback={(val) => (rewards = val)} />
                    </RewardsProvider>
                </AuthProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        let result;
        await act(async () => {
            result = rewards.feedVirtualPet();
        });

        expect(result.status).toBe('awarded');
        expect(result.pointsAwarded).toBe(5);
        expect(rewards.dailyState.petFed).toBe(true);

        // Try feeding again should fail
        await act(async () => {
            result = rewards.feedVirtualPet();
        });
        expect(result.status).toBe('already_claimed');
    });

    it('limits arcade rewards to 3 per day', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <AuthProvider>
                    <RewardsProvider>
                        <TestComponent callback={(val) => (rewards = val)} />
                    </RewardsProvider>
                </AuthProvider>
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
        let lastResult;
        await act(async () => {
            lastResult = rewards.registerArcadeReward('game_1', 100);
        });

        expect(lastResult.status).toBe('limit_reached');
        expect(rewards.getArcadeStatus().remaining).toBe(0);
    });

    it('generates a referral code for the user', async () => {
        let rewards: any;
        render(
            <PointsProvider>
                <AuthProvider>
                    <RewardsProvider>
                        <TestComponent callback={(val) => (rewards = val)} />
                    </RewardsProvider>
                </AuthProvider>
            </PointsProvider>
        );

        await waitFor(() => expect(rewards).toBeDefined());

        expect(rewards.referralCode).toContain('RAMGOS');
        expect(rewards.referralLink).toContain('ramgos.app/r/');
    });
});
