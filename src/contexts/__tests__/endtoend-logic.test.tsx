import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PointsProvider, usePoints } from '../PointsContext';
import { RewardsProvider, useRewards } from '../RewardsContext';

// Mock AsyncStorage (RewardsContext persists daily/streak state)
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock Toast context (RewardsContext uses useToast internally)
jest.mock('../ToastContext', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

const TestHarness = ({ callback }: { callback: (api: any) => void }) => {
  const points = usePoints();
  const rewards = useRewards();
  React.useEffect(() => {
    callback({ points, rewards });
  });
  return null;
};

describe('End-to-end logic (Sprint 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('awards purchase points (1:$1) and advances quarterly mission counter', async () => {
    let api: any;
    render(
      <PointsProvider>
        <RewardsProvider>
          <TestHarness callback={(val) => (api = val)} />
        </RewardsProvider>
      </PointsProvider>
    );

    await waitFor(() => expect(api).toBeDefined());

    const beforePoints = api.points.points;
    const beforeMission = api.rewards.quarterlyMission.purchasesCurrent;

    await act(async () => {
      api.points.trackPurchase(25);
      api.rewards.registerQuarterlyPurchase();
    });

    expect(api.points.points).toBe(beforePoints + 25);
    expect(api.rewards.quarterlyMission.purchasesCurrent).toBe(beforeMission + 1);
  });
});

