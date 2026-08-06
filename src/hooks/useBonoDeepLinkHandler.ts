import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { parseBonoDeepLink } from '../utils/bonoDeepLink';

type Nav = NavigationContainerRef<Record<string, object | undefined>>;

/**
 * Listens for bono share / scheme URLs and navigates to ItemDetail
 * with listing id + referralCode.
 */
export function useBonoDeepLinkHandler(navigationRef: React.RefObject<Nav | null>) {
    const handledInitial = useRef(false);

    useEffect(() => {
        const open = (url: string | null) => {
            const parsed = parseBonoDeepLink(url);
            if (!parsed?.listingId) return;

            const tryNavigate = () => {
                if (!navigationRef.current?.isReady()) return false;
                navigationRef.current.navigate('ItemDetail', {
                    itemId: parsed.listingId,
                    referralCode: parsed.referralCode || undefined,
                });
                return true;
            };

            if (!tryNavigate()) {
                setTimeout(() => {
                    tryNavigate();
                }, 400);
            }
        };

        const onUrl = ({ url }: { url: string }) => {
            open(url);
        };

        const sub = Linking.addEventListener('url', onUrl);

        if (!handledInitial.current) {
            handledInitial.current = true;
            Linking.getInitialURL().then((url) => {
                if (url) open(url);
            });

            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                open(window.location.href);
            }
        }

        return () => {
            sub.remove();
        };
    }, [navigationRef]);
}
