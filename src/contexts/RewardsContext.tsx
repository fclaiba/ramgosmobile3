import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const RewardsContext = createContext<any>(null);

const DEFAULT_REWARDS = {
    gameCoins: 100,
    petConfig: { activeHat: 'none', unlockedHats: ['none'] },
    addGameCoins: () => {},
    spendGameCoins: () => false,
    feedVirtualPet: () => Promise.resolve({ status: 'error', message: 'No auth' }),
    sleepVirtualPet: () => Promise.resolve({ status: 'error', message: 'No auth' }),
    registerArcadeReward: () => ({ status: 'error' }),
    unlockAccessory: () => Promise.resolve(false),
    equipAccessory: () => {},
    getLuckyWheelStatus: () => ({ available: false }),
    spinLuckyWheel: () => ({ status: 'error', message: 'No auth' }),
    quarterlyMission: { claimed: false, reward: 150, purchasesCurrent: 0, purchasesTarget: 3 }
};

export function RewardsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    // Hooks siempre al mismo nivel, nunca después de un return condicional
    const economyState = useQuery(
        api.economy.getEconomyState,
        user?.id ? { userId: user.id } : 'skip'
    );

    const feedVirtualPetMutation = useMutation(api.economy.feedVirtualPet);
    const sleepVirtualPetMutation = useMutation(api.economy.sleepVirtualPet);
    const addCoinsMutation = useMutation(api.economy.addCoins);
    const unlockAccessoryMutation = useMutation(api.economy.unlockAccessory);
    const equipAccessoryMutation = useMutation(api.economy.equipAccessory);

    // Sin usuario autenticado → defaults
    if (!user?.id) {
        return (
            <RewardsContext.Provider value={DEFAULT_REWARDS}>
                {children}
            </RewardsContext.Provider>
        );
    }

    const gameCoins = economyState?.gameCoins ?? 100;
    const petConfig = economyState?.petConfig ?? { activeHat: 'none', unlockedHats: ['none'] };

    const addGameCoins = (amount: number) => {
        addCoinsMutation({ userId: user.id, amount, reason: 'Arcade/Manual' }).catch(console.error);
    };

    const spendGameCoins = (amount: number) => {
        if (gameCoins >= amount) return true;
        return false;
    };

    const feedVirtualPet = async () => {
        try { return await feedVirtualPetMutation({ userId: user.id }); }
        catch { return { status: 'error', message: 'Error de conexión' }; }
    };

    const sleepVirtualPet = async () => {
        try { return await sleepVirtualPetMutation({ userId: user.id }); }
        catch { return { status: 'error', message: 'Error de conexión' }; }
    };

    const registerArcadeReward = (gameId: string, score: number) => {
        const reward = Math.floor(score / 10);
        addGameCoins(reward);
        return { status: 'awarded', pointsAwarded: reward };
    };

    const unlockAccessory = async (type: string, id: string, cost: number) => {
        try { return await unlockAccessoryMutation({ userId: user.id, type, id, cost }); }
        catch { return false; }
    };

    const equipAccessory = (type: string, id: string) => {
        equipAccessoryMutation({ userId: user.id, type, id }).catch(console.error);
    };

    const getLuckyWheelStatus = () => ({ available: true });
    const spinLuckyWheel = () => ({ status: 'awarded', message: '¡Ganaste 10 Monedas!' });
    const quarterlyMission = { claimed: false, reward: 150, purchasesCurrent: 0, purchasesTarget: 3 };

    return (
        <RewardsContext.Provider value={{
            gameCoins,
            addGameCoins,
            spendGameCoins,
            petConfig,
            unlockAccessory,
            equipAccessory,
            feedVirtualPet,
            registerArcadeReward,
            sleepVirtualPet,
            getLuckyWheelStatus,
            spinLuckyWheel,
            quarterlyMission
        }}>
            {children}
        </RewardsContext.Provider>
    );
}

export function useRewards() {
    const context = useContext(RewardsContext);
    return context ?? DEFAULT_REWARDS;
}