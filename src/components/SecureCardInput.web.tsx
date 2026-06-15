import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { CardElement } from '@stripe/react-stripe-js';
import { useTheme } from '../contexts/ThemeContext';

interface SecureCardInputProps {
    onValidChange: (isValid: boolean) => void;
}

export const SecureCardInput = ({ onValidChange }: SecureCardInputProps) => {
    const { colorScheme } = useTheme();
    const isDark = colorScheme === 'dark';
    const [isFocused, setIsFocused] = useState(false);

    const activeColor = '#7C3AED';
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
            <div style={{ width: '100%', height: '100%', padding: '16px' }}>
                <CardElement
                    options={{
                        hidePostalCode: true,
                        style: {
                            base: {
                                color: textColor,
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontSize: '16px',
                                '::placeholder': {
                                    color: placeholderColor,
                                },
                            },
                            invalid: {
                                color: '#EF4444',
                                iconColor: '#EF4444',
                            },
                        },
                    }}
                    onChange={(event) => {
                        onValidChange(event.complete);
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                />
            </div>
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
});
