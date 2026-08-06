import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Radius, Type, colors } from '../../theme/tokens';
import { glassTokens } from '../../utils/glass';

export type CardholderBilling = {
    fullName: string;
    /** Optional US ZIP — helps with AVS on US-issued cards; not required for international. */
    postalCode: string;
};

type Props = {
    value: CardholderBilling;
    onChange: (next: CardholderBilling) => void;
    isDark?: boolean;
};

/**
 * Billing for NY / international Stripe card checkout.
 * Name on card is enough; ZIP optional (US AVS). No AR DNI/CUIT.
 */
export function CardholderFields({ value, onChange, isDark = false }: Props) {
    const c = colors(isDark);
    const glass = glassTokens(isDark);

    return (
        <View style={styles.wrap}>
            <Text style={[styles.label, { color: c.text }]}>Name on card</Text>
            <TextInput
                value={value.fullName}
                onChangeText={(fullName) => onChange({ ...value, fullName })}
                placeholder="Full name as printed on the card"
                placeholderTextColor={c.textSubtle}
                autoCapitalize="words"
                autoCorrect={false}
                style={[
                    styles.input,
                    {
                        color: c.text,
                        borderColor: glass.border,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    },
                ]}
            />
            <Text style={[styles.label, { color: c.text }]}>ZIP / Postal (optional)</Text>
            <TextInput
                value={value.postalCode}
                onChangeText={(postalCode) =>
                    onChange({
                        ...value,
                        postalCode: postalCode.replace(/[^\dA-Za-z\s-]/g, '').slice(0, 12),
                    })
                }
                placeholder="e.g. 10001 (NY)"
                placeholderTextColor={c.textSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                    styles.input,
                    {
                        color: c.text,
                        borderColor: glass.border,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    },
                ]}
            />
            <Text style={[styles.hint, { color: c.textMuted }]}>
                Stripe USD · New York market · Visa, Mastercard, Amex and other international cards
            </Text>
        </View>
    );
}

export function isValidCardholder(b: CardholderBilling): boolean {
    return b.fullName.trim().length >= 2;
}

const styles = StyleSheet.create({
    wrap: { gap: 8 },
    label: { ...Type.bodySm, fontWeight: '700', marginLeft: 2 },
    input: {
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        fontWeight: '600',
    },
    hint: { ...Type.caption, marginLeft: 2, lineHeight: 16 },
});
