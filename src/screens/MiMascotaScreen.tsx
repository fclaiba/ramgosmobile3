import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MiMascotaView } from '../components/pet/MiMascotaView';

export default function MiMascotaScreen({ navigation }: any) {
    return (
        <View style={styles.container}>
            <MiMascotaView navigation={navigation} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
});
