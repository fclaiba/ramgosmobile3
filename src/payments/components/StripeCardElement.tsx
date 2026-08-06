import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { CardElement } from '@stripe/react-stripe-js';
import { Radius, colors } from '../../theme/tokens';

type Props = {
    isDark?: boolean;
};

/**
 * PCI-safe card input for web LIVE mode (Stripe Elements).
 * Link disabled — native card entry only.
 */
export function StripeCardElement({ isDark = false }: Props) {
    const c = colors(isDark);

    const elementOptions = {
        style: {
            base: {
                fontSize: '16px',
                fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                color: c.text,
                '::placeholder': { color: c.textSubtle },
                iconColor: c.primary,
            },
            invalid: {
                color: c.danger,
                iconColor: c.danger,
            },
        },
        hidePostalCode: true,
        disableLink: true,
    };

    return (
        <View
            style={[
                styles.shell,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    borderColor: c.border,
                    ...(Platform.OS === 'web'
                        ? ({
                              boxShadow: isDark
                                  ? 'inset 0 1px 0 rgba(255,255,255,0.06)'
                                  : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(24,24,27,0.04)',
                          } as object)
                        : null),
                },
            ]}
        >
            <CardElement options={elementOptions} />
        </View>
    );
}

const styles = StyleSheet.create({
    shell: {
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingVertical: 14,
        paddingHorizontal: 14,
        minHeight: 52,
        justifyContent: 'center',
    },
});
