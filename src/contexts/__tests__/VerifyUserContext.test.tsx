import React from 'react';
import { render, waitFor, act, renderHook } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthContext';
import { mockConvexStore } from '../../services/auth/mockConvexStore';

// Mock ToastContext since AuthProvider uses it
jest.mock('../ToastContext', () => ({
    useToast: () => ({ show: jest.fn() }),
}));

// Mock Navigation/Router if needed (not needed for Context verification usually)
// But we might need to mock storage if AuthProvider uses it (it uses storageAdapter)
jest.mock('../../services/auth/storageAdapter', () => ({
    storage: {
        getItem: jest.fn(() => Promise.resolve(null)),
        setItem: jest.fn(() => Promise.resolve()),
        removeItem: jest.fn(() => Promise.resolve()),
    },
}));

describe('AuthContext Verification Flow', () => {
    beforeEach(async () => {
        // Reset store
        await mockConvexStore.init();
        await mockConvexStore.deleteAccount('test_user_id'); // ensure clean slate if possible, or just ignore
        // Actually mockConvexStore is a singleton module. 
        // We can't easily reset it perfectly unless we add a reset method or rely on random IDs.
    });

    it('updates user context when KYC status changes', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

        // 1. Initial State
        await waitFor(() => expect(result.current.status).not.toBe('loading'));

        // 2. SignUp new user
        let signUpRes;
        await act(async () => {
            signUpRes = await result.current.signUpWithEmail({
                email: `val_test_${Date.now()}@example.com`,
                password: 'password123',
                name: 'Val Test',
                role: 'consumer'
            });
        });

        // 3. Verify Email to get authenticated
        await act(async () => {
            await result.current.verifyEmailCode('111111');
        });

        await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
        const userId = result.current.user?.id;
        expect(userId).toBeDefined();

        // 4. Check initial KYC status
        expect(result.current.user?.kycStatus).toBe('unverified');

        // 5. Submit KYC (changes to pending)
        await act(async () => {
            await result.current.markKycSubmitted({ doc: 'test' });
        });

        expect(result.current.user?.kycStatus).toBe('pending');

        // 6. Admin Approves (Debug/Mock Store manipulation)
        await act(async () => {
            if (userId) {
                await mockConvexStore.updateKycStatus(userId, 'approved');
                // Context needs to refresh to see the change?
                // `markKycSubmitted` updates local state, but `updateKycStatus` is backend side.
                // We must trigger `refreshActiveSession`.
                await result.current.refreshActiveSession();
            }
        });

        // 7. Verify Context Updated
        await waitFor(() => {
            expect(result.current.user?.kycStatus).toBe('approved');
        });
    });
});
