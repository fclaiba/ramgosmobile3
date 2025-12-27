import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

export const Tabs = ({ value, onValueChange, children, style }: any) => {
    // Cloning children to pass props not fully supported elegantly without context, 
    // but for simplicity we will assume children[0] is TabsList matches this pattern
    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { value, onValueChange } as any);
        }
        return child;
    });
    return <View style={style}>{childrenWithProps}</View>;
};

export const TabsList = ({ children, value, onValueChange, style }: any) => {
    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { selectedValue: value, onValueChange } as any);
        }
        return child;
    });
    return <View style={[styles.list, style]}>{childrenWithProps}</View>;
};

export const TabsTrigger = ({ value, selectedValue, onValueChange, children, style }: any) => {
    const isSelected = value === selectedValue;
    return (
        <TouchableOpacity
            onPress={() => onValueChange(value)}
            style={[styles.trigger, isSelected && styles.triggerActive, style]}
        >
            <Text style={[styles.text, isSelected && styles.textActive]}>{children}</Text>
        </TouchableOpacity>
    );
};

export const TabsContent = ({ value, selectedValue, children }: any) => {
    // Not heavily used in the provided code, mostly for logical separation
    if (value !== selectedValue) return null;
    return <View>{children}</View>;
};

const styles = StyleSheet.create({
    list: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        padding: 4,
        borderRadius: 12,
        marginBottom: 16
    },
    trigger: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    triggerActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    text: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500'
    },
    textActive: {
        color: '#000',
        fontWeight: '600'
    }
});
