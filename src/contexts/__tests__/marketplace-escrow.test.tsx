import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import {
    MarketplaceProvider,
    useMarketplace,
    MARKETPLACE_ESCROW_RELEASE_DAYS,
} from '../MarketplaceContext';

// MarketplaceContext depends on AuthContext; mock it to keep test focused.
jest.mock('../AuthContext', () => ({
    useAuth: () => ({ user: { id: 'buyer_test', name: 'Buyer Test', role: 'user' } }),
}));

const TestComponent = ({ callback }: { callback: (marketplace: any) => void }) => {
    const marketplace = useMarketplace();
    React.useEffect(() => {
        callback(marketplace);
    });
    return null;
};

describe('Marketplace escrow (Sprint 3)', () => {
    it('uses 10 days as escrow release window', () => {
        expect(MARKETPLACE_ESCROW_RELEASE_DAYS).toBe(10);
    });

    it('does not contain hardcoded "15 días" in MarketplaceContext escrow module', () => {
        const filePath = path.join(__dirname, '..', 'MarketplaceContext.tsx');
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).not.toMatch(/15\s*d[ií]as/i);
        expect(content).not.toMatch(/15\s*days/i);
    });

    it('schedules escrow release at now + 10 days when confirming delivery', async () => {
        jest.useFakeTimers();
        const now = new Date('2026-01-14T12:00:00.000Z');
        jest.setSystemTime(now);

        let marketplace: any;
        render(
            <MarketplaceProvider>
                <TestComponent callback={(val) => (marketplace = val)} />
            </MarketplaceProvider>
        );

        await waitFor(() => expect(marketplace).toBeDefined());

        await act(async () => {
            const result = marketplace.confirmDelivery('order_demo_002');
            expect(result.success).toBe(true);
        });

        const updated = marketplace.orders.find((o: any) => o.id === 'order_demo_002');
        expect(updated).toBeTruthy();
        expect(updated.escrow.state).toBe('release_scheduled');

        const releaseAt = new Date(updated.escrow.releaseScheduledAt).getTime();
        const expected = new Date(now.getTime() + MARKETPLACE_ESCROW_RELEASE_DAYS * 24 * 60 * 60 * 1000).getTime();
        expect(releaseAt).toBe(expected);
    });
});

