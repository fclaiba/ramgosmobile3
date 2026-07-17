import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuth } from '../../contexts/AuthContext';
import { STRIPE_TEST_CARDS, type TestCard } from '../testCards';

const STORAGE_KEY = '@ramgos_saved_payment_methods';

export type SavedPaymentMethod = {
    id: string;
    brand: string;
    last4: string;
    label: string;
    expMonth?: number;
    expYear?: number;
    isDefault: boolean;
    source: 'local' | 'stripe';
};

type StoredPayload = {
    cards: SavedPaymentMethod[];
};

function brandLabel(brand: string) {
    const b = (brand || 'card').toLowerCase();
    if (b === 'mastercard') return 'Mastercard';
    if (b === 'amex' || b === 'american express') return 'Amex';
    if (b === 'visa') return 'Visa';
    return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function mapStripePm(pm: any, defaultId?: string): SavedPaymentMethod {
    const card = pm.card || {};
    return {
        id: pm.id,
        brand: card.brand || 'card',
        last4: card.last4 || '••••',
        label: brandLabel(card.brand || 'card'),
        expMonth: card.exp_month,
        expYear: card.exp_year,
        isDefault: !!defaultId && pm.id === defaultId,
        source: 'stripe',
    };
}

async function loadLocal(): Promise<SavedPaymentMethod[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as StoredPayload;
        return Array.isArray(parsed.cards) ? parsed.cards : [];
    } catch {
        return [];
    }
}

async function saveLocal(cards: SavedPaymentMethod[]) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ cards } satisfies StoredPayload));
}

export function useSavedPaymentMethods() {
    const { user, sessionToken } = useAuth();
    const listPaymentMethods = useAction(api.stripe.listPaymentMethods);
    const detachPaymentMethod = useAction(api.stripe.detachPaymentMethod);
    const setDefaultPaymentMethod = useAction(api.stripe.setDefaultPaymentMethod);

    const [cards, setCards] = useState<SavedPaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            let remote: SavedPaymentMethod[] = [];
            if (user?.id && sessionToken) {
                try {
                    const data = await listPaymentMethods({
                        sessionToken,
                        userId: user.id,
                    });
                    remote = (data || []).map((pm: any) => mapStripePm(pm));
                } catch {
                    remote = [];
                }
            }

            const local = await loadLocal();
            if (remote.length > 0) {
                // Prefer Stripe; keep local-only cards that aren't mirrored.
                const remoteIds = new Set(remote.map((c) => c.id));
                const merged = [
                    ...remote,
                    ...local.filter((c) => c.source === 'local' && !remoteIds.has(c.id)),
                ];
                if (!merged.some((c) => c.isDefault) && merged.length > 0) {
                    merged[0] = { ...merged[0], isDefault: true };
                }
                setCards(merged);
                await saveLocal(merged.filter((c) => c.source === 'local'));
            } else {
                if (local.length === 0) {
                    // Seed two test cards so Profile badge "2" matches a usable wallet.
                    const seeded: SavedPaymentMethod[] = [
                        {
                            id: `local_${STRIPE_TEST_CARDS[0].id}`,
                            brand: STRIPE_TEST_CARDS[0].brand,
                            last4: STRIPE_TEST_CARDS[0].last4,
                            label: STRIPE_TEST_CARDS[0].label,
                            expMonth: 12,
                            expYear: 2034,
                            isDefault: true,
                            source: 'local',
                        },
                        {
                            id: `local_${STRIPE_TEST_CARDS[2].id}`,
                            brand: STRIPE_TEST_CARDS[2].brand,
                            last4: STRIPE_TEST_CARDS[2].last4,
                            label: STRIPE_TEST_CARDS[2].label,
                            expMonth: 12,
                            expYear: 2034,
                            isDefault: false,
                            source: 'local',
                        },
                    ];
                    await saveLocal(seeded);
                    setCards(seeded);
                } else {
                    setCards(local);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [user?.id, sessionToken, listPaymentMethods]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const addFromTestCard = useCallback(async (testCard: TestCard) => {
        const id = `local_${testCard.id}_${Date.now()}`;
        setCards((prev) => {
            const next: SavedPaymentMethod[] = [
                ...prev,
                {
                    id,
                    brand: testCard.brand,
                    last4: testCard.last4,
                    label: testCard.label,
                    expMonth: 12,
                    expYear: 2034,
                    isDefault: prev.length === 0,
                    source: 'local',
                },
            ];
            saveLocal(next.filter((c) => c.source === 'local')).catch(() => {});
            return next;
        });
        return id;
    }, []);

    const removeCard = useCallback(
        async (card: SavedPaymentMethod) => {
            setBusyId(card.id);
            try {
                if (card.source === 'stripe' && sessionToken) {
                    await detachPaymentMethod({ sessionToken, paymentMethodId: card.id });
                }
                setCards((prev) => {
                    let next = prev.filter((c) => c.id !== card.id);
                    if (card.isDefault && next.length > 0) {
                        next = next.map((c, i) => ({ ...c, isDefault: i === 0 }));
                    }
                    saveLocal(next.filter((c) => c.source === 'local')).catch(() => {});
                    return next;
                });
            } finally {
                setBusyId(null);
            }
        },
        [detachPaymentMethod, sessionToken],
    );

    const setDefault = useCallback(
        async (card: SavedPaymentMethod) => {
            setBusyId(card.id);
            try {
                if (card.source === 'stripe' && sessionToken) {
                    await setDefaultPaymentMethod({ sessionToken, paymentMethodId: card.id });
                }
                setCards((prev) => {
                    const next = prev.map((c) => ({ ...c, isDefault: c.id === card.id }));
                    saveLocal(next.filter((c) => c.source === 'local')).catch(() => {});
                    return next;
                });
            } finally {
                setBusyId(null);
            }
        },
        [sessionToken, setDefaultPaymentMethod],
    );

    return {
        cards,
        loading,
        busyId,
        refresh,
        addFromTestCard,
        removeCard,
        setDefault,
        testCatalog: STRIPE_TEST_CARDS,
        count: cards.length,
    };
}
