import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { CardField } from '@stripe/stripe-react-native';
import { BlurView } from 'expo-blur';
import { CreditCard, Lock } from 'lucide-react-native';
import { glassTokens } from '../../utils/glass';
import { Radius } from '../../theme/tokens';


interface LiquidCardInputProps {
    isDark: boolean;
    accentColor: string;
    textColor: string;
    mutedColor: string;
    backgroundColor: string;
    borderColor: string;
    onCardChange: (details: any) => void;
}

export function LiquidCardInput({
    isDark,
    accentColor,
    textColor,
    mutedColor,
    backgroundColor,
    borderColor,
    onCardChange
}: LiquidCardInputProps) {
    const glass = glassTokens(isDark);

    const GlassContainer = ({ children, style }: any) =>
        Platform.OS === 'web' ? (
            <View style={[styles.glass, glass as any, style]}>{children}</View>
        ) : (
            <BlurView intensity={isDark ? 30 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.glass, style]}>
                {children}
            </BlurView>
        );

    return (
        <View style={styles.container}>
            <GlassContainer style={[
                styles.glassWrapper,
                {
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.7)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)'
                }
            ]}>
                <View style={styles.header}>
                    <View style={styles.titleRow}>
                        <CreditCard size={18} color={accentColor} />
                        <Text style={[styles.title, { color: textColor }]}>Detalles de la tarjeta</Text>
                    </View>
                    <View style={styles.secureRow}>
                        <Lock size={12} color={mutedColor} />
                        <Text style={[styles.secureText, { color: mutedColor }]}>Pago seguro</Text>
                    </View>
                </View>

                <View style={styles.fieldContainer}>
                    <CardField
                        postalCodeEnabled={false}
                        placeholders={{
                            number: '0000 0000 0000 0000',
                            expiration: 'MM/AA',
                            cvc: 'CVC'
                        }}
                        onCardChange={onCardChange}
                        cardStyle={{
                            backgroundColor: 'transparent',
                            textColor: textColor,
                            placeholderColor: mutedColor,
                            borderColor: 'transparent',
                            borderWidth: 0,
                            borderRadius: 0,
                            fontSize: 16,
                        }}
                        style={styles.cardField}
                    />
                    <View style={[styles.bottomLine, { backgroundColor: borderColor }]} />
                </View>
                <Text style={[styles.hint, { color: mutedColor }]}>
                    Visa, Mastercard o Amex · pago seguro dentro de Ramgos
                </Text>
            </GlassContainer>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 16,
    },
    glass: {
        overflow: 'hidden',
    },
    glassWrapper: {
        borderRadius: Radius.xl,
        borderWidth: 1,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    secureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.04)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: Radius.md,
    },
    secureText: {
        fontSize: 11,
        fontWeight: '500',
    },
    fieldContainer: {
        height: 54,
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.02)',
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        marginBottom: 12,
    },
    cardField: {
        width: '100%',
        height: '100%',
    },
    bottomLine: {
        position: 'absolute',
        bottom: 8,
        left: 12,
        right: 12,
        height: 1,
        opacity: 0.5,
    },
    hint: {
        fontSize: 12,
        textAlign: 'center',
        opacity: 0.8,
    },
});
