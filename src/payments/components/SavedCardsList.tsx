import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export function SavedCardsList({ onSelectCard, selectedCardId }: any) {
    return (
        <View style={{ padding: 16 }}>
            <Text style={{ color: '#6B7280', textAlign: 'center' }}>No tienes tarjetas guardadas.</Text>
        </View>
    );
}