import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { CardField } from '@stripe/stripe-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface SecureCardInputProps {
    onValidChange: (isValid: boolean) => void;
}

export const SecureCardInput = ({ onValidChange }: SecureCardInputProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const [isFocused, setIsFocused] = useState(false);

    const activeColor = '#7C3AED'; // Or #4f46e5 depending on the screen, using a common purple
    const borderColor = isFocused ? activeColor : (isDark ? '#374151' : '#E5E7EB');
    const backgroundColor = isDark ? '#1F2937' : '#FFFFFF';
    const textColor = isDark ? '#F9FAFB' : '#111827';
    const placeholderColor = '#9CA3AF';

    return (
        <View style={[
            styles.container,
            {
                borderColor,
                backgroundColor,
            }
        ]}>
            <CardField
                postalCodeEnabled={false}
                placeholders={{
                    number: 'Número de Tarjeta',
                }}
                cardStyle={{
                    backgroundColor,
                    textColor,
                    placeholderColor,
                    cursorColor: activeColor,
                    textErrorColor: '#EF4444',
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
                }}
                style={styles.cardField}
                onCardChange={(cardDetails) => {
                    onValidChange(cardDetails.complete);
                }}
                onFocus={(focusedField) => {
                    setIsFocused(!!focusedField);
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: 56,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        justifyContent: 'center',
    },
    cardField: {
        width: '100%',
        height: '100%',
        padding: 16,
    },
});
